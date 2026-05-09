// Package exchange defines the read-only abstraction the gateway uses to talk
// to upstream venues (Binance for phase 1; OKX/Bybit will be wired in phase 5).
//
// The interface intentionally exposes only the few read paths the dashboard
// needs:
//   - ProbePermissions  (called once on credential add to detect canWithdraw)
//   - GetBalances       (spot + USDM wallet snapshot)
//   - GetPositions      (USDM open positions)
//   - StreamUserData    (long-lived event channel multiplexed by the WS hub)
//
// Order placement / cancellation is deliberately *not* on this interface — that
// path is gated by phase 4. Adding it later means a separate Trading interface
// composed at the call site, so accounts that are read-only stay that way.
package exchange

import "context"

// Permissions describes the API-key scopes a venue reports back. The exact wire
// shape varies per exchange; ProbePermissions normalises them.
type Permissions struct {
	CanTrade    bool `json:"canTrade"`
	CanDeposit  bool `json:"canDeposit"`
	CanWithdraw bool `json:"canWithdraw"`
}

// Balance is one asset row in either a spot wallet or a futures USDM wallet.
//
// Wallet identifies the source bucket: "spot" or "usdm" today. Free/Locked are
// strings to preserve precision; the UI parses them as decimals.
type Balance struct {
	Asset  string `json:"asset"`
	Free   string `json:"free"`
	Locked string `json:"locked"`
	Wallet string `json:"wallet"`
}

// Position is a single open futures position. Strings are kept verbatim from
// the venue to avoid lossy float conversions in the gateway.
type Position struct {
	Symbol           string `json:"symbol"`
	PositionSide     string `json:"positionSide"`
	PositionAmt      string `json:"positionAmt"`
	EntryPrice       string `json:"entryPrice"`
	MarkPrice        string `json:"markPrice"`
	UnrealizedProfit string `json:"unrealizedProfit"`
	Leverage         string `json:"leverage"`
	LiquidationPrice string `json:"liquidationPrice"`
	MarginType       string `json:"marginType"`
}

// UserDataEvent is one decoded message off a venue's user-data stream. Payload
// is the raw upstream JSON; the WS hub forwards it untouched so the browser can
// dispatch on its own type/eventType field.
type UserDataEvent struct {
	Payload []byte
}

// UserDataStream is the goroutine-friendly handle returned by StreamUserData.
//
// Events delivers decoded events. Errs delivers a single terminal error before
// being closed; callers must consume both to avoid goroutine leaks. Close
// signals the producer to tear down the upstream WS, refresh-listen-key timer,
// and any other side resources.
type UserDataStream interface {
	Events() <-chan UserDataEvent
	Errs() <-chan error
	Close() error
}

// ReadOnlyClient is the per-account adapter the gateway holds while a session
// is active.
type ReadOnlyClient interface {
	ProbePermissions(ctx context.Context) (Permissions, error)
	GetBalances(ctx context.Context) ([]Balance, error)
	GetPositions(ctx context.Context) ([]Position, error)
	StreamUserData(ctx context.Context) (UserDataStream, error)
}
