// Package domain — Phase 4 order types.
//
// `order_log` is the canonical Mongo collection for every submission attempt
// (testnet or mainnet). Its `clientOrderId` is the deterministic
// idempotency key derived from sha256(strategyId|seq|symbol|side|nonce);
// the first 32 hex chars are used because Binance limits clientOrderId to
// 36 characters.
package domain

import (
	"encoding/json"
	"time"
)

// OrderSide is "BUY" or "SELL" — uppercase mirrors Binance.
type OrderSide string

const (
	OrderSideBuy  OrderSide = "BUY"
	OrderSideSell OrderSide = "SELL"
)

// IsValid reports whether s is a recognised side.
func (s OrderSide) IsValid() bool { return s == OrderSideBuy || s == OrderSideSell }

// OrderType is "MARKET" or "LIMIT".
type OrderType string

const (
	OrderTypeMarket OrderType = "MARKET"
	OrderTypeLimit  OrderType = "LIMIT"
)

// IsValid reports whether t is a recognised type.
func (t OrderType) IsValid() bool { return t == OrderTypeMarket || t == OrderTypeLimit }

// OrderStatus is the gateway-internal lifecycle state. We keep it lower-case
// so it doesn't collide with Binance's mixed-case status field.
type OrderStatus string

const (
	OrderStatusNew      OrderStatus = "new"
	OrderStatusPartial  OrderStatus = "partial"
	OrderStatusFilled   OrderStatus = "filled"
	OrderStatusCanceled OrderStatus = "canceled"
	OrderStatusRejected OrderStatus = "rejected"
	// OrderStatusUnknown is a reconcile-loop transition state used while
	// awaiting an authoritative answer from the exchange.
	OrderStatusUnknown OrderStatus = "unknown"
)

// OrderLog is one persisted order attempt. RawEvents holds the verbatim
// upstream responses for audit; all derived fields above are convenience.
type OrderLog struct {
	ID              string            `json:"id" bson:"_id,omitempty"`
	ClientOrderID   string            `json:"clientOrderId" bson:"clientOrderId"`
	ExchangeOrderID string            `json:"exchangeOrderId,omitempty" bson:"exchangeOrderId,omitempty"`
	// UserID is the owning tenant id (R2 multi-tenant boundary). Sourced
	// from the strategy doc the order engine looked up — engine workers
	// don't run in an HTTP context so they can't read the request header.
	UserID          string            `json:"userId" bson:"userId"`
	StrategyID      string            `json:"strategyId" bson:"strategyId"`
	AccountID       string            `json:"accountId" bson:"accountId"`
	Symbol          string            `json:"symbol" bson:"symbol"`
	Side            OrderSide         `json:"side" bson:"side"`
	Type            OrderType         `json:"type" bson:"type"`
	Qty             float64           `json:"qty" bson:"qty"`
	Price           float64           `json:"price,omitempty" bson:"price,omitempty"`
	Filled          float64           `json:"filled" bson:"filled"`
	AvgFillPrice    float64           `json:"avgFillPrice" bson:"avgFillPrice"`
	Status          OrderStatus       `json:"status" bson:"status"`
	Mode            LiveMode          `json:"mode" bson:"mode"`
	RealisedPnlUsd  float64           `json:"realisedPnlUsd" bson:"realisedPnlUsd"`
	SubmittedAt     time.Time         `json:"submittedAt" bson:"submittedAt"`
	LastEventAt     time.Time         `json:"lastEventAt" bson:"lastEventAt"`
	RawEvents       []json.RawMessage `json:"rawEvents,omitempty" bson:"rawEvents,omitempty"`
}

// SubmitOrderCommand is the Redis-stream payload for `command.order.submit`.
//
// Producers (Python runtime, admin HTTP endpoint) marshal this; the gateway
// engine consumes it. Keep this in lock-step with
// `quant/src/quant/runtime/runtime.py`.
type SubmitOrderCommand struct {
	StrategyID     string    `json:"strategyId"`
	AccountID      string    `json:"accountId,omitempty"`
	Symbol         string    `json:"symbol"`
	Side           OrderSide `json:"side"`
	Type           OrderType `json:"type"`
	Qty            float64   `json:"qty"`
	Price          float64   `json:"price,omitempty"`
	IdempotencyKey string    `json:"idempotencyKey"`
	// MarkPrice is supplied by the producer when known so the engine can
	// run notional risk checks without a fresh exchange call. Optional;
	// when zero the engine uses the limit price (or rejects on MARKET).
	MarkPrice float64 `json:"markPrice,omitempty"`
}
