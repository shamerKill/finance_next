// rpc.go — Polygon RPC client wrapper.
//
// We deliberately keep this tiny: balanceOf + allowance + a stubbed
// approve. The full ethclient wiring (eth_sendRawTransaction,
// nonce-management, gas-estimation, receipt-polling) is out of scope
// for the audit-loop tests in this PR; the production order engine
// path uses CTF Exchange operator orders rather than direct on-chain
// txs anyway. Approve IS on-chain and is the operator-facing surface
// — but we hide it behind an interface so the unit tests don't have
// to dial a real node.
//
// The PUBLIC interface (RPC) is what handlers consume; concrete
// implementation can be swapped to a real ethclient.Client in
// production by injecting via the ClientFactory.
package polygon

import (
	"context"
	"errors"
	"sync"
	"time"
)

// DefaultRPCURL is the free public Polygon mainnet RPC. Production
// deployments should override via `POLYGON_RPC_URL` to an Alchemy /
// Infura endpoint with a real rate limit.
const DefaultRPCURL = "https://polygon-rpc.com"

// RPC is the slim interface wallet handlers consume. Tests inject a
// fake; production binds an ethclient-backed implementation.
type RPC interface {
	// USDCBalanceOf returns the wallet's USDC balance + current
	// allowance for the CTF Exchange spender.
	USDCBalanceOf(ctx context.Context, walletAddress string) (CachedBalance, error)
	// CTFBalances returns the outcome-token balances for the wallet.
	// Empty slice when none. The Polymarket subgraph is the canonical
	// source; concrete impl can call it.
	CTFBalances(ctx context.Context, walletAddress string) ([]Position, error)
	// ApproveUSDC submits an `approve(spender=CTFExchange, amount)`
	// transaction against USDC. Returns the tx hash on success.
	// Caller is responsible for caps + bounded amount validation —
	// this method NEVER refuses on its own.
	ApproveUSDC(ctx context.Context, walletPrivateKeyHex string, amountUsdc float64) (string, error)
	// Close releases any underlying resources (open HTTP/2 conns).
	Close() error
}

// ErrRPCNotConfigured is returned when handlers were wired without an
// RPC backend (env wasn't set; we 503 cleanly rather than crash).
var ErrRPCNotConfigured = errors.New("polygon: RPC not configured")

// NoopRPC is the zero-value implementation used when POLYGON_RPC_URL
// isn't set. Every method returns ErrRPCNotConfigured. The HTTP
// handlers swap this for a real client at boot when the env is set.
type NoopRPC struct{}

// USDCBalanceOf always errors.
func (NoopRPC) USDCBalanceOf(context.Context, string) (CachedBalance, error) {
	return CachedBalance{}, ErrRPCNotConfigured
}

// CTFBalances always errors.
func (NoopRPC) CTFBalances(context.Context, string) ([]Position, error) {
	return nil, ErrRPCNotConfigured
}

// ApproveUSDC always errors.
func (NoopRPC) ApproveUSDC(context.Context, string, float64) (string, error) {
	return "", ErrRPCNotConfigured
}

// Close is a no-op.
func (NoopRPC) Close() error { return nil }

// MemoryRPC is a deterministic in-memory implementation used by tests.
// It accepts arbitrary balance / allowance / position inputs and
// records ApproveUSDC calls so assertions can verify the bounded
// approve contract. Safe for concurrent use.
type MemoryRPC struct {
	mu         sync.Mutex
	Balance    float64
	Allowance  float64
	Positions  []Position
	Approves   []ApproveCall
	ApproveErr error
}

// ApproveCall records one ApproveUSDC invocation.
type ApproveCall struct {
	PrivateKey string
	Amount     float64
	At         time.Time
}

// USDCBalanceOf returns the in-memory balance.
func (m *MemoryRPC) USDCBalanceOf(_ context.Context, _ string) (CachedBalance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return CachedBalance{
		BalanceUsdc:   m.Balance,
		AllowanceUsdc: m.Allowance,
		FetchedAt:     time.Now().UTC(),
	}, nil
}

// CTFBalances returns the in-memory positions (a copy).
func (m *MemoryRPC) CTFBalances(_ context.Context, _ string) ([]Position, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Position, len(m.Positions))
	copy(out, m.Positions)
	return out, nil
}

// ApproveUSDC records the call and returns a synthetic tx hash. When
// ApproveErr is non-nil, returns it instead.
func (m *MemoryRPC) ApproveUSDC(_ context.Context, privKey string, amount float64) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ApproveErr != nil {
		return "", m.ApproveErr
	}
	m.Approves = append(m.Approves, ApproveCall{
		PrivateKey: privKey,
		Amount:     amount,
		At:         time.Now().UTC(),
	})
	m.Allowance = amount
	return "0xtest_tx_hash", nil
}

// Close is a no-op.
func (m *MemoryRPC) Close() error { return nil }
