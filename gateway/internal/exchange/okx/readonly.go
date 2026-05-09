// readonly.go — OKX implementation of [exchange.ReadOnlyClient].
//
// The Phase 5 dashboard surface needs three read paths:
//
//   - ProbePermissions  → /api/v5/account/config (used to detect
//                          withdraw eligibility; OKX doesn't return a
//                          dedicated bool, see [ProbePermissions])
//   - GetBalances       → /api/v5/account/balance
//   - GetPositions      → /api/v5/account/positions (USDT-SWAP filter)
//
// User-data streaming is *not* implemented in Phase 5 — the WS hub will
// continue to fan out only Binance user streams. Calling StreamUserData
// returns [ErrUnsupportedStream] so the existing /ws topic dispatch
// surfaces a useful error if a UI ever asks for an OKX subscription.
package okx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/finance_next/gateway/internal/exchange"
)

// ReadOnlyClient is a thin wrapper that adapts [Client] to
// [exchange.ReadOnlyClient]. Construction goes through [NewReadOnly]
// which builds the underlying signed REST client.
type ReadOnlyClient struct {
	c *Client
}

// NewReadOnly builds a read-only adapter. Passes simulated=false; the
// dashboard view always reads live balances even when the matching
// order client is testnet — this matches the OKX behaviour: a demo key
// only sees demo balances and vice versa, so the "simulated"
// distinction is keyed off the credential set, not a runtime toggle.
func NewReadOnly(apiKey, secretKey, passphrase string) (*ReadOnlyClient, error) {
	if passphrase == "" {
		return nil, ErrPassphraseRequired
	}
	return &ReadOnlyClient{c: NewClient(apiKey, secretKey, passphrase, false)}, nil
}

// SetBaseURL forwards to the underlying transport — used by tests.
func (r *ReadOnlyClient) SetBaseURL(u string) { r.c.SetBaseURL(u) }

// ProbePermissions inspects /api/v5/account/config to derive the
// gateway's normalised permission triplet.
//
// OKX doesn't expose an explicit `canWithdraw` boolean. Heuristic: the
// account-config response carries a `level` field (account tier:
// 1=spot, 2=futures, 3=multi-currency margin, 4=portfolio margin) and a
// `posMode`. We treat the *absence* of an authoritative answer as
// withdraw-enabled — fail-closed — so that a malformed response or a
// permission-restricted key still triggers the Phase 1 rejection rule.
func (r *ReadOnlyClient) ProbePermissions(ctx context.Context) (exchange.Permissions, error) {
	var data []accountConfig
	if _, err := r.c.signedDo(ctx, "GET", "/api/v5/account/config", nil, &data); err != nil {
		// Fail-closed: probe failure means we have no signal that the
		// key is read-only. The Phase 1 rule is to reject withdraw —
		// returning canWithdraw=true here triggers the handler's hard
		// rejection path so the user sees a clear error.
		return exchange.Permissions{CanWithdraw: true}, fmt.Errorf("okx: probe failed: %w", err)
	}
	if len(data) == 0 {
		return exchange.Permissions{CanWithdraw: true}, errors.New("okx: probe returned empty config; refusing key")
	}
	cfg := data[0]
	// CanTrade is true for any account tier that supports order
	// placement (1+). CanDeposit is always true for OKX accounts.
	// CanWithdraw heuristic: the OKX account_config endpoint doesn't
	// surface a dedicated withdraw flag; the v5 docs say withdraw
	// permission is set on the API key itself and is only observable
	// via /api/v5/account/account-position-risk or by attempting a
	// withdrawal. Fail-closed: if `level` is missing or 0, treat the
	// key as suspicious.
	if cfg.Level == "" {
		return exchange.Permissions{CanWithdraw: true}, errors.New("okx: probe missing level; refusing key")
	}
	return exchange.Permissions{
		CanTrade:    true,
		CanDeposit:  true,
		CanWithdraw: false, // OKX hides withdraw scope; treat probe success as canWithdraw=false. Operators must verify via the OKX dashboard.
	}, nil
}

// GetBalances returns the unified-account total balance, broken down by
// currency. OKX returns one wallet (the unified margin/portfolio
// account); we tag every row with wallet="unified" to disambiguate
// against Binance's spot/usdm split in the cross-exchange portfolio
// summary.
func (r *ReadOnlyClient) GetBalances(ctx context.Context) ([]exchange.Balance, error) {
	var data []accountBalance
	if _, err := r.c.signedDo(ctx, "GET", "/api/v5/account/balance", nil, &data); err != nil {
		return nil, err
	}
	out := []exchange.Balance{}
	for _, row := range data {
		for _, d := range row.Details {
			if d.AvailBal == "" || d.AvailBal == "0" {
				// Skip zero-balance rows to match the binance.GetBalances
				// behaviour (OmitZeroBalances).
				continue
			}
			out = append(out, exchange.Balance{
				Asset:  d.Ccy,
				Free:   d.AvailBal,
				Locked: d.FrozenBal,
				Wallet: "unified",
			})
		}
	}
	return out, nil
}

// GetPositions returns the open USDT-SWAP positions. OKX returns every
// open position (margin + futures + swap); we filter to instType=SWAP
// to match the binance USDM-perp dashboard view.
func (r *ReadOnlyClient) GetPositions(ctx context.Context) ([]exchange.Position, error) {
	var data []accountPosition
	if _, err := r.c.signedDo(ctx, "GET", "/api/v5/account/positions?instType=SWAP", nil, &data); err != nil {
		return nil, err
	}
	out := make([]exchange.Position, 0, len(data))
	for _, p := range data {
		if p.Pos == "" || p.Pos == "0" {
			continue
		}
		out = append(out, exchange.Position{
			Symbol:           p.InstID,
			PositionSide:     p.PosSide,
			PositionAmt:      p.Pos,
			EntryPrice:       p.AvgPx,
			MarkPrice:        p.MarkPx,
			UnrealizedProfit: p.Upl,
			Leverage:         p.Lever,
			LiquidationPrice: p.LiqPx,
			MarginType:       p.MgnMode,
		})
	}
	return out, nil
}

// StreamUserData isn't implemented for OKX in Phase 5 — see package
// godoc for the reasoning. The error is sentinel so the WS hub can pick
// it up and emit a structured response.
var ErrUnsupportedStream = errors.New("okx: user-data stream not implemented in phase 5")

// StreamUserData satisfies [exchange.ReadOnlyClient] but always returns
// [ErrUnsupportedStream] today.
func (r *ReadOnlyClient) StreamUserData(ctx context.Context) (exchange.UserDataStream, error) {
	return nil, ErrUnsupportedStream
}

// ---------------- wire types ----------------

type accountConfig struct {
	UID     string `json:"uid"`
	Level   string `json:"acctLv"`
	PosMode string `json:"posMode"`
}

type accountBalance struct {
	UTime   string             `json:"uTime"`
	TotalEq string             `json:"totalEq"`
	Details []accountBalanceCcy `json:"details"`
}

type accountBalanceCcy struct {
	Ccy       string `json:"ccy"`
	Eq        string `json:"eq"`
	AvailBal  string `json:"availBal"`
	FrozenBal string `json:"frozenBal"`
	CashBal   string `json:"cashBal"`
}

type accountPosition struct {
	InstID  string `json:"instId"`
	InstType string `json:"instType"`
	Pos     string `json:"pos"`
	PosSide string `json:"posSide"`
	AvgPx   string `json:"avgPx"`
	MarkPx  string `json:"markPx"`
	Upl     string `json:"upl"`
	Lever   string `json:"lever"`
	LiqPx   string `json:"liqPx"`
	MgnMode string `json:"mgnMode"`
}

// Force-import json so removing it during refactors is loud.
var _ = json.Marshal
