// Package http builds the Echo router and mounts handlers.
package http

import (
	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/http/handlers"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/finance_next/gateway/internal/ws"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
)

// Deps bundles the wiring the router needs. Grouping keeps the constructor
// signature stable as we add handlers in later phases.
type Deps struct {
	OptionRepo   *mongostore.OptionRepo
	AccountRepo  *mongostore.AccountRepo
	BacktestRepo *mongostore.BacktestRepo
	Crypto       *crypto.Service
	Envelope     *crypto.EnvelopeService

	// Phase 2 additions: timescale read access + quant grpc client.
	// Both are optional in dev — when nil, the market endpoints
	// respond with 503 (or 404 for the admin-gated ingest path).
	Timescale *timescale.Store
	Quant     quantclient.Client
	AdminKey  string

	// Phase 3: Redis client for the WS hub's backtest progress fan-out.
	// Optional — when nil, browsers can still POST a backtest and poll
	// status; only live progress streaming is unavailable.
	Redis *redis.Client
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

	// Market endpoints (Phase 2). Mount unconditionally; the handler itself
	// returns 503 when its dependencies aren't configured.
	handlers.NewMarketHandler(d.Timescale, d.Quant, d.AdminKey).Register(v1)

	// Backtest endpoints (Phase 3). Each dep nil → handler returns 503.
	handlers.NewBacktestHandler(d.BacktestRepo, d.Timescale, d.Quant).Register(v1)

	// WS hub: account upstreams (phase 1) + Redis-backed backtest progress
	// fan-out (phase 3). The generic factory is nil when no Redis client
	// is configured; backtest subscriptions then fail with a clear error.
	var genericFactory ws.GenericUpstreamFactory
	if d.Redis != nil {
		genericFactory = ws.NewRedisBacktestUpstreamFactory(d.Redis, nil)
	}
	hub := ws.NewHubFull(accountHandler.UpstreamFactoryFor(), genericFactory, nil)
	wsHandler := ws.NewHandler(hub, nil)
	e.GET("/ws", wsHandler.Handle)

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	return e
}
