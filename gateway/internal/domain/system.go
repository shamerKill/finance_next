// Package domain — Phase 7 system + portfolio types.
package domain

import "time"

// SystemState is the single-doc record (id="global") that controls the
// portfolio kill switch. When TradingHalted is true, the order engine
// rejects every submit before risk gates run.
type SystemState struct {
	ID            string     `json:"id" bson:"_id"`
	TradingHalted bool       `json:"tradingHalted" bson:"tradingHalted"`
	HaltedAt      *time.Time `json:"haltedAt,omitempty" bson:"haltedAt,omitempty"`
	HaltedReason  string     `json:"haltedReason,omitempty" bson:"haltedReason,omitempty"`
	HaltedBy      string     `json:"haltedBy,omitempty" bson:"haltedBy,omitempty"`
}

// SystemStateGlobalID is the canonical _id for the single global doc.
const SystemStateGlobalID = "global"

// PortfolioLimits holds cross-strategy risk caps for a single user.
// Phase 7 stores one row per user (userId="default" pre auth).
type PortfolioLimits struct {
	UserID                 string  `json:"userId" bson:"userId"`
	MaxOpenNotionalUsd     float64 `json:"maxOpenNotionalUsd" bson:"maxOpenNotionalUsd" validate:"gte=0"`
	MaxOpenPositionsCount  int     `json:"maxOpenPositionsCount" bson:"maxOpenPositionsCount" validate:"gte=0"`
	MaxDailyLossUsd        float64 `json:"maxDailyLossUsd" bson:"maxDailyLossUsd" validate:"gte=0"`
}

// DefaultUserID is defined in account.go; we reference it from this
// package via the same constant to keep the cross-strategy code pinned
// to a single source of truth.
