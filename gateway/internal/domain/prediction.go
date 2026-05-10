// prediction.go — Phase 9 Polymarket prediction-market domain types.
//
// Independent vertical from spot/perp orders — prediction strategies
// trade USDC-quoted CTF outcome shares, not leveraged perps. Risk caps
// are different (no leverage; instead `maxNotionalUsd` per market and
// `maxSlippageBps` vs. mid).
//
// Mongo collections:
//   * `prediction_strategies` — config (this file's PredictionStrategy)
//   * `prediction_orders`     — submission audit log (PredictionOrderLog)
//
// `system_state` (kill switch) and `portfolio_limits` (cross-strategy
// caps) are SHARED with the perp engine — Phase 7 design.
package domain

import (
	"encoding/json"
	"time"
)

// PredictionOutcome is the side of a binary market: YES or NO. Polymarket
// emits two outcome `token_id`s per condition; the handler resolves the
// concrete token id from the market metadata at submit time.
type PredictionOutcome string

const (
	OutcomeYes PredictionOutcome = "YES"
	OutcomeNo  PredictionOutcome = "NO"
)

// IsValid returns true for one of the two recognised outcomes.
func (o PredictionOutcome) IsValid() bool {
	return o == OutcomeYes || o == OutcomeNo
}

// PredictionRisk is the per-strategy risk bundle. All four fields are
// hard-required by the engine — zero/missing values are rejected up
// front; the engine never picks a default.
type PredictionRisk struct {
	MaxNotionalUsd  float64 `json:"maxNotionalUsd"  bson:"maxNotionalUsd"`
	MaxOpenMarkets  int     `json:"maxOpenMarkets"  bson:"maxOpenMarkets"`
	MaxSlippageBps  int     `json:"maxSlippageBps"  bson:"maxSlippageBps"`
	DailyLossCapUsd float64 `json:"dailyLossCapUsd" bson:"dailyLossCapUsd"`
}

// PredictionLive is the live-trading config block for a strategy.
//
// `Mode` accepts the string "mainnet" only — there is no Polymarket
// testnet. The engine still consults the shared mainnet TokenStore +
// the `POLYMARKET_TRADING_ENABLED` env, mirroring the Binance gate.
type PredictionLive struct {
	Enabled  bool     `json:"enabled"             bson:"enabled"`
	Mode     LiveMode `json:"mode,omitempty"      bson:"mode,omitempty"`
	WalletID string   `json:"walletId,omitempty"  bson:"walletId,omitempty"`
}

// PredictionStrategy is the per-market trading config.
type PredictionStrategy struct {
	ID             string            `json:"id"            bson:"_id,omitempty"`
	UserID         string            `json:"userId"        bson:"userId"`
	Name           string            `json:"name"          bson:"name"`
	MarketID       string            `json:"marketId"      bson:"marketId"`
	Outcome        PredictionOutcome `json:"outcome"       bson:"outcome"`
	Risk           *PredictionRisk   `json:"risk"          bson:"risk"`
	Live           PredictionLive    `json:"live"          bson:"live"`
	Params         json.RawMessage   `json:"params,omitempty" bson:"params,omitempty"`
	CurrentVersion int               `json:"currentVersion" bson:"currentVersion"`
	CreatedAt      time.Time         `json:"createdAt"     bson:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"     bson:"updatedAt"`
}

// LiveEnabled reports whether the strategy is currently configured to
// place real orders.
func (p *PredictionStrategy) LiveEnabled() bool {
	return p != nil && p.Live.Enabled
}

// CreatePredictionStrategyInput is the validated POST body.
type CreatePredictionStrategyInput struct {
	Name     string            `json:"name"     validate:"required,min=3,max=64"`
	MarketID string            `json:"marketId" validate:"required"`
	Outcome  PredictionOutcome `json:"outcome"  validate:"required"`
	Risk     *PredictionRisk   `json:"risk"     validate:"required"`
	Params   json.RawMessage   `json:"params,omitempty"`
}

// PredictionOrderStatus mirrors OrderStatus but lives in its own type so
// the prediction engine never collides with the perp engine's state
// machine.
type PredictionOrderStatus string

const (
	PredictionOrderNew      PredictionOrderStatus = "new"
	PredictionOrderPartial  PredictionOrderStatus = "partial"
	PredictionOrderFilled   PredictionOrderStatus = "filled"
	PredictionOrderCanceled PredictionOrderStatus = "canceled"
	PredictionOrderRejected PredictionOrderStatus = "rejected"
	PredictionOrderUnknown  PredictionOrderStatus = "unknown"
)

// PredictionOrderLog is one row in `prediction_orders`. Schema mirrors
// `order_log` for the perp engine but with prediction-specific fields:
// outcome, mid-at-sign, slippage budget.
type PredictionOrderLog struct {
	ID             string                `json:"id"            bson:"_id,omitempty"`
	ClientOrderID  string                `json:"clientOrderId" bson:"clientOrderId"`
	StrategyID     string                `json:"strategyId"    bson:"strategyId"`
	WalletID       string                `json:"walletId"      bson:"walletId"`
	MarketID       string                `json:"marketId"      bson:"marketId"`
	TokenID        string                `json:"tokenId"       bson:"tokenId"`
	Outcome        PredictionOutcome     `json:"outcome"       bson:"outcome"`
	Side           OrderSide             `json:"side"          bson:"side"`
	Price          float64               `json:"price"         bson:"price"`
	Size           float64               `json:"size"          bson:"size"`
	MidAtSubmit    float64               `json:"midAtSubmit"   bson:"midAtSubmit,omitempty"`
	SlippageBps    int                   `json:"slippageBps"   bson:"slippageBps,omitempty"`
	Status         PredictionOrderStatus `json:"status"        bson:"status"`
	ExchangeOrderID string               `json:"exchangeOrderId,omitempty" bson:"exchangeOrderId,omitempty"`
	Filled         float64               `json:"filled,omitempty"           bson:"filled,omitempty"`
	AvgFillPrice   float64               `json:"avgFillPrice,omitempty"     bson:"avgFillPrice,omitempty"`
	RealisedPnlUsd float64               `json:"realisedPnlUsd,omitempty"   bson:"realisedPnlUsd,omitempty"`
	SubmittedAt    time.Time             `json:"submittedAt"   bson:"submittedAt"`
	LastEventAt    time.Time             `json:"lastEventAt"   bson:"lastEventAt"`
	RawEvents      []json.RawMessage     `json:"rawEvents,omitempty" bson:"rawEvents,omitempty"`
}

// SubmitPredictionOrderCommand is the Redis Stream payload + the body of
// the admin manual-submit endpoint. `BarTs` is part of the idempotency
// key so a re-run on the same bar collapses to the same hash.
type SubmitPredictionOrderCommand struct {
	StrategyID     string            `json:"strategyId"`
	MarketID       string            `json:"marketId"`
	TokenID        string            `json:"tokenId"`
	Outcome        PredictionOutcome `json:"outcome"`
	Side           OrderSide         `json:"side"`
	Price          float64           `json:"price"`
	Size           float64           `json:"size"`
	MidPrice       float64           `json:"midPrice,omitempty"`
	IdempotencyKey string            `json:"idempotencyKey,omitempty"`
}
