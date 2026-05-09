// Package exchange defines the venue-agnostic abstractions the gateway uses
// to talk to upstream venues (Binance, OKX, Bybit).
//
// The interfaces intentionally split between read-only paths (used by the
// dashboard view of balances/positions) and order placement (used by the
// Phase 4+ order engine). Adapters that only ever serve the dashboard can
// implement [ReadOnlyClient]; adapters that also place orders implement
// [Adapter] = [ReadOnlyClient] + [OrderClient].
//
// Phase 5 promotes the order interface up here so OKX + Bybit + Binance
// can be selected by a registry in the order engine without compile-time
// dependencies on Binance-specific types.
package exchange

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

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

// OrderSide is "BUY" or "SELL"; mirrors domain.OrderSide string values.
type OrderSide string

// OrderType is "MARKET" or "LIMIT"; mirrors domain.OrderType.
type OrderType string

// OrderStatus is the gateway-internal lifecycle state. Values match
// domain.OrderStatus (lower-case) so the engine's mapping is a no-op cast.
type OrderStatus string

// OrderRequest is the venue-agnostic input to PlaceOrder. Symbols are
// venue-native at this boundary (e.g. "BTCUSDT" for binance/bybit,
// "BTC-USDT-SWAP" for okx) — the order engine translates from canonical
// before calling.
type OrderRequest struct {
	Symbol        string
	Side          OrderSide
	Type          OrderType
	Quantity      float64
	Price         float64 // ignored for MARKET
	ClientOrderID string  // <=36 chars; deterministic upstream
	ReduceOnly    bool
}

// OrderResult is the normalised PlaceOrder response. Raw is the verbatim
// upstream payload, stashed verbatim on the audit log.
type OrderResult struct {
	ExchangeOrderID string
	ClientOrderID   string
	Status          OrderStatus
	ExecutedQty     float64
	AvgFillPrice    float64
	TransactTime    time.Time
	Raw             json.RawMessage
}

// OpenOrder is the reconcile-loop view of an order — only the fields
// needed to diff against the local order_log.
type OpenOrder struct {
	ClientOrderID   string
	ExchangeOrderID string
	Symbol          string
	Status          OrderStatus
	ExecutedQty     float64
	AvgFillPrice    float64
	UpdatedAt       time.Time
}

// OrderClient places, cancels, and inspects orders. Mainnet/testnet
// gating is the responsibility of the implementation — the engine simply
// builds an adapter for the strategy's [domain.LiveMode] and uses it.
type OrderClient interface {
	PlaceOrder(ctx context.Context, req OrderRequest) (*OrderResult, error)
	CancelOrder(ctx context.Context, symbol, clientOrderID string) error
	GetOpenOrders(ctx context.Context, symbol string) ([]OpenOrder, error)
	GetOrder(ctx context.Context, symbol, clientOrderID string) (*OpenOrder, error)
}

// Adapter composes both interfaces; the live order engine uses this.
// Most adapters implement both; ReadOnlyClient remains acceptable for the
// account/dashboard path which never places orders.
type Adapter interface {
	ReadOnlyClient
	OrderClient
}

// ErrMainnetGateDenied is the canonical error returned by an adapter
// when an order would target mainnet but the configured gate refuses.
// All adapters share this sentinel so the engine + reconcile loop can
// match on it without per-venue casts.
var ErrMainnetGateDenied = errors.New("exchange: mainnet trading not enabled (env + confirm token required)")
