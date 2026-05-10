// prediction_strategy.go — Phase 9 prediction strategy CRUD + live toggle
// + admin manual submit-order.
//
// Routes (mounted under /api/v1):
//   GET    /prediction/strategies
//   POST   /prediction/strategies
//   GET    /prediction/strategies/:id
//   PUT    /prediction/strategies/:id
//   DELETE /prediction/strategies/:id
//   POST   /prediction/strategies/:id/live
//   POST   /prediction/strategies/:id/live/submit-order   (X-Admin-Key)
//   GET    /prediction/strategies/:id/orders
package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/prediction/engine"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// PredictionStrategyHandler bundles the prediction strategy routes.
type PredictionStrategyHandler struct {
	strategies *mongostore.PredictionStrategyRepo
	orders     *mongostore.PredictionOrderRepo
	engine     *engine.Engine
	adminKey   string
	validate   *validator.Validate
}

// NewPredictionStrategyHandler builds the handler.
func NewPredictionStrategyHandler(
	strategies *mongostore.PredictionStrategyRepo,
	orders *mongostore.PredictionOrderRepo,
	eng *engine.Engine,
	adminKey string,
) *PredictionStrategyHandler {
	return &PredictionStrategyHandler{
		strategies: strategies,
		orders:     orders,
		engine:     eng,
		adminKey:   adminKey,
		validate:   validator.New(validator.WithRequiredStructEnabled()),
	}
}

// Register binds the prediction strategy routes onto the v1 group.
// Routes 503 cleanly when the strategy/order repos are nil.
func (h *PredictionStrategyHandler) Register(g *echo.Group) {
	if h.strategies == nil {
		return
	}
	g.GET("/prediction/strategies", h.list)
	g.POST("/prediction/strategies", h.create)
	g.GET("/prediction/strategies/:id", h.get)
	g.PUT("/prediction/strategies/:id", h.update)
	g.DELETE("/prediction/strategies/:id", h.remove)
	g.POST("/prediction/strategies/:id/live", h.toggleLive)
	g.GET("/prediction/strategies/:id/orders", h.listOrders)
	if h.adminKey != "" && h.engine != nil {
		g.POST("/prediction/strategies/:id/live/submit-order", h.submitOrder)
	}
}

func (h *PredictionStrategyHandler) list(c echo.Context) error {
	out, err := h.strategies.FindAll(c.Request().Context(), domain.DefaultUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

func (h *PredictionStrategyHandler) get(c echo.Context) error {
	s, err := h.strategies.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrPredictionStrategyNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, s)
}

func (h *PredictionStrategyHandler) create(c echo.Context) error {
	var dto domain.CreatePredictionStrategyInput
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if !dto.Outcome.IsValid() {
		return echo.NewHTTPError(http.StatusBadRequest, "outcome must be YES or NO")
	}
	if dto.Risk == nil ||
		dto.Risk.MaxNotionalUsd <= 0 ||
		dto.Risk.MaxOpenMarkets <= 0 ||
		dto.Risk.MaxSlippageBps <= 0 ||
		dto.Risk.DailyLossCapUsd <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "risk caps must all be > 0")
	}
	s := &domain.PredictionStrategy{
		UserID:   domain.DefaultUserID,
		Name:     dto.Name,
		MarketID: dto.MarketID,
		Outcome:  dto.Outcome,
		Risk:     dto.Risk,
		Live:     domain.PredictionLive{Enabled: false},
		Params:   dto.Params,
	}
	saved, err := h.strategies.Create(c.Request().Context(), s)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, saved)
}

func (h *PredictionStrategyHandler) update(c echo.Context) error {
	var patch map[string]any
	if err := c.Bind(&patch); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	delete(patch, "id")
	delete(patch, "_id")
	delete(patch, "userId")
	delete(patch, "createdAt")
	set := bson.M(patch)
	updated, err := h.strategies.Update(c.Request().Context(), c.Param("id"), set)
	if errors.Is(err, mongostore.ErrPredictionStrategyNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, updated)
}

func (h *PredictionStrategyHandler) remove(c echo.Context) error {
	err := h.strategies.Delete(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrPredictionStrategyNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, echo.Map{"success": true})
}

// toggleLiveBody is the POST /live body.
type toggleLiveBody struct {
	Enabled  bool            `json:"enabled"`
	Mode     domain.LiveMode `json:"mode,omitempty"`
	WalletID string          `json:"walletId,omitempty"`
}

func (h *PredictionStrategyHandler) toggleLive(c echo.Context) error {
	var body toggleLiveBody
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if body.Enabled {
		if body.Mode == "" {
			body.Mode = domain.LiveModeMainnet // Polymarket has no testnet
		}
		if body.Mode != domain.LiveModeMainnet {
			return echo.NewHTTPError(http.StatusBadRequest, "Polymarket has no testnet; mode must be mainnet")
		}
		if body.WalletID == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "walletId required to enable live")
		}
	}
	set := bson.M{
		"live": domain.PredictionLive{
			Enabled:  body.Enabled,
			Mode:     body.Mode,
			WalletID: body.WalletID,
		},
	}
	updated, err := h.strategies.Update(c.Request().Context(), c.Param("id"), set)
	if errors.Is(err, mongostore.ErrPredictionStrategyNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, updated)
}

func (h *PredictionStrategyHandler) submitOrder(c echo.Context) error {
	if c.Request().Header.Get("X-Admin-Key") != h.adminKey {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing or invalid X-Admin-Key")
	}
	var cmd domain.SubmitPredictionOrderCommand
	if err := c.Bind(&cmd); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	cmd.StrategyID = c.Param("id")
	id, err := h.engine.Submit(c.Request().Context(), cmd)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusAccepted, echo.Map{"streamId": id})
}

func (h *PredictionStrategyHandler) listOrders(c echo.Context) error {
	limit := 50
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	rows, err := h.orders.ListByStrategy(c.Request().Context(), c.Param("id"), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, rows)
}
