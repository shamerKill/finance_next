// Package http builds the Echo router and mounts handlers.
package http

import (
	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/http/handlers"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// NewRouter wires up middleware, the /api/v1 group, and resource handlers.
//
// The path prefix `/api/v1/option` is identical to the legacy NestJS app,
// so the Next.js client doesn't need a routing change beyond baseUrl.
func NewRouter(repo *mongostore.OptionRepo, c *crypto.Service) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(middleware.Logger())

	api := e.Group("/api")
	v1 := api.Group("/v1")

	handlers.NewOptionHandler(repo, c).Register(v1)

	// Lightweight health probe (not part of the original Nest API; harmless to add).
	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	return e
}
