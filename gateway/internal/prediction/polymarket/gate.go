// gate.go — Polymarket 3-gate guard.
//
// Mirrors the Binance mainnet gate (Phase 4): three switches all required
// to even attempt an order:
//
//   1. strategy.live.mode == "mainnet" (per-strategy)
//   2. POLYMARKET_TRADING_ENABLED=true env var (process-wide)
//   3. admin token confirmed via the shared TokenStore (1h window)
//
// (3) is the same TokenStore the Binance gate uses — Phase 9 explicitly
// reuses the singleton in `gateway/internal/orderengine` so opening
// mainnet for one venue opens it for all. Operators get exactly one
// "I really mean it" surface.
package polymarket

import (
	"errors"

	"github.com/finance_next/gateway/internal/domain"
)

// Gate decides whether mainnet calls are permitted at this instant.
// Implementations must return false unless ALL three switches are open.
type Gate interface {
	// Allowed reports the mainnet gate state. Called on every order
	// attempt — confirm-token expiry mid-session immediately closes.
	Allowed() bool
	// EnvEnabled mirrors the env-var snapshot taken at process start.
	// Useful for the admin status panel.
	EnvEnabled() bool
}

// GateFunc adapts a plain function pair into a Gate.
type GateFunc struct {
	AllowedFn    func() bool
	EnvEnabledFn func() bool
}

// Allowed implements Gate.
func (g GateFunc) Allowed() bool {
	if g.AllowedFn == nil {
		return false
	}
	return g.AllowedFn()
}

// EnvEnabled implements Gate.
func (g GateFunc) EnvEnabled() bool {
	if g.EnvEnabledFn == nil {
		return false
	}
	return g.EnvEnabledFn()
}

// AlwaysDenyGate is the safe default — no mainnet, ever.
var AlwaysDenyGate Gate = GateFunc{}

// ErrMainnetGateDenied is returned when an order would target mainnet
// but the gate refuses (env unset or no confirm token). Equal-test
// against this sentinel rather than wrapping in another package's err.
var ErrMainnetGateDenied = errors.New("polymarket: mainnet trading not enabled (env + confirm token required)")

// ErrEnvDisabled is returned when POLYMARKET_TRADING_ENABLED is unset.
// Distinguishes from "env set but no confirm token" (caller-relevant).
var ErrEnvDisabled = errors.New("polymarket: POLYMARKET_TRADING_ENABLED env not true")

// CheckGate returns nil when the gate passes for the given strategy
// LiveMode, ErrMainnetGateDenied otherwise. Phase 4 places this in the
// adapter; Phase 9 places it in the engine — same contract.
func CheckGate(g Gate, mode domain.LiveMode) error {
	if g == nil {
		return ErrMainnetGateDenied
	}
	if mode != domain.LiveModeMainnet {
		// There is no Polymarket testnet — non-mainnet mode means the
		// strategy is paused / not configured for live execution.
		return ErrMainnetGateDenied
	}
	if !g.EnvEnabled() {
		return ErrEnvDisabled
	}
	if !g.Allowed() {
		return ErrMainnetGateDenied
	}
	return nil
}
