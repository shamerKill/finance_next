// Package domain holds shared types for the Option resource.
//
// The shape mirrors the legacy NestJS DTO (server/src/routers/option/dto/create-option.dto.ts)
// and the Mongoose entity (server/src/routers/option/entities/option.entity.ts).
package domain

import "time"

// CreatePosition is one leg of a strategy's batched-entry plan.
type CreatePosition struct {
	// MarginRate: 0..1 fraction of the order group margin allocated to this leg.
	MarginRate float64 `json:"marginRate" bson:"marginRate" validate:"gte=0,lte=1"`
	// LossAddRate: drawdown trigger to add this leg (head leg = 0).
	LossAddRate float64 `json:"lossAddRate" bson:"lossAddRate" validate:"gte=0"`
}

// LiveMode discriminates execution against testnet vs. live mainnet.
//
// Phase 4 default is "testnet"; the gateway's order engine refuses to call
// mainnet endpoints unless `MAINNET_TRADING_ENABLED=true` AND a confirmed
// mainnet token is in memory. See gateway/internal/orderengine.
type LiveMode string

const (
	LiveModeTestnet LiveMode = "testnet"
	LiveModeMainnet LiveMode = "mainnet"
)

// IsValid reports whether m is a recognised live mode.
func (m LiveMode) IsValid() bool {
	switch m {
	case LiveModeTestnet, LiveModeMainnet:
		return true
	}
	return false
}

// RiskCaps holds the strategy-level risk parameters consulted by the order
// engine before any exchange call. All three fields are MANDATORY when
// `live.enabled=true`; missing values cause orders to be rejected (the engine
// MUST NOT pick "sensible defaults" silently per Phase 4 spec).
type RiskCaps struct {
	// MaxPositionUsd: hard cap on `qty * mark_price` for a single submission.
	MaxPositionUsd float64 `json:"maxPositionUsd" bson:"maxPositionUsd" validate:"gt=0"`
	// MaxLeverage: cap on (notional + existing notional) / wallet balance.
	MaxLeverage float64 `json:"maxLeverage" bson:"maxLeverage" validate:"gt=0"`
	// DailyLossCapUsd: if today's realised PnL drops below `-DailyLossCapUsd`,
	// further submissions are rejected until the next UTC day. >0.
	DailyLossCapUsd float64 `json:"dailyLossCapUsd" bson:"dailyLossCapUsd" validate:"gt=0"`
}

// LiveConfig is the per-strategy execution toggle. Missing/empty equals
// `Enabled=false` (no exchange calls).
type LiveConfig struct {
	Enabled   bool       `json:"enabled" bson:"enabled"`
	Mode      LiveMode   `json:"mode" bson:"mode"`
	AccountID string     `json:"accountId,omitempty" bson:"accountId,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty" bson:"startedAt,omitempty"`
}

// CreateOptionDTO mirrors NestJS CreateOptionDto exactly.
//
// Note: createCostOrderInProfit uses *bool because validator/v10 has no
// straight-forward "required boolean" rule; the handler null-checks it.
type CreateOptionDTO struct {
	Name                         string           `json:"name"                         validate:"required,min=3,max=8"`
	PositionLevel                int              `json:"positionLevel"                validate:"required,min=1,max=125"`
	OpenPositionStopTime         int              `json:"openPositionStopTime"         validate:"min=0"`
	ExecSymbol                   string           `json:"execSymbol"                   validate:"required"`
	OrderGroupMargin             int              `json:"orderGroupMargin"`
	StopProfitRate               float64          `json:"stopProfitRate"`
	StopLossRate                 float64          `json:"stopLossRate"`
	ProfitRateAfterAtAddPosition float64          `json:"profitRateAfterAtAddPosition"`
	CreateCostOrderInProfit      *bool            `json:"createCostOrderInProfit"      validate:"required"`
	CreatePositions              []CreatePosition `json:"createPositions"              validate:"required,min=1,dive"`
	UserEmail                    string           `json:"userEmail"                    validate:"required,email"`
	UserAPIKey                   string           `json:"userApiKey"                   validate:"required"`
	UserSecretKey                string           `json:"userSecretKey"                validate:"required"`
}

// UpdateOptionDTO is the partial-update shape. All fields are pointer-typed so
// "missing" and "explicit zero" are distinguishable; only non-nil fields are
// applied via $set.
type UpdateOptionDTO struct {
	Name                         *string           `json:"name,omitempty"                         validate:"omitempty,min=3,max=8"`
	PositionLevel                *int              `json:"positionLevel,omitempty"                validate:"omitempty,min=1,max=125"`
	OpenPositionStopTime         *int              `json:"openPositionStopTime,omitempty"         validate:"omitempty,min=0"`
	ExecSymbol                   *string           `json:"execSymbol,omitempty"`
	OrderGroupMargin             *int              `json:"orderGroupMargin,omitempty"`
	StopProfitRate               *float64          `json:"stopProfitRate,omitempty"`
	StopLossRate                 *float64          `json:"stopLossRate,omitempty"`
	ProfitRateAfterAtAddPosition *float64          `json:"profitRateAfterAtAddPosition,omitempty"`
	CreateCostOrderInProfit      *bool             `json:"createCostOrderInProfit,omitempty"`
	CreatePositions              *[]CreatePosition `json:"createPositions,omitempty"              validate:"omitempty,min=1,dive"`
	UserEmail                    *string           `json:"userEmail,omitempty"                    validate:"omitempty,email"`
	UserAPIKey                   *string           `json:"userApiKey,omitempty"`
	UserSecretKey                *string           `json:"userSecretKey,omitempty"`
}

// Option is the persisted shape (BSON). createTime defaults to now on insert.
type Option struct {
	ID                           string           `json:"id"                           bson:"_id,omitempty"`
	Name                         string           `json:"name"                         bson:"name"`
	PositionLevel                int              `json:"positionLevel"                bson:"positionLevel"`
	OpenPositionStopTime         int              `json:"openPositionStopTime"         bson:"openPositionStopTime"`
	ExecSymbol                   string           `json:"execSymbol"                   bson:"execSymbol"`
	OrderGroupMargin             int              `json:"orderGroupMargin"             bson:"orderGroupMargin"`
	StopProfitRate               float64          `json:"stopProfitRate"               bson:"stopProfitRate"`
	StopLossRate                 float64          `json:"stopLossRate"                 bson:"stopLossRate"`
	ProfitRateAfterAtAddPosition float64          `json:"profitRateAfterAtAddPosition" bson:"profitRateAfterAtAddPosition"`
	CreateCostOrderInProfit      bool             `json:"createCostOrderInProfit"      bson:"createCostOrderInProfit"`
	CreatePositions              []CreatePosition `json:"createPositions"              bson:"createPositions"`
	UserEmail                    string           `json:"userEmail"                    bson:"userEmail"`
	// UserAPIKey / UserSecretKey are encrypted in storage and stripped from JSON output.
	UserAPIKey    string    `json:"-" bson:"userApiKey"`
	UserSecretKey string    `json:"-" bson:"userSecretKey"`
	CreateTime    time.Time `json:"createTime" bson:"createTime"`

	// Phase 4 additions. Both pointer-typed so legacy docs without these
	// fields decode cleanly: `Risk == nil` & `Live == nil` is treated as
	// "no risk caps configured" / "live disabled" respectively.
	Risk *RiskCaps   `json:"risk,omitempty" bson:"risk,omitempty"`
	Live *LiveConfig `json:"live,omitempty" bson:"live,omitempty"`
}

// LiveEnabled is a nil-safe accessor.
func (o *Option) LiveEnabled() bool {
	return o.Live != nil && o.Live.Enabled
}
