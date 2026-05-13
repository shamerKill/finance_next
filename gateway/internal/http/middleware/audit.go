// Package middleware — Phase 7 audit middleware.
//
// Captures every non-GET request under /api/v1/, scrubs sensitive fields
// (apiKey/secretKey/passphrase/*Ciphertext) from the body, and writes a
// row to the audit collection asynchronously through a buffered channel.
// Failures (channel full, Mongo down) are counted via DropCount and
// logged but never block the request.
package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/labstack/echo/v4"
)

// scrubKeys lists the JSON / query-param key patterns that are redacted
// before persisting. Match is case-insensitive and matches *substring*
// (so `apiKeyCiphertext` and `userApiKey` both hit `apikey`).
var scrubKeys = []string{
	"apikey",
	"secretkey",
	"secret",
	"passphrase",
	"ciphertext",
	"password",
	"token",
	// Phase 9 — Polymarket / EVM wallets. The bare hex of a private key
	// or seed phrase is the highest-value secret in the system and must
	// never reach the audit log even when nested deep in a payload.
	"privatekey",
	"mnemonic",
	"seed",
	// Node 3.E.4 — AI provider keys persisted via PUT /admin/ai/config.
	// `apikey` above already substring-matches anthropicApiKey /
	// openaiApiKey / deepseekApiKey, but explicit entries make intent
	// loud at the call site and survive future refactors of `apikey`.
	"anthropicapikey",
	"openaiapikey",
	"deepseekapikey",
}

// SkipPaths is the set of path prefixes that bypass auditing entirely.
// Health checks and static asset requests would dominate the log volume
// and provide no security signal.
var SkipPaths = []string{
	"/healthz",
	"/metrics",
	"/ws",
}

// AuditWriter is the dependency the middleware needs. Implemented by
// [mongostore.AuditRepo]. We use an interface so tests can inject a
// fake collector.
type AuditWriter interface {
	Insert(ctx context.Context, e *domain.AuditEntry) error
}

// Config knobs the middleware constructor.
type Config struct {
	Writer     AuditWriter
	BufferSize int           // default 1024
	Log        *slog.Logger  // default slog.Default()
	FlushEvery time.Duration // background flush tick (default 100ms; only used to reap context cancellations)
}

// Middleware is the Echo middleware factory + background drainer. Call
// Start(ctx) once at boot; Middleware() returns the function to mount.
type Middleware struct {
	w        AuditWriter
	log      *slog.Logger
	ch       chan *domain.AuditEntry
	dropped  atomic.Uint64
	written  atomic.Uint64
}

// New constructs the middleware. Returns nil + error when the buffer
// size is negative.
func New(cfg Config) (*Middleware, error) {
	if cfg.BufferSize <= 0 {
		cfg.BufferSize = 1024
	}
	if cfg.Log == nil {
		cfg.Log = slog.Default()
	}
	return &Middleware{
		w:   cfg.Writer,
		log: cfg.Log,
		ch:  make(chan *domain.AuditEntry, cfg.BufferSize),
	}, nil
}

// Start runs the background drain goroutine until ctx is cancelled.
// Callers should typically `go m.Start(rootCtx)`.
func (m *Middleware) Start(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			// Drain remaining entries best-effort with a short timeout.
			drainCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			for {
				select {
				case e := <-m.ch:
					_ = m.w.Insert(drainCtx, e)
				default:
					return
				}
			}
		case e := <-m.ch:
			if m.w == nil {
				continue
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			if err := m.w.Insert(writeCtx, e); err != nil {
				m.log.Warn("audit insert failed", "err", err, "path", e.Path)
			} else {
				m.written.Add(1)
			}
			cancel()
		}
	}
}

// DropCount returns the number of entries dropped because the buffer
// was full. Exposed so the OTel metric can publish it.
func (m *Middleware) DropCount() uint64 { return m.dropped.Load() }

// WriteCount returns the number of successfully persisted entries.
func (m *Middleware) WriteCount() uint64 { return m.written.Load() }

// Middleware returns the Echo middleware function. Mounts on the v1
// group; only writes for non-GET requests under /api/v1/.
func (m *Middleware) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()

			// Cheap skip checks first.
			if req.Method == http.MethodGet || req.Method == http.MethodOptions || req.Method == http.MethodHead {
				return next(c)
			}
			path := req.URL.Path
			for _, p := range SkipPaths {
				if strings.HasPrefix(path, p) {
					return next(c)
				}
			}

			// Capture the request body without consuming it for the next
			// handler. We bound the read to 64 KiB — anything larger is
			// almost certainly a payload we don't want to copy in full.
			var bodyBytes []byte
			if req.Body != nil {
				lr := io.LimitReader(req.Body, 64*1024)
				bodyBytes, _ = io.ReadAll(lr)
				req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			}

			err := next(c)

			status := c.Response().Status
			if status == 0 {
				status = http.StatusOK
			}

			entry := &domain.AuditEntry{
				Ts:           time.Now().UTC(),
				Actor:        actorFromContext(c, req),
				Action:       req.Method + " " + path,
				ResourceType: classifyResource(path),
				ResourceID:   resourceIDFromPath(path),
				Method:       req.Method,
				Path:         path,
				StatusCode:   status,
				Payload:      sanitizePayload(bodyBytes),
				IP:           c.RealIP(),
				UserAgent:    req.UserAgent(),
				RequestID:    c.Response().Header().Get(echo.HeaderXRequestID),
			}

			// Non-blocking enqueue; on overflow we count + log + drop.
			select {
			case m.ch <- entry:
			default:
				m.dropped.Add(1)
				m.log.Warn("audit buffer full, dropping entry", "path", path)
			}

			return err
		}
	}
}

// actorFromContext derives the actor identifier. Fix 3 mounts this
// middleware BEFORE WithAuth so failed-auth requests still produce an
// audit row; in that case the Echo userId context is unpopulated and
// we fall back to the admin-actor header / admin-key marker /
// "anonymous". When WithAuth has run successfully the context carries
// the authenticated subject — that always wins over the headers.
func actorFromContext(c echo.Context, r *http.Request) string {
	if uid, ok := c.Get(ContextKey).(string); ok && uid != "" {
		return uid
	}
	if v := r.Header.Get("X-Admin-Actor"); v != "" {
		return v
	}
	if r.Header.Get("X-Admin-Key") != "" {
		return "admin"
	}
	return "anonymous"
}

// classifyResource maps a path to a [domain.ResourceType]. Order matters;
// the first prefix match wins.
func classifyResource(path string) domain.ResourceType {
	p := strings.ToLower(path)
	switch {
	case strings.Contains(p, "/admin/halt"),
		strings.Contains(p, "/admin/resume"),
		strings.Contains(p, "/admin/system-state"),
		strings.Contains(p, "/admin/portfolio-limits"):
		return domain.ResourceSystem
	case strings.Contains(p, "/wallets"):
		return domain.ResourceWallet
	case strings.Contains(p, "/prediction"):
		return domain.ResourcePrediction
	case strings.Contains(p, "/strategies"),
		strings.Contains(p, "/option"):
		return domain.ResourceStrategy
	case strings.Contains(p, "/accounts"):
		return domain.ResourceAccount
	case strings.Contains(p, "/orders"), strings.Contains(p, "/submit-order"):
		return domain.ResourceOrder
	case strings.Contains(p, "/recommendations"):
		return domain.ResourceRecommendation
	case strings.Contains(p, "/market"):
		return domain.ResourceMarket
	default:
		return domain.ResourceUnknown
	}
}

// resourceIDFromPath extracts the trailing path id for paths like
// /api/v1/strategies/abc123 or /api/v1/accounts/xyz/balances.
func resourceIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// Look for the segment immediately after a known resource label.
	resources := map[string]bool{
		"strategies": true, "accounts": true, "option": true,
		"recommendations": true, "orders": true, "backtests": true,
	}
	for i, p := range parts {
		if resources[p] && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

// sanitizePayload strips secret-like keys from a JSON body, recursively.
// Non-JSON bodies are dropped to "" — we never persist raw bytes the
// scrubber can't traverse (binary uploads etc).
func sanitizePayload(body []byte) json.RawMessage {
	if len(body) == 0 {
		return nil
	}
	var any interface{}
	if err := json.Unmarshal(body, &any); err != nil {
		// Not JSON — return a marker rather than the raw bytes so we
		// can't accidentally leak credentials embedded in form data.
		return json.RawMessage(`{"_note":"non-json body redacted"}`)
	}
	scrubbed := scrub(any)
	out, err := json.Marshal(scrubbed)
	if err != nil {
		return json.RawMessage(`{"_note":"marshal failed"}`)
	}
	return out
}

// scrub walks the decoded JSON tree replacing scrub-key values with the
// marker string "[redacted]".
func scrub(v interface{}) interface{} {
	switch t := v.(type) {
	case map[string]interface{}:
		out := make(map[string]interface{}, len(t))
		for k, val := range t {
			if isSensitiveKey(k) {
				out[k] = "[redacted]"
				continue
			}
			out[k] = scrub(val)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(t))
		for i, val := range t {
			out[i] = scrub(val)
		}
		return out
	default:
		return v
	}
}

// isSensitiveKey reports whether k matches any pattern in scrubKeys.
// Case-insensitive substring match.
func isSensitiveKey(k string) bool {
	lk := strings.ToLower(k)
	for _, pat := range scrubKeys {
		if strings.Contains(lk, pat) {
			return true
		}
	}
	return false
}
