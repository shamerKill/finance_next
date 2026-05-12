// backtest.go — REST endpoints for the Phase 3 backtest engine.
//
// These handlers don't run the backtest themselves — they:
//
//  1. POST /api/v1/backtests              → forward to Quant.RunBacktest gRPC.
//  2. GET  /api/v1/backtests              → read head docs from Mongo.
//  3. GET  /api/v1/backtests/:id          → read one head doc.
//  4. GET  /api/v1/backtests/:id/equity   → read equity_curve from Timescale.
//  5. GET  /api/v1/backtests/:id/trades   → trades subset of head doc.
//
// Live progress goes through the WS hub (see ws/redis_backtest.go).

package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	quantv1 "github.com/finance_next/shared-proto/gen/go/quantpb/v1"
	"github.com/labstack/echo/v4"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// BacktestHandler wires all /backtests routes.
type BacktestHandler struct {
	repo  *mongostore.BacktestRepo
	store *timescale.Store
	quant quantclient.Client
}

// NewBacktestHandler builds a handler. Each dep may be nil; the handler
// returns 503 in that case so dev environments without a piece of infra
// get a clear error rather than crashing.
func NewBacktestHandler(
	repo *mongostore.BacktestRepo,
	store *timescale.Store,
	quant quantclient.Client,
) *BacktestHandler {
	return &BacktestHandler{repo: repo, store: store, quant: quant}
}

// Register binds /backtests routes onto the v1 group.
func (h *BacktestHandler) Register(g *echo.Group) {
	g.POST("/backtests", h.create)
	g.GET("/backtests", h.list)
	g.GET("/backtests/:id", h.findOne)
	g.GET("/backtests/:id/equity", h.equity)
	g.GET("/backtests/:id/trades", h.trades)
}

// ---- POST /api/v1/backtests -----------------------------------------------

type createBacktestBody struct {
	StrategyID      string         `json:"strategyId"      validate:"required"`
	Kind            string         `json:"kind"`
	Params          map[string]any `json:"params"`
	Symbol          string         `json:"symbol"          validate:"required"`
	Exchange        string         `json:"exchange"        validate:"required"`
	Timeframe       string         `json:"timeframe"       validate:"required"`
	Start           string         `json:"start"           validate:"required"`
	End             string         `json:"end"             validate:"required"`
	InitialCapital  float64        `json:"initialCapital"`
	CommissionRate  float64        `json:"commissionRate"`
	SlippageBps     float64        `json:"slippageBps"`
}

type createBacktestResponse struct {
	RunID      string    `json:"runId"`
	EnqueuedAt time.Time `json:"enqueuedAt"`
}

func (h *BacktestHandler) create(c echo.Context) error {
	if h.quant == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "quant grpc client not configured")
	}
	var body createBacktestBody
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON body")
	}
	if body.StrategyID == "" || body.Symbol == "" || body.Exchange == "" || body.Timeframe == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "strategyId/symbol/exchange/timeframe required")
	}
	if _, ok := allowedTimeframes[body.Timeframe]; !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "timeframe must be one of 1m, 5m, 1h, 1d")
	}
	start, err := parseTime(body.Start)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := parseTime(body.End)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}
	// initialCapital is optional (defaults to 10_000 inside the worker), but
	// reject explicitly-negative values so a typo doesn't silently fall back.
	if body.InitialCapital < 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "initialCapital must be >= 0")
	}
	kind := body.Kind
	if kind == "" {
		kind = "grid_dca"
	}

	paramsStruct, err := structpb.NewStruct(coerceForStruct(body.Params))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "params is not a JSON object: "+err.Error())
	}

	req := &quantv1.BacktestRequest{
		StrategyId:     body.StrategyID,
		Kind:           kind,
		Params:         paramsStruct,
		Symbol:         body.Symbol,
		Exchange:       body.Exchange,
		Timeframe:      body.Timeframe,
		Start:          timestamppb.New(start),
		End:            timestamppb.New(end),
		InitialCapital: body.InitialCapital,
		CommissionRate: body.CommissionRate,
		SlippageBps:    body.SlippageBps,
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()
	handle, err := h.quant.RunBacktest(ctx, req)
	if err != nil {
		c.Logger().Errorf("quant.RunBacktest failed: %v", err)
		return echo.NewHTTPError(http.StatusBadGateway, "quant RunBacktest failed: "+err.Error())
	}
	return c.JSON(http.StatusAccepted, createBacktestResponse{
		RunID:      handle.GetRunId(),
		EnqueuedAt: handle.GetEnqueuedAt().AsTime(),
	})
}

// coerceForStruct converts maps with non-string keys (rare in JSON, but
// possible after some deserialisers) into structpb-friendly shapes.
// For our path the input always comes from echo's JSON decoder so keys
// are already strings — this is defensive only.
func coerceForStruct(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	return in
}

// ---- GET /api/v1/backtests ------------------------------------------------

func (h *BacktestHandler) list(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "mongo not configured for backtests")
	}
	strategyID := c.QueryParam("strategyId")
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	docs, err := h.repo.FindAllForUser(c.Request().Context(), gwmw.FromEcho(c), strategyID, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, docs)
}

// ---- GET /api/v1/backtests/:id --------------------------------------------

func (h *BacktestHandler) findOne(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "mongo not configured for backtests")
	}
	doc, err := h.repo.FindByIDForUser(c.Request().Context(), gwmw.FromEcho(c), c.Param("id"))
	if errors.Is(err, mongostore.ErrBacktestNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "backtest not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, doc)
}

// ---- GET /api/v1/backtests/:id/equity -------------------------------------

func (h *BacktestHandler) equity(c echo.Context) error {
	if h.store == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "timescale not configured")
	}
	limit := 50_000
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50_000 {
			limit = v
		}
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	rows, err := h.store.QueryEquityCurve(ctx, c.Param("id"), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// Naive downsampling: if rows > limit/2 (i.e. caller didn't specify an
	// aggressive limit) but the dataset is huge, we'd downsample here. For
	// Phase 3 we just cap via the SQL LIMIT and let the UI paint all bars
	// — typical backtests have ≤ 5000 bars (≈ 200 trading days @ daily).
	return c.JSON(http.StatusOK, rows)
}

// ---- GET /api/v1/backtests/:id/trades -------------------------------------

func (h *BacktestHandler) trades(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "mongo not configured for backtests")
	}
	doc, err := h.repo.FindByIDForUser(c.Request().Context(), gwmw.FromEcho(c), c.Param("id"))
	if errors.Is(err, mongostore.ErrBacktestNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "backtest not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, doc.Trades)
}
