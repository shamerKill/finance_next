// Package config loads runtime configuration from environment variables.
//
// In local development a .env file is auto-loaded (in this priority):
//  1. ./gateway/.env  (when run from repo root)
//  2. ./.env          (when run from inside gateway/)
//
// In production (CI / container), no .env is loaded; env vars must be set
// directly. Missing required vars cause Load to fail.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds the resolved runtime configuration.
type Config struct {
	MongoURI      string
	EncryptionKey string
	Port          string

	// Phase 2 additions. All optional — when unset the corresponding
	// gateway features are disabled rather than the process failing.
	TimescaleDSN  string // empty: market read endpoints return 503
	QuantGRPCAddr string // empty: admin ingest returns 503
	AdminKey      string // empty: admin ingest returns 404 (hidden)
	RedisURL      string // reserved for Phase 4 order-engine + Phase 6 events

	// RequireUserID controls the multi-tenant userId middleware.
	// True (env `REQUIRE_USER_ID=true`) → requests under /api/v1
	// without an `X-User-Id` header are rejected 400. False (default /
	// any other value) → missing header falls back to
	// domain.DefaultUserID, preserving single-tenant dev behaviour.
	//
	// Auth model: the gateway itself does NOT verify the header; an
	// upstream auth proxy is expected to validate the user and forward
	// the verified subject as `X-User-Id`. Until that proxy is in place
	// the header is trust-the-frontend.
	RequireUserID bool

	// Phase 1.A.1 auth. AuthJWTSecret is required (gateway fails to start
	// when unset — see Load()). AuthJWTTTLSeconds defaults to 86400 (24h).
	// AuthCookieDomain may be left empty (browser defaults to the host the
	// response came from). AuthCookieSecure defaults to true; set
	// `AUTH_COOKIE_SECURE=false` to disable for local http development.
	AuthJWTSecret     string
	AuthJWTTTLSeconds int
	AuthCookieDomain  string
	AuthCookieSecure  bool

	// AllowS2SHeader controls the system-to-system header bypass on
	// WithAuth. False (default) → /api/v1 always requires a valid auth
	// cookie; `X-User-Id` and `X-Admin-Key` headers alone never
	// authenticate a caller. True (env `ALLOW_S2S_HEADER=true`) → when
	// no cookie is present, a request carrying a matching `X-Admin-Key`
	// is allowed through. Operators MUST ensure the gateway port is not
	// internet-facing when enabling this — anyone who can reach the
	// socket bypasses cookie auth.
	AllowS2SHeader bool

	// AllowedOrigins is the comma-split, trimmed list parsed from the
	// `ALLOWED_ORIGINS` env var. Empty (default) → CORS allows "*" and
	// the WebSocket Accept uses InsecureSkipVerify (dev-friendly).
	// Non-empty → CORS allowlist is strict, and the WS upgrade uses
	// `OriginPatterns` to reject mismatched Origin headers (returns
	// 403). Entries are full origin URLs like `http://localhost:3000`
	// or `https://app.example.com`; the WS layer extracts the host
	// portion because nhooyr/coder OriginPatterns are host patterns,
	// not full URLs.
	AllowedOrigins []string
}

// Load reads env (with optional .env file), validates, and returns Config.
func Load() (*Config, error) {
	// Best-effort .env loading; ignore errors when absent.
	for _, path := range []string{"gateway/.env", ".env"} {
		if _, err := os.Stat(path); err == nil {
			_ = godotenv.Load(path)
			break
		}
	}

	cfg := &Config{
		MongoURI:      os.Getenv("MONGODB_URI"),
		EncryptionKey: os.Getenv("ENCRYPTION_KEY"),
		Port:          os.Getenv("PORT"),
		TimescaleDSN:  os.Getenv("TIMESCALE_DSN"),
		QuantGRPCAddr: os.Getenv("QUANT_GRPC_ADDR"),
		AdminKey:      os.Getenv("ADMIN_KEY"),
		RedisURL:       os.Getenv("REDIS_URL"),
		RequireUserID:  os.Getenv("REQUIRE_USER_ID") == "true",
		AllowS2SHeader: os.Getenv("ALLOW_S2S_HEADER") == "true",
		AllowedOrigins: parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS")),

		AuthJWTSecret:    os.Getenv("AUTH_JWT_SECRET"),
		AuthCookieDomain: os.Getenv("AUTH_COOKIE_DOMAIN"),
		// Default true; explicit "false" opt-out for http://localhost dev.
		AuthCookieSecure: os.Getenv("AUTH_COOKIE_SECURE") != "false",
	}
	// Auth TTL parsing — sentinel 0 → use the 24h default.
	if raw := os.Getenv("AUTH_JWT_TTL_SECONDS"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("AUTH_JWT_TTL_SECONDS must be a positive integer (got %q)", raw)
		}
		cfg.AuthJWTTTLSeconds = n
	} else {
		cfg.AuthJWTTTLSeconds = 86400
	}
	if cfg.Port == "" {
		cfg.Port = "3001"
	}

	var missing []string
	if cfg.MongoURI == "" {
		missing = append(missing, "MONGODB_URI")
	}
	if cfg.EncryptionKey == "" {
		missing = append(missing, "ENCRYPTION_KEY")
	}
	// AUTH_JWT_SECRET is REQUIRED — running without it would mean any
	// caller can mint a valid JWT against a default empty secret. Fail
	// fast so the misconfiguration can't ship.
	if cfg.AuthJWTSecret == "" {
		missing = append(missing, "AUTH_JWT_SECRET")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env vars: %v", missing)
	}
	if len(cfg.EncryptionKey) != 64 {
		return nil, errors.New("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)")
	}
	if len(cfg.AuthJWTSecret) < 32 {
		return nil, errors.New("AUTH_JWT_SECRET must be at least 32 chars (use `openssl rand -hex 32`)")
	}
	return cfg, nil
}

// AuthJWTTTL returns the JWT lifetime as a time.Duration.
func (c *Config) AuthJWTTTL() time.Duration {
	if c.AuthJWTTTLSeconds <= 0 {
		return 24 * time.Hour
	}
	return time.Duration(c.AuthJWTTTLSeconds) * time.Second
}

// parseAllowedOrigins splits the comma-separated ALLOWED_ORIGINS value
// into a clean list. Whitespace around each entry is trimmed and empty
// fragments (e.g. a trailing comma) are dropped. Returning nil for an
// empty input lets callers distinguish "unset" (allow all) from a
// configured allowlist with zero remaining entries.
func parseAllowedOrigins(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
