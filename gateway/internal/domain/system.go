// Package domain — Phase 7 system + portfolio types.
package domain

import "time"

// SystemState is the single-doc record (id="global") that controls the
// portfolio kill switch. When TradingHalted is true, the order engine
// rejects every submit before risk gates run.
//
// The same doc also carries the operator-tunable AIConfig (model family,
// budgets, base URLs) so /admin/ai/config can persist without minting a
// second collection. AIConfig is nil for legacy docs — readers MUST fall
// back to env vars when the nested field is absent or zero-valued.
type SystemState struct {
	ID            string     `json:"id" bson:"_id"`
	TradingHalted bool       `json:"tradingHalted" bson:"tradingHalted"`
	HaltedAt      *time.Time `json:"haltedAt,omitempty" bson:"haltedAt,omitempty"`
	HaltedReason  string     `json:"haltedReason,omitempty" bson:"haltedReason,omitempty"`
	HaltedBy      string     `json:"haltedBy,omitempty" bson:"haltedBy,omitempty"`

	// AIConfig is the persisted overlay for /admin/ai/config. When nil
	// or empty, env vars supply every field (see handler:effective).
	AIConfig *AIConfig `json:"aiConfig,omitempty" bson:"aiConfig,omitempty"`
}

// AIConfig is the operator-tunable AI optimisation config persisted in
// system_state.aiConfig. Every field is optional in PUT bodies; a zero
// value means "fall back to env at read time".
//
// Model name strings are validated non-empty when present; budgets must
// be > 0 and study cap ≤ daily cap; lookbackDays must be in [7, 365];
// base URLs are accepted empty (= SDK default) or as well-formed URLs.
type AIConfig struct {
	ModelFamily           string    `bson:"modelFamily,omitempty"           json:"modelFamily,omitempty"`
	AnthropicPrimaryModel string    `bson:"anthropicPrimaryModel,omitempty" json:"anthropicPrimaryModel,omitempty"`
	AnthropicRefineModel  string    `bson:"anthropicRefineModel,omitempty"  json:"anthropicRefineModel,omitempty"`
	OpenAIPrimaryModel    string    `bson:"openaiPrimaryModel,omitempty"    json:"openaiPrimaryModel,omitempty"`
	OpenAIRefineModel     string    `bson:"openaiRefineModel,omitempty"     json:"openaiRefineModel,omitempty"`
	AnthropicBaseURL      string    `bson:"anthropicBaseURL,omitempty"      json:"anthropicBaseURL,omitempty"`
	OpenAIBaseURL         string    `bson:"openaiBaseURL,omitempty"         json:"openaiBaseURL,omitempty"`
	BudgetUsdPerStudy     float64   `bson:"budgetUsdPerStudy,omitempty"     json:"budgetUsdPerStudy,omitempty"`
	BudgetUsdPerDay       float64   `bson:"budgetUsdPerDay,omitempty"       json:"budgetUsdPerDay,omitempty"`
	LookbackDays          int       `bson:"lookbackDays,omitempty"          json:"lookbackDays,omitempty"`
	UpdatedAt             time.Time `bson:"updatedAt,omitempty"             json:"updatedAt,omitempty"`

	// DeepSeek family — OpenAI-compatible API (chat completions). Default
	// base URL is https://api.deepseek.com when unset. Model strings
	// default to "deepseek-chat" inside the quant client when empty.
	DeepseekBaseURL      string `bson:"deepseekBaseURL,omitempty"      json:"deepseekBaseURL,omitempty"`
	DeepseekPrimaryModel string `bson:"deepseekPrimaryModel,omitempty" json:"deepseekPrimaryModel,omitempty"`
	DeepseekRefineModel  string `bson:"deepseekRefineModel,omitempty"  json:"deepseekRefineModel,omitempty"`

	// API key ciphertexts — AES-256-GCM with master KEK, format same as
	// exchange envelope (base64(iv).base64(tag).base64(ciphertext)). PUT
	// bodies accept plaintext under the *non*-Ciphertext keys
	// (anthropicApiKey / openaiApiKey / deepseekApiKey); handler encrypts
	// before persist. GET never returns ciphertext or plaintext —
	// surfacing is exclusively via the *Configured boolean fields on
	// AIConfigEffective. The `json:"-"` tag is the hard wire-level guard.
	AnthropicAPIKeyCiphertext string `bson:"anthropicApiKeyCiphertext,omitempty" json:"-"`
	OpenAIAPIKeyCiphertext    string `bson:"openaiApiKeyCiphertext,omitempty"    json:"-"`
	DeepseekAPIKeyCiphertext  string `bson:"deepseekApiKeyCiphertext,omitempty"  json:"-"`

	// StreamingEnabled toggles whether AI dispatch uses streaming
	// transports (OpenAI/DeepSeek stream=True, Anthropic messages.create
	// stream=True). Pointer type so the zero value distinguishes
	// "absent (= use default true)" from "explicitly set false". The
	// quant worker reads cfg.get("streamingEnabled") with the same
	// "None → True" coercion in ``ai/secrets.py::load_ai_secrets``.
	StreamingEnabled *bool `bson:"streamingEnabled,omitempty" json:"streamingEnabled,omitempty"`
}

// RecommendationPeriod is the OOS-window metadata attached to each
// recommendation. Quant worker writes it at insert time; gateway
// populates a default at read time so legacy docs render with context.
type RecommendationPeriod struct {
	LookbackDays     int     `bson:"lookbackDays"     json:"lookbackDays"`
	InSampleDays     float64 `bson:"inSampleDays"     json:"inSampleDays"`
	OosDays          float64 `bson:"oosDays"          json:"oosDays"`
	SharpeAnnualized bool    `bson:"sharpeAnnualized" json:"sharpeAnnualized"`
}

// DefaultRecommendationPeriod returns the gateway-side fallback used
// when a legacy doc has no period field. The values mirror the quant
// worker's default 70/30 walk-forward split over a 90-day lookback.
func DefaultRecommendationPeriod() *RecommendationPeriod {
	return &RecommendationPeriod{
		LookbackDays:     90,
		InSampleDays:     63,
		OosDays:          27,
		SharpeAnnualized: true,
	}
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
