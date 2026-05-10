// ethrpc_test.go — offline tests for EthClientRPC.
//
// We exercise two strategies:
//   1. A fakeEthClient injected via newEthClientRPCWithClient — covers
//      the happy path + revert path + receipt-timeout path without any
//      JSON-RPC encoding noise.
//   2. A httptest.NewServer that serves a minimal JSON-RPC subset —
//      covers NewEthClientRPC's dial + chainId checks against the real
//      transport so we know the production constructor doesn't fail
//      on a healthy endpoint.
//
// Both stay strictly offline; no network calls leave the test process.
package polygon

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// ---- fakeEthClient ----------------------------------------------------

type fakeEthClient struct {
	chainID    *big.Int
	nonce      uint64
	gasPrice   *big.Int
	balance    *big.Int
	allowance  *big.Int
	sendErr    error
	receipt    *types.Receipt
	receiptErr error
	// timesReceiptAsked counts how many times TransactionReceipt was
	// called — lets the receipt-timeout test verify we polled.
	timesReceiptAsked atomic.Int32
	sentTxHash        common.Hash
	closed            bool
}

func (f *fakeEthClient) ChainID(context.Context) (*big.Int, error) {
	if f.chainID == nil {
		return big.NewInt(137), nil
	}
	return f.chainID, nil
}
func (f *fakeEthClient) PendingNonceAt(context.Context, common.Address) (uint64, error) {
	return f.nonce, nil
}
func (f *fakeEthClient) SuggestGasPrice(context.Context) (*big.Int, error) {
	if f.gasPrice == nil {
		return big.NewInt(30_000_000_000), nil // 30 gwei
	}
	return f.gasPrice, nil
}
func (f *fakeEthClient) CallContract(_ context.Context, msg ethereum.CallMsg, _ *big.Int) ([]byte, error) {
	// Distinguish balanceOf vs allowance by the 4-byte selector.
	if len(msg.Data) < 4 {
		return nil, errors.New("data too short")
	}
	selector := hex.EncodeToString(msg.Data[:4])
	switch selector {
	case "70a08231": // balanceOf(address)
		return leftPad32(f.balance.Bytes()), nil
	case "dd62ed3e": // allowance(address,address)
		return leftPad32(f.allowance.Bytes()), nil
	default:
		return nil, errors.New("unknown selector " + selector)
	}
}
func (f *fakeEthClient) SendTransaction(_ context.Context, tx *types.Transaction) error {
	if f.sendErr != nil {
		return f.sendErr
	}
	f.sentTxHash = tx.Hash()
	return nil
}
func (f *fakeEthClient) TransactionReceipt(_ context.Context, _ common.Hash) (*types.Receipt, error) {
	f.timesReceiptAsked.Add(1)
	if f.receiptErr != nil {
		return nil, f.receiptErr
	}
	return f.receipt, nil
}
func (f *fakeEthClient) Close() { f.closed = true }

// ---- USDCBalanceOf happy path ----------------------------------------

func TestEthClientRPC_USDCBalanceOf(t *testing.T) {
	fake := &fakeEthClient{
		balance:   new(big.Int).SetUint64(1_500_000), // 1.5 USDC
		allowance: new(big.Int).SetUint64(2_000_000), // 2.0 USDC
	}
	r := newEthClientRPCWithClient(fake, big.NewInt(137))
	bal, err := r.USDCBalanceOf(context.Background(), "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
	if err != nil {
		t.Fatalf("USDCBalanceOf: %v", err)
	}
	if bal.BalanceUsdc != 1.5 {
		t.Errorf("balance: got %v want 1.5", bal.BalanceUsdc)
	}
	if bal.AllowanceUsdc != 2.0 {
		t.Errorf("allowance: got %v want 2.0", bal.AllowanceUsdc)
	}
}

func TestEthClientRPC_USDCBalanceOf_InvalidAddr(t *testing.T) {
	r := newEthClientRPCWithClient(&fakeEthClient{}, big.NewInt(137))
	if _, err := r.USDCBalanceOf(context.Background(), "0xnope"); err == nil {
		t.Fatal("expected invalid-address error")
	}
}

// ---- ApproveUSDC happy path ------------------------------------------

func TestEthClientRPC_ApproveUSDC_Success(t *testing.T) {
	fake := &fakeEthClient{
		nonce:    7,
		gasPrice: big.NewInt(30_000_000_000),
		receipt: &types.Receipt{
			Status: types.ReceiptStatusSuccessful,
		},
	}
	// shorten poll for tests
	prev := receiptPollInterval
	receiptPollInterval = 5 * time.Millisecond
	defer func() { receiptPollInterval = prev }()

	r := newEthClientRPCWithClient(fake, big.NewInt(137))
	tx, err := r.ApproveUSDC(context.Background(), testPrivateKey, 100)
	if err != nil {
		t.Fatalf("ApproveUSDC: %v", err)
	}
	if !strings.HasPrefix(tx, "0x") || len(tx) != 66 {
		t.Errorf("tx hash shape: %s", tx)
	}
	if fake.sentTxHash != (common.Hash{}) && tx != fake.sentTxHash.Hex() {
		t.Errorf("returned tx hash != sent tx hash: %s vs %s", tx, fake.sentTxHash.Hex())
	}
}

// ---- ApproveUSDC reverted --------------------------------------------

func TestEthClientRPC_ApproveUSDC_Reverted(t *testing.T) {
	fake := &fakeEthClient{
		nonce:    1,
		gasPrice: big.NewInt(30_000_000_000),
		receipt: &types.Receipt{
			Status: types.ReceiptStatusFailed,
		},
	}
	prev := receiptPollInterval
	receiptPollInterval = 5 * time.Millisecond
	defer func() { receiptPollInterval = prev }()

	r := newEthClientRPCWithClient(fake, big.NewInt(137))
	_, err := r.ApproveUSDC(context.Background(), testPrivateKey, 50)
	if !errors.Is(err, ErrApproveTxReverted) {
		t.Fatalf("expected ErrApproveTxReverted, got %v", err)
	}
}

// ---- ApproveUSDC receipt timeout -------------------------------------

func TestEthClientRPC_ApproveUSDC_ReceiptTimeout(t *testing.T) {
	fake := &fakeEthClient{
		nonce:      1,
		gasPrice:   big.NewInt(30_000_000_000),
		receiptErr: ethereum.NotFound,
	}
	prev := receiptPollInterval
	prevTimeout := ApproveReceiptTimeout
	receiptPollInterval = 5 * time.Millisecond
	ApproveReceiptTimeout = 30 * time.Millisecond
	defer func() {
		receiptPollInterval = prev
		ApproveReceiptTimeout = prevTimeout
	}()

	r := newEthClientRPCWithClient(fake, big.NewInt(137))
	_, err := r.ApproveUSDC(context.Background(), testPrivateKey, 25)
	if !errors.Is(err, ErrApproveReceiptTimeout) {
		t.Fatalf("expected ErrApproveReceiptTimeout, got %v", err)
	}
	if fake.timesReceiptAsked.Load() < 2 {
		t.Errorf("expected multiple receipt polls, got %d", fake.timesReceiptAsked.Load())
	}
}

// ---- ApproveUSDC bad private key -------------------------------------

func TestEthClientRPC_ApproveUSDC_BadKey(t *testing.T) {
	r := newEthClientRPCWithClient(&fakeEthClient{}, big.NewInt(137))
	if _, err := r.ApproveUSDC(context.Background(), "deadbeef", 1); err == nil {
		t.Fatal("expected bad-key error")
	}
}

// ---- CTFBalances stub --------------------------------------------------

func TestEthClientRPC_CTFBalances_EmptyByDesign(t *testing.T) {
	r := newEthClientRPCWithClient(&fakeEthClient{}, big.NewInt(137))
	pos, err := r.CTFBalances(context.Background(), "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
	if err != nil {
		t.Fatalf("CTFBalances: %v", err)
	}
	if len(pos) != 0 {
		t.Fatalf("expected empty positions slice, got %d", len(pos))
	}
}

// ---- NewEthClientRPC over httptest JSON-RPC --------------------------

// fakeJSONRPCServer fakes the minimum of a Polygon JSON-RPC node so we
// can exercise the full ethclient.DialContext path. Only handles the
// methods NewEthClientRPC + ChainID call at construction.
func fakeJSONRPCServer(t *testing.T, chainIDHex string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		var msg struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		_ = json.Unmarshal(body, &msg)
		w.Header().Set("Content-Type", "application/json")
		switch msg.Method {
		case "eth_chainId":
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":` + string(msg.ID) + `,"result":"` + chainIDHex + `"}`))
		default:
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":` + string(msg.ID) + `,"error":{"code":-32601,"message":"unsupported"}}`))
		}
	}))
}

func TestNewEthClientRPC_DialAndChainID(t *testing.T) {
	srv := fakeJSONRPCServer(t, "0x89") // 137
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r, err := NewEthClientRPC(ctx, srv.URL, nil)
	if err != nil {
		t.Fatalf("NewEthClientRPC: %v", err)
	}
	defer r.Close()
	if r.chainID == nil || r.chainID.Int64() != 137 {
		t.Errorf("chainID: got %v, want 137", r.chainID)
	}
}

func TestNewEthClientRPC_EmptyURL(t *testing.T) {
	if _, err := NewEthClientRPC(context.Background(), "", nil); err == nil {
		t.Fatal("expected error for empty URL")
	}
}

// Wiring sanity: EthClientRPC implements RPC.
var _ RPC = (*EthClientRPC)(nil)

// leftPad32 left-pads b to exactly 32 bytes for ABI uint256 returns.
func leftPad32(b []byte) []byte {
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}
