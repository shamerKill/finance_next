// strategy.go — Phase 4 strategy detail / order log / live toggle.
//
// These endpoints sit alongside the legacy /api/v1/option resource (which
// is the underlying Mongo collection). We intentionally keep both paths
// — `/option` retains the Phase 0 contract for the existing UI; the new
// `/strategies/:id/...` paths are the Phase 4 surface.
package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/orderengine"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// StrategyHandler wires the new endpoints. Each dependency may be nil;
// the handler returns a clean 503 in that case.
type StrategyHandler struct {
	options  *mongostore.OptionRepo
	orders   *mongostore.OrderRepo
	engine   *orderengine.Engine
	adminKey string
}

// NewStrategyHandler builds the handler.
func NewStrategyHandler(
	options *mongostore.OptionRepo,
	orders *mongostore.OrderRepo,
	engine *orderengine.Engine,
	adminKey string,
) *StrategyHandler {
	return &StrategyHandler{options: options, orders: orders, engine: engine, adminKey: adminKey}
}

// Register binds /strategies/* + /admin/mainnet/* onto the v1 group.
//
// admin/mainnet/* 路由始终挂载；cookie role=admin 或 X-Admin-Key 任一
// 通过即可访问。
func (h *StrategyHandler) Register(g *echo.Group) {
	g.GET("/strategies/:id/orders", h.listOrders)
	g.POST("/strategies/:id/live", h.setLive)
	g.POST("/strategies/:id/live/submit-order", h.submitOrder)

	g.POST("/admin/mainnet/request-token", h.requestMainnetToken)
	g.POST("/admin/mainnet/confirm", h.confirmMainnetToken)
	g.GET("/admin/mainnet/status", h.mainnetStatus)
}

// ---- GET /api/v1/strategies/:id/orders -----------------------------------

func (h *StrategyHandler) listOrders(c echo.Context) error {
	if h.orders == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "order repo not configured")
	}
	id := c.Param("id")
	limit := 50
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	var before time.Time
	if b := c.QueryParam("before"); b != "" {
		t, err := time.Parse(time.RFC3339, b)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid before: "+err.Error())
		}
		before = t
	}
	out, err := h.orders.ListByStrategy(c.Request().Context(), id, mongostore.ListByStrategyOptions{
		Limit:  limit,
		Before: before,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

// ---- POST /api/v1/strategies/:id/live ------------------------------------
// Body: {enabled: bool, accountId?: string, mode?: "testnet"|"mainnet"}
//
// Switching to mainnet requires that the mainnet gate is currently open
// (env enabled + a confirmed token). Otherwise we 4xx out and the strategy
// stays unchanged.
func (h *StrategyHandler) setLive(c echo.Context) error {
	if h.options == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "option repo not configured")
	}
	id := c.Param("id")
	var body struct {
		Enabled   *bool   `json:"enabled"`
		AccountID *string `json:"accountId"`
		Mode      *string `json:"mode"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	opt, err := h.options.FindByID(c.Request().Context(), id)
	if errors.Is(err, mongostore.ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	live := domain.LiveConfig{}
	if opt.Live != nil {
		live = *opt.Live
	}
	if body.Enabled != nil {
		live.Enabled = *body.Enabled
	}
	if body.AccountID != nil {
		live.AccountID = *body.AccountID
	}
	if body.Mode != nil {
		m := domain.LiveMode(*body.Mode)
		if !m.IsValid() {
			return echo.NewHTTPError(http.StatusBadRequest, "mode must be testnet or mainnet")
		}
		live.Mode = m
	}
	if live.Mode == "" {
		live.Mode = domain.LiveModeTestnet
	}
	// Mainnet gate check: switching to mainnet AND enabling means the
	// current mainnet gate must be open. We deliberately gate at toggle
	// time so the engine's per-call check doesn't repeatedly hit the
	// store. The engine still re-checks, defence-in-depth.
	if live.Enabled && live.Mode == domain.LiveModeMainnet {
		if h.engine == nil {
			return echo.NewHTTPError(http.StatusServiceUnavailable, "order engine not configured")
		}
		if !h.engine.Gate().Allowed() {
			return echo.NewHTTPError(http.StatusForbidden,
				"mainnet trading not enabled: set MAINNET_TRADING_ENABLED=true and POST /admin/mainnet/confirm a fresh token first")
		}
	}
	if live.Enabled && live.AccountID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "accountId required when enabling live")
	}
	if live.Enabled && live.StartedAt == nil {
		now := time.Now().UTC()
		live.StartedAt = &now
	}
	updated, err := h.options.UpdateByID(c.Request().Context(), id, bson.M{"live": live})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, updated)
}

// ---- POST /api/v1/strategies/:id/live/submit-order -----------------------
// Admin-only manual submission. Auth: same X-Admin-Key as /market/ingest.
// Body shape mirrors domain.SubmitOrderCommand minus the strategyId
// (taken from the path).
func (h *StrategyHandler) submitOrder(c echo.Context) error {
	if h.engine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "order engine not configured")
	}
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	var body struct {
		AccountID      string  `json:"accountId"`
		Symbol         string  `json:"symbol"`
		Side           string  `json:"side"`
		Type           string  `json:"type"`
		Qty            float64 `json:"qty"`
		Price          float64 `json:"price,omitempty"`
		MarkPrice      float64 `json:"markPrice,omitempty"`
		IdempotencyKey string  `json:"idempotencyKey,omitempty"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	cmd := domain.SubmitOrderCommand{
		StrategyID:     c.Param("id"),
		AccountID:      body.AccountID,
		Symbol:         body.Symbol,
		Side:           domain.OrderSide(body.Side),
		Type:           domain.OrderType(body.Type),
		Qty:            body.Qty,
		Price:          body.Price,
		MarkPrice:      body.MarkPrice,
		IdempotencyKey: body.IdempotencyKey,
	}
	id, err := h.engine.Submit(c.Request().Context(), cmd)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusAccepted, echo.Map{"streamId": id})
}

// ---- Admin mainnet flow --------------------------------------------------

func (h *StrategyHandler) requestMainnetToken(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	if h.engine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "order engine not configured")
	}
	tok, err := h.engine.Gate().RequestToken()
	if err != nil {
		// ErrEnvDisabled → 403 (clear signal: the env var isn't set).
		if errors.Is(err, orderengine.ErrEnvDisabled) {
			return echo.NewHTTPError(http.StatusForbidden, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// We deliberately do NOT return the token in the response body in
	// production, so a single leaked admin key isn't sufficient. The
	// operator must read it from the gateway logs ("EMAIL CONFIRMATION
	// REQUIRED: token=…"). For dev convenience we return its prefix
	// only. Phase 7 will replace with a real email round-trip.
	mask := tok[:8] + "…"
	return c.JSON(http.StatusOK, echo.Map{
		"message":   "token issued; check gateway logs for full value",
		"tokenHint": mask,
		"ttlSec":    int(orderengine.RequestTTL.Seconds()),
	})
}

func (h *StrategyHandler) confirmMainnetToken(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	if h.engine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "order engine not configured")
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if body.Token == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token required")
	}
	if err := h.engine.Gate().Confirm(body.Token); err != nil {
		switch {
		case errors.Is(err, orderengine.ErrEnvDisabled):
			return echo.NewHTTPError(http.StatusForbidden, err.Error())
		case errors.Is(err, orderengine.ErrTokenUnknown):
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}
	return c.JSON(http.StatusOK, h.engine.Gate().Snapshot())
}

func (h *StrategyHandler) mainnetStatus(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	if h.engine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "order engine not configured")
	}
	return c.JSON(http.StatusOK, h.engine.Gate().Snapshot())
}
