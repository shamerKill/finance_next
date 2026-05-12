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
}

// NewAdminHandler builds the handler. system / audit / quant may all be
// nil — in that case the relevant subset of routes returns 503.
func NewAdminHandler(
	system *mongostore.SystemRepo,
	audit *mongostore.AuditRepo,
	quant quantclient.Client,
	adminKey string,
) *AdminHandler {
	return &AdminHandler{system: system, audit: audit, quant: quant, adminKey: adminKey}
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
	BudgetUsdPerStudy     float64   `json:"budgetUsdPerStudy"`
	BudgetUsdPerDay       float64   `json:"budgetUsdPerDay"`
	LookbackDays          int       `json:"lookbackDays"`
	UpdatedAt             time.Time `json:"updatedAt,omitempty"`

	AnthropicConfigured bool   `json:"anthropicConfigured"`
	OpenAIConfigured    bool   `json:"openaiConfigured"`
	Source              string `json:"source"`
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
		BudgetUsdPerStudy:     envOrFloat("AI_MAX_USD_PER_STUDY", 5.0),
		BudgetUsdPerDay:       envOrFloat("AI_MAX_USD_PER_DAY", 50.0),
		LookbackDays:          envOrInt("AI_OPTIMIZATION_LOOKBACK_DAYS", 90),
		AnthropicConfigured:   os.Getenv("ANTHROPIC_API_KEY") != "",
		OpenAIConfigured:      os.Getenv("OPENAI_API_KEY") != "",
		Source:                "env",
	}
	if persisted == nil {
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
	// Total tunable fields = 10. If every one came from Mongo, "mongo";
	// otherwise "mixed" if any did, else "env".
	switch {
	case mongoFields == 0:
		out.Source = "env"
	case mongoFields == 10:
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

// PUT /api/v1/admin/ai/config — partial update with validation.
func (h *AdminHandler) putAIConfig(c echo.Context) error {
	if err := h.auth(c); err != nil {
		return err
	}
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	var body domain.AIConfig
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := validateAIConfigPartial(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Merge body onto any existing persisted config so partial PUTs
	// don't blow away already-tuned fields. We only overwrite fields
	// the caller actually set.
	existing, err := h.system.GetAIConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	merged := mergeAIConfig(existing, &body)

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
	if p.ModelFamily != "" && p.ModelFamily != "claude" && p.ModelFamily != "openai" {
		return errors.New("modelFamily must be 'claude' or 'openai'")
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
