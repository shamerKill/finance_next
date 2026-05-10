// ethrpc.go — Production Polygon RPC implementation.
//
// EthClientRPC wraps a go-ethereum *ethclient.Client and implements the
// `RPC` interface via real on-chain calls:
//
//   - USDCBalanceOf  → eth_call USDC.balanceOf(addr) + USDC.allowance(addr, CTF)
//   - CTFBalances    → returns empty (subgraph integration is a future PR;
//                      we deliberately don't fake this — operators should
//                      query Polymarket's data API for outcome positions).
//   - ApproveUSDC    → builds + signs + sends USDC.approve(CTF, amount),
//                      then polls eth_getTransactionReceipt for ≤60s.
//
// The minimal ABI is embedded as a constant string so we don't pull a
// multi-MB JSON file. We only encode `balanceOf(address)`, `allowance(
// address,address)` and `approve(address,uint256)` — every other USDC /
// ERC-20 method is irrelevant to Phase 9.
//
// All tests stay offline: the test exercises a fake JSON-RPC server via
// httptest.NewServer that responds to eth_chainId / eth_call /
// eth_sendRawTransaction / eth_getTransactionReceipt. The signer path
// is exercised end-to-end (build → sign → encode → send → receipt).
package polygon

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// erc20MinABI is the JSON ABI fragment containing exactly the three
// methods we need from USDC. Keeping this as a string constant avoids
// pulling the full OpenZeppelin ABI; every byte here is auditable.
const erc20MinABI = `[
  {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
]`

// PolygonChainID is Polygon mainnet's chainId (137). EthClientRPC
// ignores the on-chain ChainID() result when this is hard-pinned via
// the constructor; tests can pass `0` to defer to ChainID() lookup.
const PolygonChainID int64 = 137

// approveGasLimit is the static gas limit for an ERC-20 approve.
// USDC.approve consistently fits well under 60k; we pad to 100k.
const approveGasLimit uint64 = 100_000

// ApproveReceiptTimeout bounds the tx-receipt poll loop.
var ApproveReceiptTimeout = 60 * time.Second

// receiptPollInterval is how often EthClientRPC re-asks for a receipt.
var receiptPollInterval = 1 * time.Second

// ErrApproveTxReverted is returned when the approve tx mined but its
// receipt status was 0 (EVM revert). Caller should NOT retry blindly —
// USDC may be paused or the spender may be blacklisted.
var ErrApproveTxReverted = errors.New("polygon: approve tx reverted on-chain")

// ErrApproveReceiptTimeout is returned when 60s elapsed without a
// receipt. The tx may still mine later — caller should check by hash.
var ErrApproveReceiptTimeout = errors.New("polygon: approve tx receipt timeout (tx may still mine)")

// EthClient is the slim subset of ethclient.Client we use. Defining it
// here lets the test inject a mock without standing up the full RPC
// transport when only a couple of behaviours need exercising.
type EthClient interface {
	ChainID(ctx context.Context) (*big.Int, error)
	PendingNonceAt(ctx context.Context, account common.Address) (uint64, error)
	SuggestGasPrice(ctx context.Context) (*big.Int, error)
	CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error)
	SendTransaction(ctx context.Context, tx *types.Transaction) error
	TransactionReceipt(ctx context.Context, txHash common.Hash) (*types.Receipt, error)
	Close()
}

// EthClientRPC is the production RPC implementation backed by a real
// Polygon JSON-RPC endpoint.
type EthClientRPC struct {
	cli         EthClient
	usdcAddr    common.Address
	spenderAddr common.Address
	abi         abi.ABI
	chainID     *big.Int // pinned at construction; nil = look up via ChainID()
	log         *slog.Logger
}

// NewEthClientRPC dials the JSON-RPC endpoint, verifies the chainId
// matches Polygon mainnet (137), and returns a wired-up RPC.
//
// On any setup error the caller should fall back to NoopRPC and log a
// warning — booting the gateway without RPC is supported (the wallet
// approve endpoint will return ErrRPCNotConfigured cleanly).
func NewEthClientRPC(ctx context.Context, rpcURL string, log *slog.Logger) (*EthClientRPC, error) {
	if log == nil {
		log = slog.Default()
	}
	if strings.TrimSpace(rpcURL) == "" {
		return nil, fmt.Errorf("polygon: empty rpc url")
	}
	cli, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("polygon: dial %s: %w", rpcURL, err)
	}
	parsedABI, err := abi.JSON(strings.NewReader(erc20MinABI))
	if err != nil {
		cli.Close()
		return nil, fmt.Errorf("polygon: parse minimal ABI: %w", err)
	}
	r := &EthClientRPC{
		cli:         cli,
		usdcAddr:    common.HexToAddress(USDCAddress),
		spenderAddr: common.HexToAddress(CTFExchangeAddress),
		abi:         parsedABI,
		log:         log,
	}
	// Best-effort chain id check. We don't fail the dial if the chainId
	// can't be fetched — testnets and forks are valid targets, and the
	// signer falls back to the latest signer for whatever id the node
	// reports at sign time.
	if id, idErr := cli.ChainID(ctx); idErr == nil {
		r.chainID = id
		if id.Int64() != PolygonChainID {
			log.Warn("polygon: connected to non-mainnet chain", "chainId", id.String(),
				"expected", PolygonChainID, "url", rpcURL)
		}
	} else {
		log.Warn("polygon: chainId lookup failed; will retry per-call", "err", idErr)
	}
	return r, nil
}

// newEthClientRPCWithClient is a test seam — wraps an injected EthClient.
// Production callers should always go through NewEthClientRPC.
func newEthClientRPCWithClient(cli EthClient, chainID *big.Int) *EthClientRPC {
	parsedABI, _ := abi.JSON(strings.NewReader(erc20MinABI))
	return &EthClientRPC{
		cli:         cli,
		usdcAddr:    common.HexToAddress(USDCAddress),
		spenderAddr: common.HexToAddress(CTFExchangeAddress),
		abi:         parsedABI,
		chainID:     chainID,
		log:         slog.Default(),
	}
}

// USDCBalanceOf eth_calls USDC.balanceOf(addr) and USDC.allowance(addr,
// CTFExchange). Both return atomic-units (1e6-scaled) which we convert
// back to human USDC for the cached-balance struct.
func (r *EthClientRPC) USDCBalanceOf(ctx context.Context, walletAddress string) (CachedBalance, error) {
	if !common.IsHexAddress(walletAddress) {
		return CachedBalance{}, fmt.Errorf("polygon: invalid wallet address %q", walletAddress)
	}
	owner := common.HexToAddress(walletAddress)

	balData, err := r.abi.Pack("balanceOf", owner)
	if err != nil {
		return CachedBalance{}, fmt.Errorf("polygon: pack balanceOf: %w", err)
	}
	balRaw, err := r.cli.CallContract(ctx, ethereum.CallMsg{To: &r.usdcAddr, Data: balData}, nil)
	if err != nil {
		return CachedBalance{}, fmt.Errorf("polygon: balanceOf call: %w", err)
	}
	balAtomic := new(big.Int).SetBytes(balRaw)

	allowData, err := r.abi.Pack("allowance", owner, r.spenderAddr)
	if err != nil {
		return CachedBalance{}, fmt.Errorf("polygon: pack allowance: %w", err)
	}
	allowRaw, err := r.cli.CallContract(ctx, ethereum.CallMsg{To: &r.usdcAddr, Data: allowData}, nil)
	if err != nil {
		return CachedBalance{}, fmt.Errorf("polygon: allowance call: %w", err)
	}
	allowAtomic := new(big.Int).SetBytes(allowRaw)

	return CachedBalance{
		BalanceUsdc:   atomicBigToUSDC(balAtomic),
		AllowanceUsdc: atomicBigToUSDC(allowAtomic),
		FetchedAt:     time.Now().UTC(),
	}, nil
}

// CTFBalances is a no-op for the EVM-only RPC client. Outcome-token
// balances live in Polymarket's subgraph / data API; trying to enumerate
// every minted ERC-1155 id via on-chain calls is not feasible. We
// return an empty slice with no error so the handler responds 200 with
// `[]`. A future PR can swap to the subgraph; the interface allows it.
func (r *EthClientRPC) CTFBalances(ctx context.Context, walletAddress string) ([]Position, error) {
	if !common.IsHexAddress(walletAddress) {
		return nil, fmt.Errorf("polygon: invalid wallet address %q", walletAddress)
	}
	return []Position{}, nil
}

// ApproveUSDC builds + signs + sends approve(CTFExchange, amount) and
// waits up to ApproveReceiptTimeout for the receipt.
//
// IMPORTANT: this method does NOT validate the amount cap — that's the
// caller's job (handlers/wallet.go::approve uses
// walletpkg.ValidateApproveAmount before invoking us). We treat the
// passed amount as already-vetted.
func (r *EthClientRPC) ApproveUSDC(ctx context.Context, walletPrivateKeyHex string, amountUsdc float64) (string, error) {
	pk, err := PrivateKeyFromHex(walletPrivateKeyHex)
	if err != nil {
		return "", err
	}
	from := ethcrypto.PubkeyToAddress(pk.PublicKey)

	// Resolve chainID. Pinned at construction by default; otherwise
	// re-ask the node every call (covers test seams that deferred it).
	chainID := r.chainID
	if chainID == nil {
		id, idErr := r.cli.ChainID(ctx)
		if idErr != nil {
			return "", fmt.Errorf("polygon: chainId: %w", idErr)
		}
		chainID = id
	}

	nonce, err := r.cli.PendingNonceAt(ctx, from)
	if err != nil {
		return "", fmt.Errorf("polygon: nonce: %w", err)
	}
	gasPrice, err := r.cli.SuggestGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("polygon: gas price: %w", err)
	}

	// Convert USDC (6 decimals) to atomic units. We use big.Int math
	// to handle the full uint256 range safely; a 6-decimal float is
	// fine for the conversion since cap is bounded by
	// portfolio_limits.maxOpenNotionalUsd which is enforced before us.
	atomic := new(big.Int).SetUint64(USDCToAtomic(amountUsdc))

	data, err := r.abi.Pack("approve", r.spenderAddr, atomic)
	if err != nil {
		return "", fmt.Errorf("polygon: pack approve: %w", err)
	}

	// Legacy tx — Polygon supports EIP-1559 but the JSON-RPC node
	// reports SuggestGasPrice as the median historical gasPrice which
	// the legacy fee model honours. Less surface area than DynamicFeeTx
	// for this single call.
	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &r.usdcAddr,
		Value:    big.NewInt(0),
		Gas:      approveGasLimit,
		GasPrice: gasPrice,
		Data:     data,
	})
	signed, err := types.SignTx(tx, types.LatestSignerForChainID(chainID), pk)
	if err != nil {
		return "", fmt.Errorf("polygon: sign approve tx: %w", err)
	}
	if err := r.cli.SendTransaction(ctx, signed); err != nil {
		return "", fmt.Errorf("polygon: send approve tx: %w", err)
	}

	hash := signed.Hash()
	r.log.Info("polygon: approve tx submitted",
		"hash", hash.Hex(), "from", from.Hex(), "spender", r.spenderAddr.Hex(),
		"amountUsdc", amountUsdc, "amountAtomic", atomic.String())

	// Poll for receipt up to ApproveReceiptTimeout.
	deadline := time.Now().Add(ApproveReceiptTimeout)
	for {
		rcpt, recErr := r.cli.TransactionReceipt(ctx, hash)
		if recErr == nil && rcpt != nil {
			if rcpt.Status == types.ReceiptStatusSuccessful {
				return hash.Hex(), nil
			}
			return hash.Hex(), ErrApproveTxReverted
		}
		// Errors here are commonly "not found" while pending — only
		// surface real RPC transport errors.
		if recErr != nil && !isReceiptNotFoundError(recErr) {
			return hash.Hex(), fmt.Errorf("polygon: receipt poll: %w", recErr)
		}
		if time.Now().After(deadline) {
			return hash.Hex(), ErrApproveReceiptTimeout
		}
		select {
		case <-ctx.Done():
			return hash.Hex(), ctx.Err()
		case <-time.After(receiptPollInterval):
		}
	}
}

// Close releases the underlying RPC connection.
func (r *EthClientRPC) Close() error {
	if r.cli != nil {
		r.cli.Close()
	}
	return nil
}

// isReceiptNotFoundError matches the "not found" error string returned
// by the JSON-RPC layer while the tx is still pending. We compare on
// substring rather than identity since the wrapping varies between
// ethclient releases.
func isReceiptNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ethereum.NotFound) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "not found")
}

// atomicBigToUSDC scales a big.Int (atomic 6-decimal units) to a float
// USDC value. Loss of precision past 1e15 USDC is acceptable; the
// portfolio cap is orders of magnitude lower.
func atomicBigToUSDC(atomic *big.Int) float64 {
	if atomic == nil {
		return 0
	}
	// Use big.Float for the divide to avoid intermediate overflow.
	f := new(big.Float).SetInt(atomic)
	f.Quo(f, big.NewFloat(1_000_000))
	out, _ := f.Float64()
	return out
}
