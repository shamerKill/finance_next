// admin.go — Phase 7 admin endpoints: kill switch, portfolio limits, audit
// log viewer.
//
// All endpoints require the `X-Admin-Key` header to match the configured
// ADMIN_KEY env var. When ADMIN_KEY is unset the entire group returns 404
// (the same hide-by-default pattern used for /market/ingest).
package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// AdminHandler bundles the admin endpoints together so wiring stays
// compact in router.go.
type AdminHandler struct {
	system   *mongostore.SystemRepo
	audit    *mongostore.AuditRepo
	quant    quantclient.Client
	adminKey string
	crypto   *crypto.Service
}

// NewAdminHandler builds the handler. system / audit / quant may all be
// nil — in that case the relevant subset of routes returns 503. The
// crypto service is used to encrypt API keys submitted via
// PUT /admin/ai/config; when nil, the handler rejects PUT bodies that
// include plaintext keys with 503 (the persisted ciphertext fields are
// untouched, so the family/budget/model knobs still update normally).
func NewAdminHandler(
	system *mongostore.SystemRepo,
	audit *mongostore.AuditRepo,
	quant quantclient.Client,
	adminKey string,
) *AdminHandler {
	return &AdminHandler{system: system, audit: audit, quant: quant, adminKey: adminKey}
}

// WithCrypto returns h with the AES-256-GCM service wired so PUT
// /admin/ai/config can encrypt incoming plaintext API keys. Kept as a
// setter (rather than a new constructor arg) so the existing call sites
// in tests don't have to change.
func (h *AdminHandler) WithCrypto(svc *crypto.Service) *AdminHandler {
	h.crypto = svc
	return h
}

// Register binds the admin routes onto the v1 group.
//
// 路由始终挂载 —— 之前的 "ADMIN_KEY 未设置则整组 404 隐藏" gate 已经
// 移除。访问控制现在统一由 IsAdminRequest 在每个 handler 内做：cookie
// role=admin 优先；ADMIN_KEY env 仍可设来支持 s2s / CI 兼容路径。
func (h *AdminHandler) Register(g *echo.Group) {
	g.POST("/admin/halt", h.halt)
	g.POST("/admin/resume", h.resume)
	g.GET("/admin/system-state", h.systemState)
	g.PUT("/admin/portfolio-limits", h.setPortfolioLimits)
	g.GET("/admin/portfolio-limits", h.getPortfolioLimits)
	g.GET("/admin/audit", h.listAudit)
	g.GET("/admin/ai/config", h.getAIConfig)
	g.PUT("/admin/ai/config", h.putAIConfig)
	g.GET("/admin/ai/prompts", h.getAIPrompts)
}

func (h *AdminHandler) auth(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	return nil
}

// POST /api/v1/admin/halt {reason}
func (h *AdminHandler) halt(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if body.Reason == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "reason required")
	}
	actor := c.Request().Header.Get("X-Admin-Actor")
	if actor == "" {
		actor = "admin"
	}
	state, err := h.system.Halt(c.Request().Context(), body.Reason, actor)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, state)
}

// POST /api/v1/admin/resume
func (h *AdminHandler) resume(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	state, err := h.system.Resume(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, state)
}

// GET /api/v1/admin/system-state
//
// Public-ish read: still admin-gated, but the UI banner polls this so
// every operator with the key sees the kill switch state.
func (h *AdminHandler) systemState(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	state, err := h.system.GetSystemState(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, state)
}

// PUT /api/v1/admin/portfolio-limits
func (h *AdminHandler) setPortfolioLimits(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	var body struct {
		MaxOpenNotionalUsd    float64 `json:"maxOpenNotionalUsd"`
		MaxOpenPositionsCount int     `json:"maxOpenPositionsCount"`
		MaxDailyLossUsd       float64 `json:"maxDailyLossUsd"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if body.MaxOpenNotionalUsd < 0 || body.MaxOpenPositionsCount < 0 || body.MaxDailyLossUsd < 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "limits must be non-negative; use 0 for 'no cap'")
	}
	limits := &domain.PortfolioLimits{
		UserID:                gwmw.FromEcho(c),
		MaxOpenNotionalUsd:    body.MaxOpenNotionalUsd,
		MaxOpenPositionsCount: body.MaxOpenPositionsCount,
		MaxDailyLossUsd:       body.MaxDailyLossUsd,
	}
	if err := h.system.SetPortfolioLimits(c.Request().Context(), limits); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, limits)
}

// GET /api/v1/admin/portfolio-limits
func (h *AdminHandler) getPortfolioLimits(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	limits, err := h.system.GetPortfolioLimits(c.Request().Context(), gwmw.FromEcho(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, limits)
}

// GET /api/v1/admin/audit?since=&actor=&resourceType=&limit=
func (h *AdminHandler) listAudit(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.audit == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "audit repo not configured")
	}
	q := mongostore.AuditQuery{
		Actor:        c.QueryParam("actor"),
		ResourceType: c.QueryParam("resourceType"),
		Limit:        100,
	}
	if since := c.QueryParam("since"); since != "" {
		t, err := time.Parse(time.RFC3339, since)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid since: "+err.Error())
		}
		q.Since = t
	}
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			q.Limit = v
		}
	}
	rows, err := h.audit.List(c.Request().Context(), q)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, rows)
}

// ---- /admin/ai/config + /admin/ai/prompts -------------------------------

// AIConfigEffective is the GET/PUT response body. It folds the persisted
// AIConfig overlay onto env-derived defaults so the UI never has to
// know whether a given field is coming from Mongo or env.
//
// Source is "mongo" when every set field came from the persisted doc,
// "env" when no aiConfig doc exists yet, and "mixed" when only a
// subset has been customised.
type AIConfigEffective struct {
	ModelFamily           string    `json:"modelFamily"`
	AnthropicPrimaryModel string    `json:"anthropicPrimaryModel"`
	AnthropicRefineModel  string    `json:"anthropicRefineModel"`
	OpenAIPrimaryModel    string    `json:"openaiPrimaryModel"`
	OpenAIRefineModel     string    `json:"openaiRefineModel"`
	AnthropicBaseURL      string    `json:"anthropicBaseURL"`
	OpenAIBaseURL         string    `json:"openaiBaseURL"`
	DeepseekBaseURL       string    `json:"deepseekBaseURL"`
	DeepseekPrimaryModel  string    `json:"deepseekPrimaryModel"`
	DeepseekRefineModel   string    `json:"deepseekRefineModel"`
	BudgetUsdPerStudy     float64   `json:"budgetUsdPerStudy"`
	BudgetUsdPerDay       float64   `json:"budgetUsdPerDay"`
	LookbackDays          int       `json:"lookbackDays"`
	UpdatedAt             time.Time `json:"updatedAt,omitempty"`

	AnthropicConfigured bool `json:"anthropicConfigured"`
	OpenAIConfigured    bool `json:"openaiConfigured"`
	// *APIKeyConfigured flags reflect whether a ciphertext for that
	// provider is persisted in Mongo. UI uses these to render a
	// "已配置 / 未配置" badge without ever seeing the key value itself.
	AnthropicAPIKeyConfigured bool `json:"anthropicApiKeyConfigured"`
	OpenAIAPIKeyConfigured    bool `json:"openaiApiKeyConfigured"`
	DeepseekAPIKeyConfigured  bool `json:"deepseekApiKeyConfigured"`

	Source string `json:"source"`
}

// effectiveAIConfig merges the persisted overlay (may be nil) with the
// env-derived defaults. It also computes the source label by counting
// how many non-zero fields came from Mongo.
func effectiveAIConfig(persisted *domain.AIConfig) AIConfigEffective {
	out := AIConfigEffective{
		ModelFamily:           envOrDefault("AI_MODEL_FAMILY", "claude"),
		AnthropicPrimaryModel: "claude-sonnet-4-6",
		AnthropicRefineModel:  "claude-haiku-4-5-20251001",
		OpenAIPrimaryModel:    envOrDefault("OPENAI_PRIMARY_MODEL", "gpt-5.5"),
		OpenAIRefineModel:     envOrDefault("OPENAI_REFINE_MODEL", "gpt-5.4"),
		AnthropicBaseURL:      os.Getenv("ANTHROPIC_BASE_URL"),
		OpenAIBaseURL:         os.Getenv("OPENAI_BASE_URL"),
		DeepseekBaseURL:       envOrDefault("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
		DeepseekPrimaryModel:  envOrDefault("DEEPSEEK_PRIMARY_MODEL", "deepseek-chat"),
		DeepseekRefineModel:   envOrDefault("DEEPSEEK_REFINE_MODEL", "deepseek-chat"),
		BudgetUsdPerStudy:     envOrFloat("AI_MAX_USD_PER_STUDY", 5.0),
		BudgetUsdPerDay:       envOrFloat("AI_MAX_USD_PER_DAY", 50.0),
		LookbackDays:          envOrInt("AI_OPTIMIZATION_LOOKBACK_DAYS", 90),
		AnthropicConfigured:   os.Getenv("ANTHROPIC_API_KEY") != "",
		OpenAIConfigured:      os.Getenv("OPENAI_API_KEY") != "",
		Source:                "env",
	}
	if persisted == nil {
		// API-key-configured flags fall back to env presence when no
		// persisted ciphertext exists (legacy one-release migration
		// path). Once an operator saves a key via the UI, the persisted
		// ciphertext takes precedence.
		out.AnthropicAPIKeyConfigured = out.AnthropicConfigured
		out.OpenAIAPIKeyConfigured = out.OpenAIConfigured
		out.DeepseekAPIKeyConfigured = os.Getenv("DEEPSEEK_API_KEY") != ""
		return out
	}
	mongoFields := 0
	if persisted.ModelFamily != "" {
		out.ModelFamily = persisted.ModelFamily
		mongoFields++
	}
	if persisted.AnthropicPrimaryModel != "" {
		out.AnthropicPrimaryModel = persisted.AnthropicPrimaryModel
		mongoFields++
	}
	if persisted.AnthropicRefineModel != "" {
		out.AnthropicRefineModel = persisted.AnthropicRefineModel
		mongoFields++
	}
	if persisted.OpenAIPrimaryModel != "" {
		out.OpenAIPrimaryModel = persisted.OpenAIPrimaryModel
		mongoFields++
	}
	if persisted.OpenAIRefineModel != "" {
		out.OpenAIRefineModel = persisted.OpenAIRefineModel
		mongoFields++
	}
	if persisted.AnthropicBaseURL != "" {
		out.AnthropicBaseURL = persisted.AnthropicBaseURL
		mongoFields++
	}
	if persisted.OpenAIBaseURL != "" {
		out.OpenAIBaseURL = persisted.OpenAIBaseURL
		mongoFields++
	}
	if persisted.DeepseekBaseURL != "" {
		out.DeepseekBaseURL = persisted.DeepseekBaseURL
		mongoFields++
	}
	if persisted.DeepseekPrimaryModel != "" {
		out.DeepseekPrimaryModel = persisted.DeepseekPrimaryModel
		mongoFields++
	}
	if persisted.DeepseekRefineModel != "" {
		out.DeepseekRefineModel = persisted.DeepseekRefineModel
		mongoFields++
	}
	if persisted.BudgetUsdPerStudy > 0 {
		out.BudgetUsdPerStudy = persisted.BudgetUsdPerStudy
		mongoFields++
	}
	if persisted.BudgetUsdPerDay > 0 {
		out.BudgetUsdPerDay = persisted.BudgetUsdPerDay
		mongoFields++
	}
	if persisted.LookbackDays > 0 {
		out.LookbackDays = persisted.LookbackDays
		mongoFields++
	}
	if !persisted.UpdatedAt.IsZero() {
		out.UpdatedAt = persisted.UpdatedAt
	}
	// API-key configured flags: prefer persisted ciphertext presence;
	// fall back to env so an operator that hasn't migrated yet still
	// sees the legacy env-var-derived "已配置" badge.
	out.AnthropicAPIKeyConfigured = persisted.AnthropicAPIKeyCiphertext != "" || os.Getenv("ANTHROPIC_API_KEY") != ""
	out.OpenAIAPIKeyConfigured = persisted.OpenAIAPIKeyCiphertext != "" || os.Getenv("OPENAI_API_KEY") != ""
	out.DeepseekAPIKeyConfigured = persisted.DeepseekAPIKeyCiphertext != "" || os.Getenv("DEEPSEEK_API_KEY") != ""

	// Total tunable knobs (count of fields we count above) = 13. If
	// every one came from Mongo, "mongo"; otherwise "mixed" if any did,
	// else "env".
	switch {
	case mongoFields == 0:
		out.Source = "env"
	case mongoFields == 13:
		out.Source = "mongo"
	default:
		out.Source = "mixed"
	}
	return out
}

// GET /api/v1/admin/ai/config — effective config (Mongo overlay + env fallback).
func (h *AdminHandler) getAIConfig(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	persisted, err := h.system.GetAIConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, effectiveAIConfig(persisted))
}

// aiConfigPutBody is the wire shape accepted by PUT /admin/ai/config. It
// extends the persisted AIConfig with three plaintext API-key fields
// that this handler encrypts before persisting. These plaintext fields
// are JSON-only and NEVER serialised back: AIConfig.*Ciphertext use
// json:"-" so even if a future helper marshals AIConfig directly to a
// response, the plaintext / ciphertext pair stays server-side. The
// audit middleware additionally scrubs the *apikey/*ciphertext patterns
// before persisting the request body.
type aiConfigPutBody struct {
	domain.AIConfig
	AnthropicAPIKey string `json:"anthropicApiKey,omitempty"`
	OpenAIAPIKey    string `json:"openaiApiKey,omitempty"`
	DeepseekAPIKey  string `json:"deepseekApiKey,omitempty"`
}

// PUT /api/v1/admin/ai/config — partial update with validation.
//
// API keys are accepted as plaintext under `anthropicApiKey` /
// `openaiApiKey` / `deepseekApiKey`. The handler encrypts each non-empty
// value with the master KEK (AES-256-GCM, format
// base64(iv).base64(tag).base64(ciphertext) — byte-identical to the
// exchange envelope format) and stores it in the corresponding
// *Ciphertext field. An empty string preserves the persisted
// ciphertext (no-op); to clear a key, the operator must do a Mongo
// admin op directly (we do not surface a "delete" verb to avoid
// accidental wipes via a half-filled form). The response NEVER contains
// plaintext or ciphertext — only the *APIKeyConfigured booleans.
func (h *AdminHandler) putAIConfig(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	var body aiConfigPutBody
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := validateAIConfigPartial(&body.AIConfig); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Encrypt any plaintext API keys before merging. We require the
	// crypto service to be wired when keys are supplied; without it we
	// cannot honor the persist semantics, so 503 with a clear message.
	if body.AnthropicAPIKey != "" || body.OpenAIAPIKey != "" || body.DeepseekAPIKey != "" {
		if h.crypto == nil {
			return echo.NewHTTPError(http.StatusServiceUnavailable,
				"crypto service not configured; cannot persist API keys")
		}
		if body.AnthropicAPIKey != "" {
			ct, err := h.crypto.Encrypt(body.AnthropicAPIKey)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError,
					"encrypt anthropicApiKey: "+err.Error())
			}
			body.AIConfig.AnthropicAPIKeyCiphertext = ct
		}
		if body.OpenAIAPIKey != "" {
			ct, err := h.crypto.Encrypt(body.OpenAIAPIKey)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError,
					"encrypt openaiApiKey: "+err.Error())
			}
			body.AIConfig.OpenAIAPIKeyCiphertext = ct
		}
		if body.DeepseekAPIKey != "" {
			ct, err := h.crypto.Encrypt(body.DeepseekAPIKey)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError,
					"encrypt deepseekApiKey: "+err.Error())
			}
			body.AIConfig.DeepseekAPIKeyCiphertext = ct
		}
		// Zero plaintext immediately — defence in depth, in case any
		// future logging stub captures the struct by value.
		body.AnthropicAPIKey = ""
		body.OpenAIAPIKey = ""
		body.DeepseekAPIKey = ""
	}
	_ = body.AnthropicAPIKey // pin escape

	// Merge body onto any existing persisted config so partial PUTs
	// don't blow away already-tuned fields. We only overwrite fields
	// the caller actually set.
	existing, err := h.system.GetAIConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	merged := mergeAIConfig(existing, &body.AIConfig)

	// Cross-field check after merge — study cap ≤ day cap holds across
	// the *effective* config, not just the body in isolation.
	if merged.BudgetUsdPerStudy > 0 && merged.BudgetUsdPerDay > 0 &&
		merged.BudgetUsdPerStudy > merged.BudgetUsdPerDay {
		return echo.NewHTTPError(http.StatusBadRequest,
			"budgetUsdPerStudy must be <= budgetUsdPerDay")
	}

	if err := h.system.SetAIConfig(c.Request().Context(), merged); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// Re-read so the response reflects the upserted state including
	// the stamped updatedAt.
	persisted, err := h.system.GetAIConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, effectiveAIConfig(persisted))
}

// validateAIConfigPartial enforces field-level constraints. Fields with
// zero values are skipped (partial-PUT semantics).
func validateAIConfigPartial(p *domain.AIConfig) error {
	if p.ModelFamily != "" && p.ModelFamily != "claude" && p.ModelFamily != "openai" && p.ModelFamily != "deepseek" {
		return errors.New("modelFamily must be 'claude', 'openai', or 'deepseek'")
	}
	if p.BudgetUsdPerStudy < 0 || p.BudgetUsdPerDay < 0 {
		return errors.New("budgets must be > 0")
	}
	// We accept 0 to mean "unset" in partial PUT, but reject explicit
	// negative or zero-when-paired-with-the-other values that would
	// undercut the cross-field check. The spec calls for > 0 when
	// present; treat 0 as unset to keep partials ergonomic.
	if p.BudgetUsdPerStudy > 0 && p.BudgetUsdPerDay > 0 &&
		p.BudgetUsdPerStudy > p.BudgetUsdPerDay {
		return errors.New("budgetUsdPerStudy must be <= budgetUsdPerDay")
	}
	if p.LookbackDays != 0 && (p.LookbackDays < 7 || p.LookbackDays > 365) {
		return errors.New("lookbackDays must be in [7, 365]")
	}
	// Model name strings — empty is fine (means unset); explicitly
	// whitespace-only is rejected as a clear typo signal.
	for _, name := range []string{
		p.AnthropicPrimaryModel,
		p.AnthropicRefineModel,
		p.OpenAIPrimaryModel,
		p.OpenAIRefineModel,
		p.DeepseekPrimaryModel,
		p.DeepseekRefineModel,
	} {
		if name != "" && strings.TrimSpace(name) == "" {
			return errors.New("model name strings must be non-empty when provided")
		}
	}
	if p.AnthropicBaseURL != "" {
		if err := validateBaseURL(p.AnthropicBaseURL); err != nil {
			return errors.New("anthropicBaseURL invalid: " + err.Error())
		}
	}
	if p.OpenAIBaseURL != "" {
		if err := validateBaseURL(p.OpenAIBaseURL); err != nil {
			return errors.New("openaiBaseURL invalid: " + err.Error())
		}
	}
	if p.DeepseekBaseURL != "" {
		if err := validateBaseURL(p.DeepseekBaseURL); err != nil {
			return errors.New("deepseekBaseURL invalid: " + err.Error())
		}
	}
	return nil
}

func validateBaseURL(s string) error {
	u, err := url.Parse(s)
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("scheme must be http or https")
	}
	if u.Host == "" {
		return errors.New("host required")
	}
	return nil
}

// mergeAIConfig returns a fresh AIConfig with each field taken from
// `body` when set, falling back to `existing` (possibly nil). UpdatedAt
// is left zero — SetAIConfig stamps it.
func mergeAIConfig(existing, body *domain.AIConfig) *domain.AIConfig {
	out := &domain.AIConfig{}
	if existing != nil {
		*out = *existing
		out.UpdatedAt = time.Time{}
	}
	if body.ModelFamily != "" {
		out.ModelFamily = body.ModelFamily
	}
	if body.AnthropicPrimaryModel != "" {
		out.AnthropicPrimaryModel = body.AnthropicPrimaryModel
	}
	if body.AnthropicRefineModel != "" {
		out.AnthropicRefineModel = body.AnthropicRefineModel
	}
	if body.OpenAIPrimaryModel != "" {
		out.OpenAIPrimaryModel = body.OpenAIPrimaryModel
	}
	if body.OpenAIRefineModel != "" {
		out.OpenAIRefineModel = body.OpenAIRefineModel
	}
	if body.AnthropicBaseURL != "" {
		out.AnthropicBaseURL = body.AnthropicBaseURL
	}
	if body.OpenAIBaseURL != "" {
		out.OpenAIBaseURL = body.OpenAIBaseURL
	}
	if body.DeepseekBaseURL != "" {
		out.DeepseekBaseURL = body.DeepseekBaseURL
	}
	if body.DeepseekPrimaryModel != "" {
		out.DeepseekPrimaryModel = body.DeepseekPrimaryModel
	}
	if body.DeepseekRefineModel != "" {
		out.DeepseekRefineModel = body.DeepseekRefineModel
	}
	// Ciphertexts: an empty body value means "leave persisted untouched";
	// the actual encryption happens in putAIConfig from plaintext, so by
	// the time we land here body.*Ciphertext is already set (or empty).
	if body.AnthropicAPIKeyCiphertext != "" {
		out.AnthropicAPIKeyCiphertext = body.AnthropicAPIKeyCiphertext
	}
	if body.OpenAIAPIKeyCiphertext != "" {
		out.OpenAIAPIKeyCiphertext = body.OpenAIAPIKeyCiphertext
	}
	if body.DeepseekAPIKeyCiphertext != "" {
		out.DeepseekAPIKeyCiphertext = body.DeepseekAPIKeyCiphertext
	}
	if body.BudgetUsdPerStudy > 0 {
		out.BudgetUsdPerStudy = body.BudgetUsdPerStudy
	}
	if body.BudgetUsdPerDay > 0 {
		out.BudgetUsdPerDay = body.BudgetUsdPerDay
	}
	if body.LookbackDays > 0 {
		out.LookbackDays = body.LookbackDays
	}
	return out
}

// GET /api/v1/admin/ai/prompts — forwards to quant gRPC GetAIConfig.
//
// The parallel quant agent's commit adds the RPC; until then the gateway
// returns 503 with a clear message so the UI can render a "quant not
// upgraded" hint instead of a generic error.
func (h *AdminHandler) getAIPrompts(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.quant == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable,
			"quant gRPC client not configured")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()
	resp, err := h.quant.GetAIConfig(ctx)
	if err != nil {
		// status.FromError handles both wrapped (ErrQuantGetAIConfigUnimplemented)
		// and direct gRPC status returns transparently.
		if st, ok := status.FromError(errors.Unwrap(err)); ok && st.Code() == codes.Unimplemented {
			return echo.NewHTTPError(http.StatusServiceUnavailable,
				"quant 暂未支持，请升级 quant 版本")
		}
		if st, ok := status.FromError(err); ok && st.Code() == codes.Unimplemented {
			return echo.NewHTTPError(http.StatusServiceUnavailable,
				"quant 暂未支持，请升级 quant 版本")
		}
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return c.JSON(http.StatusOK, resp)
}

// ---- tiny env helpers ---------------------------------------------------

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envOrFloat(key string, def float64) float64 {
	raw := os.Getenv(key)
	if raw == "" {
		return def
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func envOrInt(key string, def int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return def
	}
	return v
}
