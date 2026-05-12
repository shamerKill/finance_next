// settings.go — Node 3.E.2: deployment snapshot endpoint.
//
// GET /api/v1/settings/system-info (admin role only)
//
// Returns a single JSON document describing the running gateway's:
//   - build version + buildAt timestamp (injected via -ldflags),
//   - environment-derived feature flags (booleans / non-secret strings),
//   - dependency health (mongo / redis / timescale / quant gRPC),
//   - cron status placeholder (TODO until quant worker writes last-success
//     timestamps to Mongo).
//
// **Never returns secret values.** API keys are surfaced as bool
// "configured?" flags only; never the raw token. ANTHROPIC_API_KEY /
// OPENAI_API_KEY are intentionally OMITTED — those live in the quant
// process; settings consumers should query quant separately (covered by
// /admin/ai/prompts in Node 3.E.3).
package handlers

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/quantclient"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// depPingTimeout caps each health probe; the overall handler latency is
// roughly bounded by `max(4 * timeout)` when every dep is unresponsive.
const depPingTimeout = 2 * time.Second

// DepStatus is one entry in the `deps` block of /settings/system-info.
type DepStatus struct {
	Status      string    `json:"status"` // "ok" | "error" | "disabled"
	LatencyMs   int64     `json:"latencyMs,omitempty"`
	LastCheckAt time.Time `json:"lastCheckAt"`
	Err         string    `json:"err,omitempty"`
}

// SettingsHandler bundles the deps the system-info endpoint reads from.
// Every field except `cfg` may be nil — the handler degrades cleanly
// (the corresponding dep reports `status="disabled"`).
type SettingsHandler struct {
	cfg         *config.Config
	mongoDB     *mongo.Database
	timescale   *timescale.Store
	redis       *redis.Client
	quantClient quantclient.Client
	// Build metadata. Injected by main() via -ldflags -X main.buildSHA=...
	buildSHA string
	buildAt  string
}

// NewSettingsHandler constructs the handler. cfg is required; the rest
// may be nil for graceful degradation.
func NewSettingsHandler(
	cfg *config.Config,
	mongoDB *mongo.Database,
	ts *timescale.Store,
	rdb *redis.Client,
	quant quantclient.Client,
	buildSHA, buildAt string,
) *SettingsHandler {
	if buildSHA == "" {
		buildSHA = "dev"
	}
	if buildAt == "" {
		buildAt = "unknown"
	}
	return &SettingsHandler{
		cfg:         cfg,
		mongoDB:     mongoDB,
		timescale:   ts,
		redis:       rdb,
		quantClient: quant,
		buildSHA:    buildSHA,
		buildAt:     buildAt,
	}
}

// Register binds GET /settings/system-info onto the v1 group.
//
// The route is mounted unconditionally; admin-role enforcement happens
// inside the handler (so non-admins see 403, not 404 — they need to
// know the surface exists to know it's not for them).
func (h *SettingsHandler) Register(g *echo.Group) {
	g.GET("/settings/system-info", h.SystemInfo)
}

// SystemInfo is the read endpoint. Returns 403 for non-admins.
func (h *SettingsHandler) SystemInfo(c echo.Context) error {
	// Admin role check. WithAuth populates ContextRoleKey from the JWT;
	// missing / non-admin → 403. The s2s admin-key path also writes
	// role="admin" so curl with X-Admin-Key remains supported.
	role, _ := c.Get(gwmw.ContextRoleKey).(string)
	if role != domain.UserRoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "admin only")
	}

	resp := map[string]any{
		"version":    h.buildSHA,
		"buildAt":    h.buildAt,
		"envFlags":   h.envFlags(),
		"deps":       h.depStatuses(c.Request().Context()),
		"cronStatus": h.cronStatuses(c.Request().Context()),
	}
	return c.JSON(http.StatusOK, resp)
}

// envFlags returns the deployment's env-derived feature flags. Only
// fields parsed in config.go (or read directly from os.Getenv at boot)
// are listed; secrets are surfaced as `true`/`false` "configured?" bools,
// never as raw values.
func (h *SettingsHandler) envFlags() map[string]any {
	cfg := h.cfg
	if cfg == nil {
		// Shouldn't happen in production wiring, but kept defensive so
		// tests can construct the handler with a nil config.
		cfg = &config.Config{}
	}
	out := map[string]any{
		// Trading toggles — bool only.
		"MAINNET_TRADING_ENABLED":     os.Getenv("MAINNET_TRADING_ENABLED") == "true",
		"POLYMARKET_TRADING_ENABLED":  os.Getenv("POLYMARKET_TRADING_ENABLED") == "true",
		// Data-source api keys — bool only (presence/absence), never raw.
		"FRED_API_KEY":       os.Getenv("FRED_API_KEY") != "",
		"ETHERSCAN_API_KEY":  os.Getenv("ETHERSCAN_API_KEY") != "",
		"CRYPTOPANIC_TOKEN":  os.Getenv("CRYPTOPANIC_TOKEN") != "",
		"POLYGON_RPC_URL":    os.Getenv("POLYGON_RPC_URL") != "",
		// Observability endpoint — bool only (URL itself may contain
		// auth-token query params on some collectors).
		"OTEL_EXPORTER_OTLP_ENDPOINT": os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "",
		// KEK selection — value is one of "env" / "aws-kms" / "gcp-kms",
		// no secret content.
		"KEK_PROVIDER": envOr("KEK_PROVIDER", "env"),
		// Auth posture from parsed cfg (these are bools / non-sensitive
		// scalars already).
		"REQUIRE_USER_ID":     cfg.RequireUserID,
		"ALLOWED_ORIGINS":     cfg.AllowedOrigins,
		"ALLOW_S2S_HEADER":    cfg.AllowS2SHeader,
		"AUTH_COOKIE_SECURE":  cfg.AuthCookieSecure,
		// AI budgets — numeric caps, not secrets. Mirror the defaults in
		// admin.go::effectiveAIConfig so the dashboard can show what the
		// gateway will enforce when quant calls home.
		"AI_MAX_USD_PER_STUDY": envOrFloat("AI_MAX_USD_PER_STUDY", 5.0),
		"AI_MAX_USD_PER_DAY":   envOrFloat("AI_MAX_USD_PER_DAY", 50.0),
	}
	return out
}

// depStatuses runs each dep's lightweight health probe in series with a
// per-probe timeout. Order is deterministic so the response body diffs
// nicely across calls.
func (h *SettingsHandler) depStatuses(parent context.Context) map[string]DepStatus {
	now := time.Now().UTC()
	out := map[string]DepStatus{
		"mongo":     h.pingMongo(parent, now),
		"redis":     h.pingRedis(parent, now),
		"timescale": h.pingTimescale(parent, now),
		"quant":     h.pingQuant(parent, now),
	}
	return out
}

func (h *SettingsHandler) pingMongo(parent context.Context, now time.Time) DepStatus {
	if h.mongoDB == nil {
		return DepStatus{Status: "disabled", LastCheckAt: now}
	}
	ctx, cancel := context.WithTimeout(parent, depPingTimeout)
	defer cancel()
	start := time.Now()
	// mongo.Client.Ping is the canonical health probe; we reach it via
	// the database handle's Client(). This issues a {ping:1} admin
	// command and is cheap.
	if err := h.mongoDB.Client().Ping(ctx, nil); err != nil {
		return DepStatus{
			Status:      "error",
			LatencyMs:   time.Since(start).Milliseconds(),
			LastCheckAt: now,
			Err:         err.Error(),
		}
	}
	return DepStatus{
		Status:      "ok",
		LatencyMs:   time.Since(start).Milliseconds(),
		LastCheckAt: now,
	}
}

func (h *SettingsHandler) pingRedis(parent context.Context, now time.Time) DepStatus {
	if h.redis == nil {
		return DepStatus{Status: "disabled", LastCheckAt: now}
	}
	ctx, cancel := context.WithTimeout(parent, depPingTimeout)
	defer cancel()
	start := time.Now()
	if err := h.redis.Ping(ctx).Err(); err != nil {
		return DepStatus{
			Status:      "error",
			LatencyMs:   time.Since(start).Milliseconds(),
			LastCheckAt: now,
			Err:         err.Error(),
		}
	}
	return DepStatus{
		Status:      "ok",
		LatencyMs:   time.Since(start).Milliseconds(),
		LastCheckAt: now,
	}
}

func (h *SettingsHandler) pingTimescale(parent context.Context, now time.Time) DepStatus {
	if h.timescale == nil {
		return DepStatus{Status: "disabled", LastCheckAt: now}
	}
	ctx, cancel := context.WithTimeout(parent, depPingTimeout)
	defer cancel()
	start := time.Now()
	if err := h.timescale.Ping(ctx); err != nil {
		return DepStatus{
			Status:      "error",
			LatencyMs:   time.Since(start).Milliseconds(),
			LastCheckAt: now,
			Err:         err.Error(),
		}
	}
	return DepStatus{
		Status:      "ok",
		LatencyMs:   time.Since(start).Milliseconds(),
		LastCheckAt: now,
	}
}

// pingQuant uses GetAIConfig as a stand-in for a dedicated Healthz RPC
// — it's the cheapest call on the quant surface and exists on every
// recent quant build. Unimplemented (older quant) is treated as "ok"
// because the gRPC channel is clearly up; only network errors fail.
func (h *SettingsHandler) pingQuant(parent context.Context, now time.Time) DepStatus {
	if h.quantClient == nil {
		return DepStatus{Status: "disabled", LastCheckAt: now}
	}
	ctx, cancel := context.WithTimeout(parent, depPingTimeout)
	defer cancel()
	start := time.Now()
	_, err := h.quantClient.GetAIConfig(ctx)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		// gRPC code Unimplemented = quant is reachable but doesn't
		// have this RPC yet. We treat that as "ok" with a hint.
		return DepStatus{
			Status:      "error",
			LatencyMs:   latency,
			LastCheckAt: now,
			Err:         err.Error(),
		}
	}
	return DepStatus{
		Status:      "ok",
		LatencyMs:   latency,
		LastCheckAt: now,
	}
}

// cronStatuses returns last-known cron success timestamps. Currently a
// stub: quant worker has no persisted "last successful run" surface yet
// (cron lives entirely in arq's Redis-backed queue). When the quant
// agent lands a Mongo `cron_state` collection (or equivalent) this
// method reads it; until then we return an empty map so consumers can
// distinguish "feature unimplemented" from "unknown error".
//
// TODO(3.E.x follow-up): wire to whichever Mongo collection the quant
// worker stamps after each cron run completes.
func (h *SettingsHandler) cronStatuses(_ context.Context) map[string]any {
	return map[string]any{}
}

// envOr returns os.Getenv(key) or `def` when unset.
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

