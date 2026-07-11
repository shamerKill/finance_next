// Package handlers holds Echo HTTP handlers for the public REST surface.
package handlers

import (
	"errors"
	"net/http"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// OptionHandler wires the Option CRUD endpoints to repo + crypto.
type OptionHandler struct {
	repo     *mongostore.OptionRepo
	crypto   *crypto.Service
	validate *validator.Validate
}

// NewOptionHandler constructs the handler.
func NewOptionHandler(repo *mongostore.OptionRepo, c *crypto.Service) *OptionHandler {
	return &OptionHandler{
		repo:     repo,
		crypto:   c,
		validate: validator.New(validator.WithRequiredStructEnabled()),
	}
}

// Register binds routes onto the v1 group.
func (h *OptionHandler) Register(g *echo.Group) {
	g.GET("/option", h.list)
	g.GET("/option/:id", h.findOne)
	g.POST("/option", h.create)
	g.PUT("/option/:id", h.update)
	g.DELETE("/option/:id", h.remove)
}

func (h *OptionHandler) list(c echo.Context) error {
	out, err := h.repo.FindAll(c.Request().Context(), gwmw.FromEcho(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

func (h *OptionHandler) findOne(c echo.Context) error {
	o, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrNotFound) {
		// Mongoose's findOne(...).exec() returns null on no-match; mirror that.
		return c.JSON(http.StatusOK, nil)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, o)
}

func (h *OptionHandler) create(c echo.Context) error {
	var dto domain.CreateOptionDTO
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	apiKeyEnc := ""
	if dto.UserAPIKey != "" {
		enc, err := h.crypto.Encrypt(dto.UserAPIKey)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "encrypt apiKey: "+err.Error())
		}
		apiKeyEnc = enc
	}
	secretEnc := ""
	if dto.UserSecretKey != "" {
		enc, err := h.crypto.Encrypt(dto.UserSecretKey)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "encrypt secretKey: "+err.Error())
		}
		secretEnc = enc
	}

	o := &domain.Option{
		UserID:                       gwmw.FromEcho(c),
		Name:                         dto.Name,
		PositionLevel:                dto.PositionLevel,
		OpenPositionStopTime:         dto.OpenPositionStopTime,
		ExecSymbol:                   dto.ExecSymbol,
		OrderGroupMargin:             dto.OrderGroupMargin,
		StopProfitRate:               dto.StopProfitRate,
		StopLossRate:                 dto.StopLossRate,
		ProfitRateAfterAtAddPosition: dto.ProfitRateAfterAtAddPosition,
		CreateCostOrderInProfit:      derefBool(dto.CreateCostOrderInProfit),
		CreatePositions:              dto.CreatePositions,
		UserEmail:                    dto.UserEmail,
		UserAPIKey:                   apiKeyEnc,
		UserSecretKey:                secretEnc,
		AIRunID:                      dto.AIRunID,
		Risk:                         dto.Risk,
	}

	saved, err := h.repo.Create(c.Request().Context(), o)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// Response shape extends the original NestJS contract from { name } to
	// { id, name }. Callers (e.g. e2e tests, future UI flows that need to
	// redirect after create) need the document id; the old contract forced
	// a list-then-match workaround. Adding a field is back-compat: existing
	// clients reading only `value.name` keep working.
	return c.JSON(http.StatusCreated, echo.Map{
		"message": "创建成功",
		"value":   echo.Map{"id": saved.ID, "name": saved.Name},
	})
}

func (h *OptionHandler) update(c echo.Context) error {
	id := c.Param("id")
	var dto domain.UpdateOptionDTO
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	set := bson.M{}
	if dto.Name != nil {
		set["name"] = *dto.Name
	}
	if dto.PositionLevel != nil {
		set["positionLevel"] = *dto.PositionLevel
	}
	if dto.OpenPositionStopTime != nil {
		set["openPositionStopTime"] = *dto.OpenPositionStopTime
	}
	if dto.ExecSymbol != nil {
		set["execSymbol"] = *dto.ExecSymbol
	}
	if dto.OrderGroupMargin != nil {
		set["orderGroupMargin"] = *dto.OrderGroupMargin
	}
	if dto.StopProfitRate != nil {
		set["stopProfitRate"] = *dto.StopProfitRate
	}
	if dto.StopLossRate != nil {
		set["stopLossRate"] = *dto.StopLossRate
	}
	if dto.ProfitRateAfterAtAddPosition != nil {
		set["profitRateAfterAtAddPosition"] = *dto.ProfitRateAfterAtAddPosition
	}
	if dto.CreateCostOrderInProfit != nil {
		set["createCostOrderInProfit"] = *dto.CreateCostOrderInProfit
	}
	if dto.CreatePositions != nil {
		set["createPositions"] = *dto.CreatePositions
	}
	if dto.UserEmail != nil {
		set["userEmail"] = *dto.UserEmail
	}
	if dto.UserAPIKey != nil {
		enc, err := h.crypto.Encrypt(*dto.UserAPIKey)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "encrypt apiKey: "+err.Error())
		}
		set["userApiKey"] = enc
	}
	if dto.UserSecretKey != nil {
		enc, err := h.crypto.Encrypt(*dto.UserSecretKey)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "encrypt secretKey: "+err.Error())
		}
		set["userSecretKey"] = enc
	}
	if dto.AIRunID != nil {
		set["aiRunId"] = *dto.AIRunID
	}

	o, err := h.repo.UpdateByID(c.Request().Context(), id, set)
	if errors.Is(err, mongostore.ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "option not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, o)
}

func (h *OptionHandler) remove(c echo.Context) error {
	err := h.repo.Delete(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "option not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, echo.Map{"success": true})
}

func derefBool(p *bool) bool {
	if p == nil {
		return false
	}
	return *p
}
