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
		RedisURL:      os.Getenv("REDIS_URL"),
		RequireUserID: os.Getenv("REQUIRE_USER_ID") == "true",
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
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env vars: %v", missing)
	}
	if len(cfg.EncryptionKey) != 64 {
		return nil, errors.New("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)")
	}
	return cfg, nil
}
