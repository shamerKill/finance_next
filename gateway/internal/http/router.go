// Package http builds the Echo router and mounts handlers.
package http

import (
	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/http/handlers"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/ws"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// Deps bundles the wiring the router needs. Grouping keeps the constructor
// signature stable as we add handlers in later phases.
type Deps struct {
	OptionRepo  *mongostore.OptionRepo
	AccountRepo *mongostore.AccountRepo
	Crypto      *crypto.Service
	Envelope    *crypto.EnvelopeService
}

// NewRouter wires up middleware, the /api/v1 group, /ws, and resource handlers.
//
// The /api/v1/option path is preserved from phase 0 so the Next.js client
// doesn't need a routing change.
func NewRouter(d Deps) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(middleware.Logger())
	// Permissive CORS for dev; phase 7 will narrow this to the configured
	// frontend origin and add credentials handling.
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Content-Type", "Authorization"},
	}))

	api := e.Group("/api")
	v1 := api.Group("/v1")

	handlers.NewOptionHandler(d.OptionRepo, d.Crypto).Register(v1)
	accountHandler := handlers.NewAccountHandler(d.AccountRepo, d.Envelope, nil)
	accountHandler.Register(v1)

	hub := ws.NewHub(accountHandler.UpstreamFactoryFor(), nil)
	wsHandler := ws.NewHandler(hub, nil)
	e.GET("/ws", wsHandler.Handle)

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	return e
}
