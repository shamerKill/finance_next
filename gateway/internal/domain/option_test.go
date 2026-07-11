package domain

import (
	"testing"

	"github.com/go-playground/validator/v10"
)

func TestCreateOptionDTOAcceptsRiskCaps(t *testing.T) {
	createCostOrderInProfit := false
	dto := CreateOptionDTO{
		Name:                         "btca",
		PositionLevel:                3,
		OpenPositionStopTime:         30,
		ExecSymbol:                   "BTCUSDT",
		OrderGroupMargin:             100,
		StopProfitRate:               0.03,
		StopLossRate:                 0.05,
		ProfitRateAfterAtAddPosition: 0.01,
		CreateCostOrderInProfit:      &createCostOrderInProfit,
		CreatePositions:              []CreatePosition{{MarginRate: 1, LossAddRate: 0}},
		UserEmail:                    "trader@example.com",
		UserAPIKey:                   "api-key",
		UserSecretKey:                "secret-key",
		Risk: &RiskCaps{
			MaxPositionUsd:  350,
			MaxLeverage:     4,
			DailyLossCapUsd: 35,
		},
	}

	validate := validator.New(validator.WithRequiredStructEnabled())
	if err := validate.Struct(dto); err != nil {
		t.Fatalf("CreateOptionDTO with valid risk caps should pass validation: %v", err)
	}
}

func TestCreateOptionDTOAllowsCredentiallessDraft(t *testing.T) {
	createCostOrderInProfit := false
	dto := CreateOptionDTO{
		Name:                         "btca",
		PositionLevel:                3,
		OpenPositionStopTime:         30,
		ExecSymbol:                   "BTCUSDT",
		OrderGroupMargin:             100,
		StopProfitRate:               0.03,
		StopLossRate:                 0.05,
		ProfitRateAfterAtAddPosition: 0.01,
		CreateCostOrderInProfit:      &createCostOrderInProfit,
		CreatePositions:              []CreatePosition{{MarginRate: 1, LossAddRate: 0}},
		Risk: &RiskCaps{
			MaxPositionUsd:  350,
			MaxLeverage:     4,
			DailyLossCapUsd: 35,
		},
	}

	validate := validator.New(validator.WithRequiredStructEnabled())
	if err := validate.Struct(dto); err != nil {
		t.Fatalf("credentialless AI strategy draft should pass validation: %v", err)
	}
}

func TestCreateOptionDTOAllowsSourceAIRunID(t *testing.T) {
	createCostOrderInProfit := false
	dto := CreateOptionDTO{
		Name:                         "btca",
		PositionLevel:                3,
		OpenPositionStopTime:         30,
		ExecSymbol:                   "BTCUSDT",
		OrderGroupMargin:             100,
		StopProfitRate:               0.03,
		StopLossRate:                 0.05,
		ProfitRateAfterAtAddPosition: 0.01,
		CreateCostOrderInProfit:      &createCostOrderInProfit,
		CreatePositions:              []CreatePosition{{MarginRate: 1, LossAddRate: 0}},
		AIRunID:                      "goal_abc",
		Risk: &RiskCaps{
			MaxPositionUsd:  350,
			MaxLeverage:     4,
			DailyLossCapUsd: 35,
		},
	}

	validate := validator.New(validator.WithRequiredStructEnabled())
	if err := validate.Struct(dto); err != nil {
		t.Fatalf("AI strategy draft with source run id should pass validation: %v", err)
	}
	if dto.AIRunID != "goal_abc" {
		t.Fatalf("expected AI run id to be retained, got %q", dto.AIRunID)
	}
}

func TestCreateOptionDTORejectsInvalidRiskCaps(t *testing.T) {
	createCostOrderInProfit := false
	dto := CreateOptionDTO{
		Name:                         "btca",
		PositionLevel:                3,
		OpenPositionStopTime:         30,
		ExecSymbol:                   "BTCUSDT",
		OrderGroupMargin:             100,
		StopProfitRate:               0.03,
		StopLossRate:                 0.05,
		ProfitRateAfterAtAddPosition: 0.01,
		CreateCostOrderInProfit:      &createCostOrderInProfit,
		CreatePositions:              []CreatePosition{{MarginRate: 1, LossAddRate: 0}},
		UserEmail:                    "trader@example.com",
		UserAPIKey:                   "api-key",
		UserSecretKey:                "secret-key",
		Risk:                         &RiskCaps{MaxPositionUsd: 0, MaxLeverage: 4, DailyLossCapUsd: 35},
	}

	validate := validator.New(validator.WithRequiredStructEnabled())
	if err := validate.Struct(dto); err == nil {
		t.Fatal("CreateOptionDTO with zero maxPositionUsd should fail validation")
	}
}
