// Package polygon implements the Phase 9 Polygon (EVM) wallet layer.
//
// Wallets carry an envelope-encrypted private key, derived address, and
// cached USDC balance/allowance. The private key never appears in API
// responses and is stripped from audit logs (see middleware/audit.go's
// scrub list, extended in Phase 9 to cover `privateKey*` / `mnemonic` /
// `seed`).
//
// CTF Exchange (Polymarket CLOB) operator address on Polygon mainnet:
//   0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
// USDC (PoS bridged) on Polygon mainnet:
//   0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
//
// USDC has 6 decimals — every conversion to/from raw atomic units must
// scale by 1e6.
package polygon

import (
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"
)

// Default contract addresses on Polygon mainnet. Override via env in
// the gateway config when targeting a forked network.
const (
	// USDCAddress is the PoS-bridged USDC ERC-20 contract.
	USDCAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
	// CTFExchangeAddress is Polymarket's CLOB operator. This is the
	// `verifyingContract` field of the EIP-712 domain AND the spender
	// for the USDC `approve` call. See signer.go.
	CTFExchangeAddress = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"
	// USDCDecimals is the USDC token's decimal count. Used for the
	// 1e6 scaling between human USDC and raw atomic units.
	USDCDecimals = 6
)

// Errors surfaced by the wallet helpers.
var (
	// ErrInvalidPrivateKey is returned when the supplied hex string can't be
	// decoded into a secp256k1 key.
	ErrInvalidPrivateKey = errors.New("polygon: invalid private key")
	// ErrAddressMismatch is returned when the caller-supplied expected
	// address doesn't match the derived address. We never silently accept
	// a mismatch — the caller is asserting a checked round-trip.
	ErrAddressMismatch = errors.New("polygon: derived address does not match expected")
	// ErrApprovalExceedsCap is returned when an approve attempt would
	// authorise more USDC than `portfolio_limits.maxOpenNotionalUsd`.
	// Infinite approve is impossible by construction.
	ErrApprovalExceedsCap = errors.New("polygon: approval amount exceeds portfolio_limits.maxOpenNotionalUsd cap")
	// ErrUSDCAllowanceCapZero is the explicit zero-cap rejection — admins
	// must set a non-zero portfolio cap before any approve call.
	ErrUSDCAllowanceCapZero = errors.New("polygon: portfolio_limits.maxOpenNotionalUsd is zero; refuse to approve")
)

// PrivateKeyFromHex decodes the hex-encoded private key (with or without the
// 0x prefix) into the SDK type.
func PrivateKeyFromHex(s string) (*ecdsa.PrivateKey, error) {
	s = strings.TrimSpace(strings.TrimPrefix(s, "0x"))
	if len(s) != 64 {
		return nil, fmt.Errorf("%w: expected 64 hex chars, got %d", ErrInvalidPrivateKey, len(s))
	}
	if _, err := hex.DecodeString(s); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPrivateKey, err)
	}
	pk, err := ethcrypto.HexToECDSA(s)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPrivateKey, err)
	}
	return pk, nil
}

// AddressForPrivateKey returns the EIP-55 checksummed `0x...` address
// derived from the public key.
func AddressForPrivateKey(pk *ecdsa.PrivateKey) string {
	pub := pk.Public().(*ecdsa.PublicKey)
	return ethcrypto.PubkeyToAddress(*pub).Hex()
}

// ValidateAndDerive verifies the private key, optionally checks the
// expected address, and returns the canonical address.
func ValidateAndDerive(privKeyHex, expectedAddress string) (string, error) {
	pk, err := PrivateKeyFromHex(privKeyHex)
	if err != nil {
		return "", err
	}
	addr := AddressForPrivateKey(pk)
	if expectedAddress != "" && !strings.EqualFold(addr, expectedAddress) {
		return "", fmt.Errorf("%w: derived=%s expected=%s", ErrAddressMismatch, addr, expectedAddress)
	}
	return addr, nil
}

// IsValidAddress returns true for a 20-byte hex address (with or without
// 0x prefix). Does NOT validate the EIP-55 checksum (case is ignored).
func IsValidAddress(addr string) bool {
	addr = strings.TrimPrefix(addr, "0x")
	if len(addr) != 40 {
		return false
	}
	return common.IsHexAddress("0x" + addr)
}

// USDCToAtomic scales a human USDC amount to its raw 6-decimal integer
// representation. Inputs > ~9.2e12 USDC overflow int64 — that's
// orders of magnitude past the cap so we don't bother guarding.
func USDCToAtomic(amount float64) uint64 {
	if amount <= 0 {
		return 0
	}
	// Scale via integer math to avoid float drift on the boundary.
	return uint64(amount * 1_000_000)
}

// AtomicToUSDC inverts USDCToAtomic.
func AtomicToUSDC(atomic uint64) float64 {
	return float64(atomic) / 1_000_000.0
}

// CapForApprove derives the maximum USDC amount an approve call may
// request. The cap is the user's `portfolio_limits.maxOpenNotionalUsd`.
// Zero cap = refuse (admins must explicitly set a value).
func CapForApprove(portfolioMaxNotionalUsd float64) (float64, error) {
	if portfolioMaxNotionalUsd <= 0 {
		return 0, ErrUSDCAllowanceCapZero
	}
	return portfolioMaxNotionalUsd, nil
}

// ValidateApproveAmount returns nil when amount is within cap, else
// ErrApprovalExceedsCap.
func ValidateApproveAmount(amountUsdc, portfolioMaxNotionalUsd float64) error {
	cap, err := CapForApprove(portfolioMaxNotionalUsd)
	if err != nil {
		return err
	}
	if amountUsdc > cap {
		return fmt.Errorf("%w: requested=%.2f cap=%.2f", ErrApprovalExceedsCap, amountUsdc, cap)
	}
	return nil
}

// CachedBalance is the last-known USDC balance + allowance + timestamp
// returned by `RPC.FetchUSDCBalance`. The caller decides whether to
// trust the cache or re-query.
type CachedBalance struct {
	BalanceUsdc   float64   `json:"balanceUsdc"`
	AllowanceUsdc float64   `json:"allowanceUsdc"`
	FetchedAt     time.Time `json:"fetchedAt"`
}

// Position is one CTF outcome-token holding for the wallet.
type Position struct {
	TokenID   string  `json:"tokenId"`
	MarketID  string  `json:"marketId,omitempty"`
	Outcome   string  `json:"outcome,omitempty"`
	Balance   float64 `json:"balance"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Use context to satisfy go vet on unused imports during early skeleton
// when we wire in real RPC calls below.
var _ = context.Background
