package handlers

import (
	"errors"
	"net/http"

	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
)

// ExchangeMetaHandler serves the read-only `exchange_meta` collection.
// The startup refresh job populates the rows; this endpoint is the
// browser-facing read path.
type ExchangeMetaHandler struct {
	repo *mongostore.ExchangeMetaRepo
}

// NewExchangeMetaHandler builds the handler. When repo is nil the
// endpoints return 503; this lets the gateway boot without Mongo for
// non-meta tests.
func NewExchangeMetaHandler(repo *mongostore.ExchangeMetaRepo) *ExchangeMetaHandler {
	return &ExchangeMetaHandler{repo: repo}
}

// Register binds /exchange/meta on the v1 group.
func (h *ExchangeMetaHandler) Register(g *echo.Group) {
	g.GET("/exchange/meta", h.list)
}

// list handles GET /api/v1/exchange/meta?exchange=&symbol=
//
//   - When `symbol` is set, returns the single matching row (404 if
//     missing). `exchange` MUST also be set in this branch.
//   - When `symbol` is empty, returns all rows; if `exchange` is set,
//     filters to that venue.
func (h *ExchangeMetaHandler) list(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "exchange_meta repo not configured")
	}
	exch := domain.Exchange(c.QueryParam("exchange"))
	sym := c.QueryParam("symbol")
	if sym != "" {
		if exch == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "exchange query param required when symbol is set")
		}
		row, err := h.repo.Find(c.Request().Context(), exch, sym)
		if errors.Is(err, mongostore.ErrExchangeMetaNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "no metadata for given (exchange, symbol)")
		}
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		return c.JSON(http.StatusOK, row)
	}
	rows, err := h.repo.FindAll(c.Request().Context(), exch)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, rows)
}
