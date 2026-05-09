// optimization.go — Phase 6 endpoints for the "Tune now" manual trigger
// + study status reads.
//
//   POST /api/v1/strategies/:id/optimize  — calls Quant.StartOptimization
//   GET  /api/v1/optimizations             — list runs (filter by ?strategyId)
//   GET  /api/v1/optimizations/:id         — read head doc from Mongo
//
// The cron flow (auto-trigger every 24h for live strategies) sits in
// quant/src/quant/workers/optimize.py — that path doesn't touch the
// gateway. These endpoints only cover the manual + read paths.
package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	quantv1 "github.com/finance_next/shared-proto/gen/go/quantpb/v1"
	"github.com/labstack/echo/v4"
)

// OptimizationHandler wires the optimization routes.
type OptimizationHandler struct {
	repo  *mongostore.OptimizationRunRepo
	quant quantclient.Client
}

// NewOptimizationHandler builds the handler.
func NewOptimizationHandler(
	repo *mongostore.OptimizationRunRepo,
	quant quantclient.Client,
) *OptimizationHandler {
	return &OptimizationHandler{repo: repo, quant: quant}
}

// Register binds the optimization routes onto the v1 group.
func (h *OptimizationHandler) Register(g *echo.Group) {
	g.POST("/strategies/:id/optimize", h.startOptimization)
	g.GET("/optimizations", h.list)
	g.GET("/optimizations/:id", h.findOne)
}

// ---- POST /api/v1/strategies/:id/optimize -------------------------------

type startOptimizationBody struct {
	Force           bool  `json:"force"`
	NTrialsOverride int32 `json:"nTrialsOverride"`
}

type startOptimizationResponse struct {
	StudyID    string    `json:"studyId"`
	EnqueuedAt time.Time `json:"enqueuedAt"`
}

func (h *OptimizationHandler) startOptimization(c echo.Context) error {
	if h.quant == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "quant grpc client not configured")
	}
	id := c.Param("id")
	if id == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "strategy id required")
	}
	var body startOptimizationBody
	if err := c.Bind(&body); err != nil {
		// Accept empty body — both flags are optional.
		body = startOptimizationBody{}
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()
	handle, err := h.quant.StartOptimization(ctx, &quantv1.OptimizationRequest{
		StrategyId:      id,
		Force:           body.Force,
		NTrialsOverride: body.NTrialsOverride,
	})
	if err != nil {
		c.Logger().Errorf("quant.StartOptimization failed: %v", err)
		return echo.NewHTTPError(http.StatusBadGateway, "quant StartOptimization failed: "+err.Error())
	}
	return c.JSON(http.StatusAccepted, startOptimizationResponse{
		StudyID:    handle.GetStudyId(),
		EnqueuedAt: handle.GetEnqueuedAt().AsTime(),
	})
}

// ---- GET /api/v1/optimizations ------------------------------------------

func (h *OptimizationHandler) list(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "optimization repo not configured")
	}
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	docs, err := h.repo.FindAll(
		c.Request().Context(),
		c.QueryParam("strategyId"),
		limit,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, docs)
}

// ---- GET /api/v1/optimizations/:id --------------------------------------

func (h *OptimizationHandler) findOne(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "optimization repo not configured")
	}
	doc, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrOptimizationRunNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "optimization run not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, doc)
}
