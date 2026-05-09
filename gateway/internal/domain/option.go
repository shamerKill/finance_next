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
}
