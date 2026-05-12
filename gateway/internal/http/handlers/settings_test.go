package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/labstack/echo/v4"
)

// echoForSettings spins up an Echo router that pre-populates the auth
// context with userId/role like the production WithAuth middleware would.
// Each test passes the role it wants to assert against; "" leaves the
// context untouched so handlers see no role at all.
func echoForSettings(t *testing.T, role string, h *SettingsHandler) *echo.Echo {
	t.Helper()
	e := echo.New()
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if role != "" {
				c.Set(gwmw.ContextRoleKey, role)
			}
			return next(c)
		}
	})
	g := e.Group("/api/v1")
	h.Register(g)
	return e
}

func TestSettings_403WhenNonAdmin(t *testing.T) {
	h := NewSettingsHandler(&config.Config{}, nil, nil, nil, nil, "abc123", "2026-05-12T00:00:00Z")
	e := echoForSettings(t, domain.UserRoleMember, h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/system-info", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "admin only") {
		t.Errorf("expected 'admin only' in body, got %s", rec.Body.String())
	}
}

func TestSettings_403WhenNoRole(t *testing.T) {
	h := NewSettingsHandler(&config.Config{}, nil, nil, nil, nil, "abc123", "2026-05-12T00:00:00Z")
	// role="" => middleware skips setting the key so handler sees nil.
	e := echoForSettings(t, "", h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/system-info", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when no role, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

// TestSettings_OkWithNilDeps verifies the graceful-degradation contract:
// every dep nil -> 200 with status="disabled" on each entry. This is the
// shape an operator sees on a half-wired dev box and the UI must render
// without 5xx-ing.
func TestSettings_OkWithNilDeps(t *testing.T) {
	cfg := &config.Config{
		RequireUserID:    true,
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowS2SHeader:   false,
		AuthCookieSecure: true,
	}
	h := NewSettingsHandler(cfg, nil, nil, nil, nil, "abc123", "2026-05-12T00:00:00Z")
	e := echoForSettings(t, domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/system-info", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}

	var body struct {
		Version    string                  `json:"version"`
		BuildAt    string                  `json:"buildAt"`
		EnvFlags   map[string]any          `json:"envFlags"`
		Deps       map[string]DepStatus    `json:"deps"`
		CronStatus map[string]any          `json:"cronStatus"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v (body=%s)", err, rec.Body.String())
	}

	if body.Version != "abc123" {
		t.Errorf("version: got %q, want abc123", body.Version)
	}
	if body.BuildAt != "2026-05-12T00:00:00Z" {
		t.Errorf("buildAt: got %q", body.BuildAt)
	}

	for _, name := range []string{"mongo", "redis", "timescale", "quant"} {
		ds, ok := body.Deps[name]
		if !ok {
			t.Errorf("deps[%s] missing", name)
			continue
		}
		if ds.Status != "disabled" {
			t.Errorf("deps[%s].status = %q, want 'disabled'", name, ds.Status)
		}
	}

	// envFlags sanity: bool keys present, no raw secret strings.
	for _, key := range []string{
		"MAINNET_TRADING_ENABLED", "POLYMARKET_TRADING_ENABLED",
		"FRED_API_KEY", "ETHERSCAN_API_KEY", "CRYPTOPANIC_TOKEN",
		"POLYGON_RPC_URL", "OTEL_EXPORTER_OTLP_ENDPOINT",
		"REQUIRE_USER_ID", "ALLOW_S2S_HEADER", "AUTH_COOKIE_SECURE",
		"KEK_PROVIDER", "ALLOWED_ORIGINS",
		"AI_MAX_USD_PER_STUDY", "AI_MAX_USD_PER_DAY",
	} {
		if _, ok := body.EnvFlags[key]; !ok {
			t.Errorf("envFlags[%s] missing", key)
		}
	}

	// Spot-check the cfg-derived bools made the round trip.
	if body.EnvFlags["REQUIRE_USER_ID"] != true {
		t.Errorf("REQUIRE_USER_ID: got %v, want true", body.EnvFlags["REQUIRE_USER_ID"])
	}
	if body.EnvFlags["AUTH_COOKIE_SECURE"] != true {
		t.Errorf("AUTH_COOKIE_SECURE: got %v, want true", body.EnvFlags["AUTH_COOKIE_SECURE"])
	}
	// KEK_PROVIDER unset => "env" default.
	if body.EnvFlags["KEK_PROVIDER"] != "env" {
		t.Errorf("KEK_PROVIDER: got %v, want 'env'", body.EnvFlags["KEK_PROVIDER"])
	}
}

// TestSettings_EnvFlagsSecretsAreBoolNotString locks the no-secret-leak
// contract: even when an env var is present, the response surfaces only
// the boolean "configured?" — never the raw value.
func TestSettings_EnvFlagsSecretsAreBoolNotString(t *testing.T) {
	t.Setenv("FRED_API_KEY", "sk-FRED-supersecret-12345")
	t.Setenv("ETHERSCAN_API_KEY", "")
	t.Setenv("CRYPTOPANIC_TOKEN", "tok-XYZ")
	t.Setenv("POLYGON_RPC_URL", "https://polygon-mainnet.example.com/v2/REDACTED")
	t.Setenv("MAINNET_TRADING_ENABLED", "true")
	t.Setenv("POLYMARKET_TRADING_ENABLED", "")

	h := NewSettingsHandler(&config.Config{}, nil, nil, nil, nil, "v1", "now")
	flags := h.envFlags()

	// FRED has a value -> true; never the raw key.
	if v, ok := flags["FRED_API_KEY"].(bool); !ok || !v {
		t.Errorf("FRED_API_KEY: got %v, want bool(true)", flags["FRED_API_KEY"])
	}
	if v, ok := flags["ETHERSCAN_API_KEY"].(bool); !ok || v {
		t.Errorf("ETHERSCAN_API_KEY: got %v, want bool(false)", flags["ETHERSCAN_API_KEY"])
	}
	if v, ok := flags["CRYPTOPANIC_TOKEN"].(bool); !ok || !v {
		t.Errorf("CRYPTOPANIC_TOKEN: got %v, want bool(true)", flags["CRYPTOPANIC_TOKEN"])
	}
	// POLYGON_RPC_URL is bool-only (raw URL may carry creds in query
	// params on real-world configs).
	if v, ok := flags["POLYGON_RPC_URL"].(bool); !ok || !v {
		t.Errorf("POLYGON_RPC_URL: got %v, want bool(true)", flags["POLYGON_RPC_URL"])
	}
	if v, ok := flags["MAINNET_TRADING_ENABLED"].(bool); !ok || !v {
		t.Errorf("MAINNET_TRADING_ENABLED: got %v, want bool(true)", flags["MAINNET_TRADING_ENABLED"])
	}
	if v, ok := flags["POLYMARKET_TRADING_ENABLED"].(bool); !ok || v {
		t.Errorf("POLYMARKET_TRADING_ENABLED: got %v, want bool(false)", flags["POLYMARKET_TRADING_ENABLED"])
	}

	// Final paranoia: serialise the whole flags blob and make sure none
	// of the raw secret values made it through under any key.
	raw, err := json.Marshal(flags)
	if err != nil {
		t.Fatalf("marshal flags: %v", err)
	}
	for _, secret := range []string{
		"sk-FRED-supersecret-12345",
		"tok-XYZ",
		"REDACTED",
	} {
		if strings.Contains(string(raw), secret) {
			t.Errorf("raw secret value %q leaked into envFlags JSON: %s", secret, string(raw))
		}
	}
}

// TestSettings_BuildSHADefault verifies the "" -> "dev" / "unknown"
// fallback so dev `go build` (no ldflags) still produces a renderable
// response.
func TestSettings_BuildSHADefault(t *testing.T) {
	h := NewSettingsHandler(&config.Config{}, nil, nil, nil, nil, "", "")
	if h.buildSHA != "dev" {
		t.Errorf("buildSHA default: got %q, want 'dev'", h.buildSHA)
	}
	if h.buildAt != "unknown" {
		t.Errorf("buildAt default: got %q, want 'unknown'", h.buildAt)
	}
}

// TestSettings_AdminKeyPathReturns200 simulates the s2s admin-key
// auth path that WithAuth sets up: when admin-key matches, the
// middleware writes role="admin" into the context. The settings
// handler should accept that just like a cookie-derived admin.
func TestSettings_AdminKeyPathReturns200(t *testing.T) {
	h := NewSettingsHandler(&config.Config{}, nil, nil, nil, nil, "v1", "now")
	e := echoForSettings(t, domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/system-info", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin role should pass, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}
