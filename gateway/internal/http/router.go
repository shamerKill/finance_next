// Package http builds the Echo router and mounts handlers.
package http

import (
	"net/http"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/http/handlers"
	auditmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/observability"
	"github.com/finance_next/gateway/internal/orderengine"
	predictionengine "github.com/finance_next/gateway/internal/prediction/engine"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	walletpkg "github.com/finance_next/gateway/internal/wallet/polygon"
	"github.com/finance_next/gateway/internal/ws"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
)

// Deps bundles the wiring the router needs. Grouping keeps the constructor
// signature stable as we add handlers in later phases.
type Deps struct {
	OptionRepo          *mongostore.OptionRepo
	AccountRepo         *mongostore.AccountRepo
	BacktestRepo        *mongostore.BacktestRepo
	OrderRepo           *mongostore.OrderRepo
	ExchangeMetaRepo    *mongostore.ExchangeMetaRepo
	RecommendationRepo  *mongostore.RecommendationRepo
	OptimizationRunRepo *mongostore.OptimizationRunRepo
	SystemRepo          *mongostore.SystemRepo
	AuditRepo           *mongostore.AuditRepo
	UserRepo            *mongostore.UserRepo
	InvitationRepo      *mongostore.InvitationRepo
	Crypto              *crypto.Service
	Envelope            *crypto.EnvelopeService

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

	// Phase 4: order engine for /strategies/:id/* endpoints. Optional —
	// when nil, the new endpoints return 503 / 404. The cmd wires it
	// alongside the workers + reconcile loop.
	OrderEngine *orderengine.Engine

	// Phase 7: audit middleware + observability registry. Both optional;
	// when nil the corresponding feature is silently disabled.
	AuditMiddleware *auditmw.Middleware
	Metrics         *observability.Registry

	// R2 multi-tenant boundary: when true, /api/v1/* rejects requests
	// missing an `X-User-Id` header with 400. False (default) preserves
	// single-tenant dev behaviour by falling back to "default".
	RequireUserID bool

	// Phase 9: Polymarket / Polygon wallet vertical. Each dep nil → the
	// corresponding routes are skipped (404). The wallet RPC defaults to
	// NoopRPC (errors at call time) when not wired.
	WalletRepo            *mongostore.WalletRepo
	PredictionStrategyRepo *mongostore.PredictionStrategyRepo
	PredictionOrderRepo   *mongostore.PredictionOrderRepo
	WalletRPC             walletpkg.RPC
	PredictionEngine      *predictionengine.Engine

	// Wave 1B: dashboard summary + strategy performance endpoints. Both
	// are read-only fan-outs over the existing repos and tolerate any
	// dep being nil (per-section degradation, never 5xx-ing the whole
	// call). Config is forwarded so the AI-budget block can surface the
	// provider/budget knobs.
	Config *config.Config

	// CORS + WebSocket origin allowlist. Empty (default) preserves the
	// dev-friendly behaviour: CORS allows "*" and the WS upgrade uses
	// InsecureSkipVerify. Non-empty switches both surfaces to strict
	// allowlisting. Entries are full origin URLs (e.g.
	// "http://localhost:3000"); the WS handler extracts the host part.
	AllowedOrigins []string
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
	// CORS: dev defaults to "*", production locks down via ALLOWED_ORIGINS.
	//
	// "X-Admin-Key" is included so the dashboard layout banner, admin pages,
	// wallet approve, and strategy live-submit calls can reach the gateway
	// from the browser — without it the preflight strips the header and
	// every admin call surfaces as a 401/403 to the user. "X-User-Id" is
	// allowed for the R2 multi-tenant boundary middleware.
	corsOrigins := d.AllowedOrigins
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"*"}
	}
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: corsOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Content-Type", "Authorization", "X-Admin-Key", "X-User-Id"},
	}))

	// Phase 7 observability: register every metric the Grafana dashboards
	// reference so /metrics produces a stable, scrape-friendly surface
	// (zero-valued series are still emitted; PromQL's increase()/rate()
	// degrade gracefully on absent series but referencing dashboards
	// users find empty panels confusing). HTTP latency histogram is
	// mounted before any resource handler so it covers every route.
	if d.Metrics != nil {
		hist := d.Metrics.Histogram(observability.HistogramOpts{
			Name: "gateway_http_request_duration_seconds",
			Help: "HTTP request duration distribution.",
		})
		// Mongo op latency — populated when store/mongo wraps queries
		// with this histogram. Pre-registered so the metric exists at
		// /metrics scrape time even before any traffic.
		_ = d.Metrics.Histogram(observability.HistogramOpts{
			Name:    "gateway_mongo_op_duration_seconds",
			Help:    "MongoDB operation duration distribution.",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		})
		// Order engine queue depth — sampled by a cheap polling goroutine
		// (ordereng.QueueDepth() not yet implemented; gauge stays at 0
		// until populated by Phase 8 wiring).
		_ = d.Metrics.Gauge(observability.GaugeOpts{
			Name: "gateway_order_engine_queue_depth",
			Help: "Order engine pending command queue depth.",
		})
		// Audit drop counter — periodically synced from the audit
		// middleware's atomic counter via a small ticker so the metric
		// reflects the live drop rate.
		auditDropped := d.Metrics.Counter(observability.CounterOpts{
			Name: "gateway_audit_dropped_total",
			Help: "Audit entries dropped due to buffer overflow.",
		})
		// Exchange API error counter — registered per-venue. Adapters
		// increment on error response. Pre-registering all three
		// keeps PromQL `sum by(exchange)` non-empty even at idle.
		for _, ex := range []string{"binance", "okx", "bybit"} {
			_ = d.Metrics.Counter(observability.CounterOpts{
				Name:   "gateway_exchange_api_errors_total",
				Help:   "Exchange REST/WS API errors by venue.",
				Labels: map[string]string{"exchange": ex},
			})
		}
		// Sync the audit drop counter from middleware periodically. We
		// can't reuse the Counter directly because the middleware uses
		// its own atomic — instead we re-emit the delta on each tick.
		if d.AuditMiddleware != nil {
			go func() {
				var last uint64
				t := time.NewTicker(5 * time.Second)
				defer t.Stop()
				for range t.C {
					cur := d.AuditMiddleware.DropCount()
					if cur > last {
						auditDropped.Add(cur - last)
						last = cur
					}
				}
			}()
		}
		e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
			return func(c echo.Context) error {
				start := time.Now()
				err := next(c)
				hist.Observe(time.Since(start).Seconds())
				return err
			}
		})
	}

	api := e.Group("/api")
	v1 := api.Group("/v1")

	// Phase 1.A.1 cookie / JWT auth. Mounted FIRST so a valid cookie can
	// populate the userId / userRole context values before WithUserID
	// runs. The Parser closure binds the JWT secret from cfg so this
	// middleware doesn't import the handlers package (which would
	// create an import cycle).
	if d.Config != nil && d.Config.AuthJWTSecret != "" {
		secret := d.Config.AuthJWTSecret
		v1.Use(auditmw.WithAuth(auditmw.AuthConfig{
			Secret: secret,
			Redis:  d.Redis,
			Parser: func(token string) (*auditmw.AuthClaims, error) {
				cl, err := handlers.ParseJWT(token, secret)
				if err != nil {
					return nil, err
				}
				out := &auditmw.AuthClaims{
					UserID:   cl.UserID,
					Role:     cl.Role,
					JTI:      cl.ID,
					IssuedAt: cl.IssuedAt.Unix(),
					ExpireAt: cl.ExpiresAt.Unix(),
				}
				return out, nil
			},
		}))
	}

	// R2 multi-tenant userId middleware. MUST be mounted BEFORE the audit
	// middleware so audit entries can pick up the resolved userId from
	// the Echo context. WithAuth above already sets the userId from the
	// JWT when the cookie is valid; WithUserID's header fallback then
	// only kicks in for s2s callers and is otherwise a no-op (the
	// existing context value is left untouched when present).
	v1.Use(auditmw.WithUserID(d.RequireUserID))

	// Phase 7 audit middleware. Mounted on the v1 group so every API
	// mutation is captured; /healthz and /metrics are not under v1 and
	// therefore intentionally not audited.
	if d.AuditMiddleware != nil {
		v1.Use(d.AuditMiddleware.Middleware())
	}

	// Phase 1.A.1 auth handlers. Mounted on the v1 group; the white-list
	// inside WithAuth keeps /auth/register|login|accept-invite|logout
	// reachable without a cookie. Other /auth/* routes (me, invite) are
	// behind WithAuth as usual.
	handlers.NewAuthHandler(d.UserRepo, d.InvitationRepo, d.Config, d.Redis).Register(v1)

	handlers.NewOptionHandler(d.OptionRepo, d.Crypto).Register(v1)
	accountHandler := handlers.NewAccountHandler(d.AccountRepo, d.Envelope, nil)
	accountHandler.Register(v1)

	// Market endpoints (Phase 2). Mount unconditionally; the handler itself
	// returns 503 when its dependencies aren't configured.
	handlers.NewMarketHandler(d.Timescale, d.Quant, d.AdminKey).Register(v1)

	// Backtest endpoints (Phase 3). Each dep nil → handler returns 503.
	handlers.NewBacktestHandler(d.BacktestRepo, d.Timescale, d.Quant).Register(v1)

	// Strategy endpoints (Phase 4). Mounts /strategies/:id/orders +
	// /strategies/:id/live + /admin/mainnet/* (admin-gated).
	handlers.NewStrategyHandler(d.OptionRepo, d.OrderRepo, d.OrderEngine, d.AdminKey).Register(v1)

	// Phase 5: exchange_meta read endpoint + cross-exchange portfolio
	// summary. Both gracefully 503 when their repos are nil.
	handlers.NewExchangeMetaHandler(d.ExchangeMetaRepo).Register(v1)
	var priceProvider handlers.PriceProvider
	if d.Timescale != nil {
		priceProvider = handlers.NewTimescalePriceProvider(d.Timescale)
	}
	portfolioHandler := handlers.NewPortfolioHandler(d.AccountRepo, d.Envelope, nil, priceProvider)
	portfolioHandler.Register(v1)

	// Wave 1B: dashboard summary + /strategies/:id/performance. The
	// dashboard's totalUsd card reuses PortfolioHandler so we don't
	// fork the per-account balance + USD-conversion logic. Every dep
	// may be nil — the handler degrades that section instead of 5xx-ing
	// the whole response. We thread the concrete repo pointers through
	// nil-aware adapter constructors so a nil concrete pointer surfaces
	// as a nil interface (otherwise Go's typed-nil trap would smuggle
	// a non-nil interface holding a nil pointer into the handler).
	handlers.NewDashboardHandler(
		handlers.SystemForDashboard(d.SystemRepo),
		handlers.OptionForDashboard(d.OptionRepo),
		handlers.AccountForDashboard(d.AccountRepo),
		handlers.WalletForDashboard(d.WalletRepo),
		handlers.OrderForDashboard(d.OrderRepo),
		handlers.RecForDashboard(d.RecommendationRepo),
		handlers.OptRunForDashboard(d.OptimizationRunRepo),
		d.Timescale,
		handlers.PortfolioTotallerForDashboard(portfolioHandler),
		d.Config,
	).Register(v1)

	// Phase 6 — AI optimization: recommendations + tune-now endpoints.
	// Each repo nil → corresponding handler returns 503.
	handlers.NewRecommendationHandler(d.RecommendationRepo, d.OptionRepo, d.Redis).Register(v1)
	handlers.NewOptimizationHandler(d.OptimizationRunRepo, d.Quant).Register(v1)

	// Phase 7 admin endpoints: kill switch + portfolio limits + audit
	// viewer + /admin/ai/{config,prompts}. Hidden when AdminKey is
	// unset (404). The quant client is forwarded so /admin/ai/prompts
	// can call GetAIConfig; nil = 503 with a clear message.
	handlers.NewAdminHandler(d.SystemRepo, d.AuditRepo, d.Quant, d.AdminKey).Register(v1)

	// Phase 8 data-explorer reads (equities/futures OHLCV, macro,
	// onchain, news) + admin-gated XADD ingest triggers. Each path
	// degrades to 503 when the Timescale store is nil; admin paths
	// are hidden when AdminKey is unset (mirrors /market/ingest).
	handlers.NewDataExplorerHandler(d.Timescale, d.Redis, d.AdminKey).Register(v1)

	// Phase 9: Polymarket / Polygon wallet vertical.
	//   * /wallets/* — Polygon wallet CRUD + balance + bounded approve
	//   * /prediction/markets|quotes|trades — Timescale read endpoints
	//   * /prediction/strategies/* — strategy CRUD + live toggle + admin
	//     submit-order
	// Each handler internally checks for missing deps and 503s cleanly.
	handlers.NewWalletHandler(d.WalletRepo, d.Envelope, d.WalletRPC, d.SystemRepo, d.AdminKey).Register(v1)
	handlers.NewPredictionHandler(d.Timescale, d.Redis, d.AdminKey).Register(v1)
	handlers.NewPredictionStrategyHandler(d.PredictionStrategyRepo, d.PredictionOrderRepo, d.PredictionEngine, d.AdminKey).Register(v1)

	// WS hub: account upstreams (phase 1) + Redis-backed backtest progress
	// fan-out (phase 3) + Redis-backed strategy order events (phase 4) +
	// optimization study progress (phase 6).
	// The generic factory is nil when no Redis client is configured; all
	// subscriptions then fail with a clear error.
	var genericFactory ws.GenericUpstreamFactory
	if d.Redis != nil {
		genericFactory = ws.ComposeUpstreamFactories(map[ws.TopicKind]ws.GenericUpstreamFactory{
			ws.TopicBacktest:           ws.NewRedisBacktestUpstreamFactory(d.Redis, nil),
			ws.TopicStrategy:           ws.NewRedisStrategyUpstreamFactory(d.Redis, nil),
			ws.TopicOptimization:       ws.NewRedisOptimizationUpstreamFactory(d.Redis, nil),
			ws.TopicPredictionStrategy: ws.NewRedisPredictionUpstreamFactory(d.Redis, nil),
		})
	}
	// Forward orderengine package import to keep build happy when nil.
	_ = orderengine.CommandSubmitStream
	hub := ws.NewHubFull(accountHandler.UpstreamFactoryFor(), genericFactory, nil)
	wsHandler := ws.NewHandler(hub, nil, d.AllowedOrigins)
	e.GET("/ws", wsHandler.Handle)

	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	// Phase 7 /metrics endpoint. Bound to localhost in production via
	// the reverse proxy / Ingress; here we keep it open so docker-compose
	// scrape jobs work. Operators are expected to firewall it. The body
	// uses Prometheus text exposition format 0.0.4.
	if d.Metrics != nil {
		e.GET("/metrics", func(c echo.Context) error {
			c.Response().Header().Set(echo.HeaderContentType, "text/plain; version=0.0.4; charset=utf-8")
			c.Response().WriteHeader(http.StatusOK)
			return d.Metrics.WriteText(c.Response().Writer)
		})
	}

	return e
}
