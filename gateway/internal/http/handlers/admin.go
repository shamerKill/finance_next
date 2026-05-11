// admin.go — Phase 7 admin endpoints: kill switch, portfolio limits, audit
// log viewer.
//
// All endpoints require the `X-Admin-Key` header to match the configured
// ADMIN_KEY env var. When ADMIN_KEY is unset the entire group returns 404
// (the same hide-by-default pattern used for /market/ingest).
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
)

// AdminHandler bundles the admin endpoints together so wiring stays
// compact in router.go.
type AdminHandler struct {
	system   *mongostore.SystemRepo
	audit    *mongostore.AuditRepo
	adminKey string
}

// NewAdminHandler builds the handler. system and audit may be nil — in
// that case the relevant subset of routes returns 503.
func NewAdminHandler(system *mongostore.SystemRepo, audit *mongostore.AuditRepo, adminKey string) *AdminHandler {
	return &AdminHandler{system: system, audit: audit, adminKey: adminKey}
}

// Register binds the admin routes onto the v1 group.
func (h *AdminHandler) Register(g *echo.Group) {
	if h.adminKey == "" {
		// Hidden when no admin key configured.
		return
	}
	g.POST("/admin/halt", h.halt)
	g.POST("/admin/resume", h.resume)
	g.GET("/admin/system-state", h.systemState)
	g.PUT("/admin/portfolio-limits", h.setPortfolioLimits)
	g.GET("/admin/portfolio-limits", h.getPortfolioLimits)
	g.GET("/admin/audit", h.listAudit)
}

func (h *AdminHandler) auth(c echo.Context) error {
	if c.Request().Header.Get("X-Admin-Key") != h.adminKey {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid admin key")
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
