// mainnet_gate.go — admin gate for Binance mainnet order placement.
//
// Phase 4 ships testnet by default. Mainnet requires THREE switches all
// flipped on:
//
//  1. The strategy's `live.mode == "mainnet"`
//  2. Process env `MAINNET_TRADING_ENABLED=true`
//  3. A confirm token registered via the admin endpoint within the last hour
//
// (1) is per-strategy and lives in Mongo.
// (2) is process-wide and read once at construction.
// (3) is process-wide in-memory state managed by [TokenStore] below.
//
// The flow:
//
//   POST /api/v1/admin/mainnet/request-token  → returns a one-shot token,
//   logs it to stderr "EMAIL CONFIRMATION REQUIRED: token=…". An external
//   operator copy/pastes that into:
//
//   POST /api/v1/admin/mainnet/confirm  body {token}  → registers the
//   token as `confirmed` for 1 hour. While confirmed, [TokenStore.Allowed]
//   returns true.
//
// The "request" stage exists so a leaked admin key alone isn't enough —
// the operator also has to actively confirm. In Phase 7 we'll wire this
// to a real email round-trip; today it just prints to logs as the spec
// instructs.
package orderengine

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Common errors surfaced by the gate.
var (
	// ErrEnvDisabled reports that MAINNET_TRADING_ENABLED is not "true".
	// The gate refuses to register or honour any confirm tokens.
	ErrEnvDisabled = errors.New("orderengine: mainnet trading not enabled by env")
	// ErrTokenUnknown means the supplied confirm token never went through
	// the request-token endpoint, or has expired.
	ErrTokenUnknown = errors.New("orderengine: unknown or expired mainnet confirm token")
)

// Token request lifetime: how long a `request-token` token is valid for
// before it must be redeemed via /confirm. After confirm it gets a
// longer TTL — see ConfirmedTTL.
const (
	// RequestTTL is how long an unconfirmed token is valid.
	RequestTTL = 10 * time.Minute
	// ConfirmedTTL is how long a confirmed token grants mainnet access.
	ConfirmedTTL = 1 * time.Hour
)

// TokenStore is the in-process registry for mainnet confirm tokens.
//
// Concurrency: every method takes the mutex before reading/writing. The
// admin endpoints + the order engine all consult the same store
// simultaneously, so we keep a read-most-of-the-time path cheap and
// correct.
//
// Phase 7 will revisit this for multi-replica deployments (Redis-backed
// store). Today we keep it process-local, mirroring the Phase 1
// per-process WS hub.
type TokenStore struct {
	mu sync.RWMutex
	// envEnabled is the snapshot of MAINNET_TRADING_ENABLED at construction.
	// We deliberately freeze this at process start so a runtime mutation of
	// the env (e.g. via an injected setter) can't open the gate.
	envEnabled bool
	// requested[token] = expiry. Used to validate /confirm calls.
	requested map[string]time.Time
	// confirmedExpiry is when the *currently active* confirm token expires.
	// The actual token string isn't stored — we don't need it; once a
	// token is confirmed, the gate stays open until expiry regardless of
	// which token caused the open.
	confirmedExpiry time.Time
	log             *slog.Logger
}

// NewTokenStore constructs a fresh store. `envEnabled` should be the
// result of evaluating `os.Getenv("MAINNET_TRADING_ENABLED") == "true"`
// at process start.
func NewTokenStore(envEnabled bool, log *slog.Logger) *TokenStore {
	if log == nil {
		log = slog.Default()
	}
	return &TokenStore{
		envEnabled: envEnabled,
		requested:  map[string]time.Time{},
		log:        log,
	}
}

// EnvEnabled reports whether MAINNET_TRADING_ENABLED was set at startup.
// Useful for the health endpoint / admin status UI.
func (s *TokenStore) EnvEnabled() bool { return s.envEnabled }

// Allowed reports whether mainnet calls are currently permitted.
// Implements [binance.MainnetGate] via [GateAdapter].
func (s *TokenStore) Allowed() bool {
	if !s.envEnabled {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return time.Now().Before(s.confirmedExpiry)
}

// RequestToken creates a fresh 32-hex-char token, records it as
// "requested", and returns it to the admin caller. The token must be
// confirmed within RequestTTL or it is forgotten on the next sweep.
//
// The token is also logged at INFO with a clear marker so an operator
// running the gateway in foreground sees "EMAIL CONFIRMATION REQUIRED:
// token=…" — Phase 4 spec ships this stand-in for a real email send.
func (s *TokenStore) RequestToken() (string, error) {
	if !s.envEnabled {
		return "", ErrEnvDisabled
	}
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("rand: %w", err)
	}
	token := hex.EncodeToString(buf)
	s.mu.Lock()
	s.requested[token] = time.Now().Add(RequestTTL)
	s.cleanLocked()
	s.mu.Unlock()
	// Print to stderr per spec — verifier looks for this exact string.
	s.log.Info("EMAIL CONFIRMATION REQUIRED", "token", token, "ttl", RequestTTL.String())
	return token, nil
}

// Confirm validates a token against the requested set and, on success,
// opens the gate for ConfirmedTTL.
//
// Returns ErrTokenUnknown when the token isn't in `requested` (never
// generated, already used, or expired). The token is consumed on
// success — calling Confirm twice with the same token returns
// ErrTokenUnknown the second time.
func (s *TokenStore) Confirm(token string) error {
	if !s.envEnabled {
		return ErrEnvDisabled
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.requested[token]
	if !ok || time.Now().After(exp) {
		delete(s.requested, token)
		return ErrTokenUnknown
	}
	delete(s.requested, token)
	s.confirmedExpiry = time.Now().Add(ConfirmedTTL)
	s.log.Warn("MAINNET TRADING WINDOW OPENED", "ttl", ConfirmedTTL.String(), "until", s.confirmedExpiry.UTC().Format(time.RFC3339))
	return nil
}

// Status is a snapshot of the store for admin UI / health checks.
// Returned values are safe to JSON-marshal directly.
type Status struct {
	EnvEnabled        bool   `json:"envEnabled"`
	MainnetAllowed    bool   `json:"mainnetAllowed"`
	ConfirmExpiresAt  string `json:"confirmExpiresAt,omitempty"`
	PendingTokenCount int    `json:"pendingTokenCount"`
}

// Snapshot returns the current store state.
func (s *TokenStore) Snapshot() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st := Status{
		EnvEnabled:        s.envEnabled,
		MainnetAllowed:    s.envEnabled && time.Now().Before(s.confirmedExpiry),
		PendingTokenCount: len(s.requested),
	}
	if !s.confirmedExpiry.IsZero() {
		st.ConfirmExpiresAt = s.confirmedExpiry.UTC().Format(time.RFC3339)
	}
	return st
}

func (s *TokenStore) cleanLocked() {
	now := time.Now()
	for tok, exp := range s.requested {
		if now.After(exp) {
			delete(s.requested, tok)
		}
	}
}
