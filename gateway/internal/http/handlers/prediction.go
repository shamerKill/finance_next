// prediction.go — Phase 9 prediction-market read endpoints + admin
// ingest trigger.
//
// Read endpoints:
//   GET /api/v1/prediction/markets[?category=&active=&limit=&offset=]
//   GET /api/v1/prediction/markets/:id
//   GET /api/v1/prediction/quotes?token_id=&start=&end=
//   GET /api/v1/prediction/trades?market_id=&limit=
//
// Admin ingest:
//   POST /api/v1/admin/ingest/prediction      (XADD command.ingest.prediction)
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

// PredictionHandler bundles the read + admin-ingest routes.
type PredictionHandler struct {
	store    *timescale.Store
	redis    *redis.Client
	adminKey string
}

// NewPredictionHandler builds the handler.
func NewPredictionHandler(store *timescale.Store, redisClient *redis.Client, adminKey string) *PredictionHandler {
	return &PredictionHandler{store: store, redis: redisClient, adminKey: adminKey}
}

// Register binds /prediction/* + admin/ingest/prediction.
//
// admin/ingest/prediction 始终挂载；cookie role=admin 或 X-Admin-Key 任
// 一通过即可访问。
func (h *PredictionHandler) Register(g *echo.Group) {
	g.GET("/prediction/markets", h.listMarkets)
	g.GET("/prediction/markets/:id", h.getMarket)
	g.GET("/prediction/quotes", h.getQuotes)
	g.GET("/prediction/trades", h.getTrades)
	g.POST("/admin/ingest/prediction", h.adminIngest)
}

func (h *PredictionHandler) requireStore() error {
	if h.store == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "timescale not configured")
	}
	return nil
}

func (h *PredictionHandler) listMarkets(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	category := c.QueryParam("category")
	activeOnly := c.QueryParam("active") == "true"
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	offset := 0
	if o := c.QueryParam("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryPredictionMarkets(ctx, category, activeOnly, limit, offset)
	if err != nil {
		c.Logger().Errorf("prediction markets query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query markets")
	}
	return c.JSON(http.StatusOK, rows)
}

func (h *PredictionHandler) getMarket(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()
	m, err := h.store.FindPredictionMarket(ctx, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "market not found")
	}
	return c.JSON(http.StatusOK, m)
}

func (h *PredictionHandler) getQuotes(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	tokenID := c.QueryParam("token_id")
	if tokenID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token_id required")
	}
	start, err := optionalTime(c.QueryParam("start"), time.Now().Add(-30*24*time.Hour))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := optionalTime(c.QueryParam("end"), time.Now().Add(24*time.Hour))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryPredictionQuotes(ctx, tokenID, start, end, 50_000)
	if err != nil {
		c.Logger().Errorf("prediction quotes query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query quotes")
	}
	return c.JSON(http.StatusOK, rows)
}

func (h *PredictionHandler) getTrades(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	marketID := c.QueryParam("market_id")
	if marketID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "market_id required")
	}
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryPredictionTrades(ctx, marketID, limit)
	if err != nil {
		c.Logger().Errorf("prediction trades query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query trades")
	}
	return c.JSON(http.StatusOK, rows)
}

func (h *PredictionHandler) adminIngest(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	if h.redis == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "redis not configured")
	}
	var body map[string]any
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON body")
	}
	if body == nil {
		body = map[string]any{}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()
	id, err := h.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: "command.ingest.prediction",
		Values: map[string]any{"data": string(raw)},
	}).Result()
	if err != nil {
		c.Logger().Errorf("XADD command.ingest.prediction failed: %v", err)
		return echo.NewHTTPError(http.StatusBadGateway, "redis publish failed")
	}
	return c.JSON(http.StatusAccepted, echo.Map{
		"stream":    "command.ingest.prediction",
		"messageId": id,
	})
}
