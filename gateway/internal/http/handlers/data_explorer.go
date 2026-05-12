// data_explorer.go — Phase 8 read endpoints for the extended data sources
// (equities / futures OHLCV both share the existing `ohlcv` table with
// venue-prefixed exchange codes; macro / on-chain / news land here too).
//
// Plus admin-gated ingest triggers (XADD onto command.ingest.<kind>; the
// quant worker has a Redis-Streams consumer that dispatches to the
// matching `run_*_ingest` function).

package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

// DataExplorerHandler bundles the Phase 8 read + admin-ingest endpoints.
//
// Each store dep is optional — when nil the corresponding endpoint
// returns 503; gateway boot wires them when Timescale is configured.
type DataExplorerHandler struct {
	store    *timescale.Store
	redis    *redis.Client
	adminKey string
}

// NewDataExplorerHandler builds the handler.
func NewDataExplorerHandler(
	store *timescale.Store,
	redisClient *redis.Client,
	adminKey string,
) *DataExplorerHandler {
	return &DataExplorerHandler{store: store, redis: redisClient, adminKey: adminKey}
}

// Register binds Phase 8 routes onto the v1 group.
//
// admin/ingest/* 路由始终挂载；cookie role=admin 或 X-Admin-Key 任一通
// 过即可访问。
func (h *DataExplorerHandler) Register(g *echo.Group) {
	// Read endpoints (no auth)
	g.GET("/equities/ohlcv", h.getOhlcv)
	g.GET("/futures/ohlcv", h.getOhlcv)
	g.GET("/macro/indicators", h.getMacro)
	g.GET("/onchain/metrics", h.getOnchain)
	g.GET("/news", h.getNews)

	g.POST("/admin/ingest/equities", h.adminIngest("equities"))
	g.POST("/admin/ingest/futures", h.adminIngest("futures"))
	g.POST("/admin/ingest/macro", h.adminIngest("macro"))
	g.POST("/admin/ingest/onchain", h.adminIngest("onchain"))
	g.POST("/admin/ingest/news", h.adminIngest("news"))
}

// ---- shared helpers --------------------------------------------------------

func (h *DataExplorerHandler) requireStore() error {
	if h.store == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "timescale not configured")
	}
	return nil
}

func (h *DataExplorerHandler) authAdmin(c echo.Context) error {
	if !IsAdminRequest(c, h.adminKey) {
		return echo.NewHTTPError(http.StatusForbidden, "forbidden")
	}
	return nil
}

// ---- GET /api/v1/{equities,futures}/ohlcv ----------------------------------
// Same shape as /api/v1/market/ohlcv — distinct path so the UI can route
// per-asset-class without exposing the venue prefix gymnastics.
func (h *DataExplorerHandler) getOhlcv(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	exchange := c.QueryParam("exchange")
	symbol := c.QueryParam("symbol")
	if symbol == "" {
		// /futures/ohlcv accepts ?contract= as a friendlier alias.
		symbol = c.QueryParam("contract")
	}
	timeframe := c.QueryParam("timeframe")
	if timeframe == "" {
		timeframe = "1d"
	}
	startStr := c.QueryParam("start")
	endStr := c.QueryParam("end")
	if exchange == "" || symbol == "" || startStr == "" || endStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "exchange, symbol, start, end are required")
	}
	if _, ok := allowedTimeframes[timeframe]; !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "timeframe must be one of 1m, 5m, 1h, 1d")
	}
	start, err := parseTime(startStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := parseTime(endStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()

	bars, err := h.store.Query(ctx, exchange, symbol, timeframe, start, end, maxBarsPerQuery)
	if err != nil {
		c.Logger().Errorf("ohlcv query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query data")
	}
	return c.JSON(http.StatusOK, bars)
}

// ---- GET /api/v1/macro/indicators ?source=&code=&start=&end= --------------
func (h *DataExplorerHandler) getMacro(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	source := c.QueryParam("source")
	code := c.QueryParam("code")
	if source == "" || code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source, code are required")
	}
	startStr := c.QueryParam("start")
	endStr := c.QueryParam("end")
	start, err := optionalTime(startStr, time.Now().AddDate(-5, 0, 0))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := optionalTime(endStr, time.Now().Add(24*time.Hour))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryMacro(ctx, source, code, start, end, 50_000)
	if err != nil {
		c.Logger().Errorf("macro query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query macro data")
	}
	return c.JSON(http.StatusOK, rows)
}

// ---- GET /api/v1/onchain/metrics ?chain=&metric=&start=&end= --------------
func (h *DataExplorerHandler) getOnchain(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	chain := c.QueryParam("chain")
	metric := c.QueryParam("metric")
	if chain == "" || metric == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "chain, metric are required")
	}
	startStr := c.QueryParam("start")
	endStr := c.QueryParam("end")
	start, err := optionalTime(startStr, time.Now().AddDate(0, -3, 0))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := optionalTime(endStr, time.Now().Add(24*time.Hour))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryOnchain(ctx, chain, metric, start, end, 50_000)
	if err != nil {
		c.Logger().Errorf("onchain query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query onchain data")
	}
	return c.JSON(http.StatusOK, rows)
}

// ---- GET /api/v1/news ?symbols=&since=&limit= ------------------------------
func (h *DataExplorerHandler) getNews(c echo.Context) error {
	if err := h.requireStore(); err != nil {
		return err
	}
	symbolsRaw := c.QueryParam("symbols")
	var symbols []string
	if symbolsRaw != "" {
		for _, s := range strings.Split(symbolsRaw, ",") {
			if t := strings.TrimSpace(s); t != "" {
				symbols = append(symbols, t)
			}
		}
	}
	var since time.Time
	if s := c.QueryParam("since"); s != "" {
		t, err := parseTime(s)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid since: "+err.Error())
		}
		since = t
	}
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryNews(ctx, symbols, since, limit)
	if err != nil {
		c.Logger().Errorf("news query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query news")
	}
	return c.JSON(http.StatusOK, rows)
}

// ---- POST /api/v1/admin/ingest/<kind> -------------------------------------
//
// Body is forwarded as a JSON kwargs object to the quant worker's
// ``run_<kind>_ingest`` function via the
// ``command.ingest.<kind>`` Redis stream. The Python-side consumer
// filters unknown keys, so callers can pass through caller-side
// configs without coordinating a schema.
func (h *DataExplorerHandler) adminIngest(kind string) echo.HandlerFunc {
	stream := "command.ingest." + kind
	return func(c echo.Context) error {
		if err := h.authAdmin(c); err != nil {
			return err
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
			return echo.NewHTTPError(http.StatusInternalServerError, "marshal: "+err.Error())
		}
		ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
		defer cancel()
		id, err := h.redis.XAdd(ctx, &redis.XAddArgs{
			Stream: stream,
			Values: map[string]any{"data": string(raw)},
		}).Result()
		if err != nil {
			c.Logger().Errorf("XADD %s failed: %v", stream, err)
			return echo.NewHTTPError(http.StatusBadGateway, "redis publish failed")
		}
		return c.JSON(http.StatusAccepted, map[string]any{
			"stream":    stream,
			"messageId": id,
		})
	}
}

// optionalTime parses an RFC3339 / unix-secs timestamp, falling back to
// the supplied default when the string is empty.
func optionalTime(s string, fallback time.Time) (time.Time, error) {
	if s == "" {
		return fallback, nil
	}
	return parseTime(s)
}
