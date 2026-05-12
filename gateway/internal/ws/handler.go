package ws

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// AuthVerifier validates the inbound WebSocket upgrade request and
// returns the authenticated userId + role on success. Phase 1.A.4
// requires the `auth_token` cookie to carry a valid JWT; the router
// builds a closure that delegates to handlers.ParseJWT (same parser
// /api/v1 cookie auth uses) and passes it in here.
//
// nil verifier disables WS auth entirely — the legacy behaviour. The
// router only passes nil when no JWT secret is configured (dev), in
// which case the upgrade goes through without populating session
// userId / role and downstream ownership checks fall back to the
// no-resolver no-op path.
type AuthVerifier func(r *http.Request) (userID, role string, err error)

// Handler upgrades incoming HTTP requests to WebSocket and bridges them to the
// Hub.
type Handler struct {
	hub *Hub
	log *slog.Logger
	// originPatterns are host patterns (not full URLs) passed to
	// websocket.AcceptOptions.OriginPatterns. Derived from the
	// allowedOrigins URLs supplied at construction time. Empty slice
	// signals "no allowlist configured" and Handle falls back to
	// InsecureSkipVerify for the dev workflow.
	originPatterns []string
	// authVerifier is the Phase 1.A.4 cookie / JWT check executed
	// *before* the websocket upgrade. Failure returns HTTP 403 and
	// the upgrade never happens, so an unauthenticated browser can't
	// even establish the WS frame stream.
	authVerifier AuthVerifier
}

// NewHandler returns a handler bound to hub.
//
// allowedOrigins is the operator-configured CORS allowlist (full origin URLs
// like "http://localhost:3000"). When non-empty, the WS upgrade rejects any
// browser whose Origin header is not on the list (HTTP 403). Empty / nil
// keeps the dev-friendly InsecureSkipVerify behaviour so a `yarn dev` on a
// different port still works without per-developer config.
func NewHandler(hub *Hub, log *slog.Logger, allowedOrigins []string) *Handler {
	if log == nil {
		log = slog.Default()
	}
	return &Handler{
		hub:            hub,
		log:            log,
		originPatterns: originPatternsFromURLs(allowedOrigins),
	}
}

// NewHandlerWithAuth is like NewHandler but also wires an AuthVerifier
// that runs before the WS upgrade. The Phase 1.A.4 production path
// uses this. Passing a nil verifier is equivalent to NewHandler.
func NewHandlerWithAuth(hub *Hub, log *slog.Logger, allowedOrigins []string, verifier AuthVerifier) *Handler {
	h := NewHandler(hub, log, allowedOrigins)
	h.authVerifier = verifier
	return h
}

// originPatternsFromURLs extracts the host portion of each allowed origin
// URL. The coder/websocket AcceptOptions.OriginPatterns field matches
// against the Origin header's host (case-insensitive path.Match), not the
// full URL — so "http://localhost:3000" must become "localhost:3000".
// Entries that fail to parse are passed through verbatim so an operator
// can also supply a raw host pattern if they choose to.
func originPatternsFromURLs(origins []string) []string {
	if len(origins) == 0 {
		return nil
	}
	out := make([]string, 0, len(origins))
	for _, o := range origins {
		u, err := url.Parse(o)
		if err != nil || u.Host == "" {
			out = append(out, o)
			continue
		}
		out = append(out, u.Host)
	}
	return out
}

// Handle is the Echo handler for GET /ws.
func (h *Handler) Handle(c echo.Context) error {
	// Phase 1.A.4: validate the auth cookie *before* doing the websocket
	// upgrade. We respond with a plain 403 + body — the browser sees the
	// upgrade fail (status 403) and the WS Dial promise rejects. No
	// session is created, no upstream is started, and the audit log
	// captures the failure as a normal HTTP request (because the audit
	// middleware sits on /api/v1, not /ws — note: /ws is exempt per the
	// design doc and we keep that, only adding auth here).
	var (
		userID string
		role   string
	)
	if h.authVerifier != nil {
		uid, r, err := h.authVerifier(c.Request())
		if err != nil || uid == "" {
			// Distinguish "no cookie" from "invalid cookie" only in the
			// log line — the wire response is the same so we don't leak
			// which JWTs the operator's secret can decode.
			h.log.Debug("ws auth rejected", "err", err)
			return c.JSON(http.StatusForbidden, map[string]string{"error": "unauthorized"})
		}
		userID = uid
		role = r
	}

	// AcceptOptions: when no origin allowlist is configured (dev), we keep
	// InsecureSkipVerify so a developer running yarn dev on an arbitrary
	// port can connect without per-machine config. In production
	// ALLOWED_ORIGINS is set and we switch to OriginPatterns, which causes
	// coder/websocket to return 403 on mismatched Origin headers.
	opts := &websocket.AcceptOptions{}
	if len(h.originPatterns) > 0 {
		opts.OriginPatterns = h.originPatterns
	} else {
		opts.InsecureSkipVerify = true
	}
	conn, err := websocket.Accept(c.Response(), c.Request(), opts)
	if err != nil {
		return err
	}

	sessionID := uuid.NewString()
	sink := newConnSink(conn)
	h.hub.RegisterAuthed(sessionID, sink, userID, role)
	defer h.hub.Unregister(sessionID)

	ctx := c.Request().Context()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			h.log.Debug("ws read terminated", "session", sessionID, "err", err)
			_ = conn.Close(websocket.StatusNormalClosure, "")
			return nil
		}
		// Phase 3 generalised the subscribe message to support multiple
		// topic kinds. Backwards compat: when `topic` is absent and
		// `accountId` is present, default to TopicAccount + accountId.
		var msg struct {
			Type      string `json:"type"`
			Topic     string `json:"topic"`
			ID        string `json:"id"`
			AccountID string `json:"accountId"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			_ = sink.SendJSON(ctx, map[string]any{
				"type":  "error",
				"error": "invalid message",
			})
			continue
		}
		topicKind := TopicKind(msg.Topic)
		topicID := msg.ID
		if topicKind == "" && msg.AccountID != "" {
			topicKind = TopicAccount
			topicID = msg.AccountID
		}
		switch msg.Type {
		case "subscribe":
			if topicKind == "" || topicID == "" {
				_ = sink.SendJSON(ctx, map[string]any{
					"type":  "error",
					"error": "subscribe requires topic + id (or accountId)",
				})
				continue
			}
			if err := h.hub.Subscribe(ctx, sessionID, topicKind, topicID); err != nil {
				// Phase 1.A.4: a denied subscription means the authenticated
				// user doesn't own the requested resource. Emit a clear
				// error frame without revealing whether the resource exists.
				// (A "no resolver wired" condition is not surfaced as a
				// distinct sentinel today — topic kinds with no resolver
				// fall through to the legacy no-check path; see ownership.go.)
				if errors.Is(err, ErrOwnershipDenied) {
					_ = sink.SendJSON(ctx, map[string]any{
						"type":  "error",
						"topic": string(topicKind),
						"id":    topicID,
						"error": "forbidden",
					})
					continue
				}
				// ErrUpstreamRetired is a soft signal: the venue retired the
				// upstream (e.g. Binance spot user-data /api/v3/userDataStream
				// returns 410 Gone). The subscription itself succeeded as a
				// degraded one — emit a Chinese "notice" frame so the UI can
				// show the user why they're not seeing live events, instead
				// of leaving the WS in an apparent-error state.
				if errors.Is(err, ErrUpstreamRetired) {
					_ = sink.SendJSON(ctx, map[string]any{
						"type":   "notice",
						"topic":  string(topicKind),
						"id":     topicID,
						"reason": "spot_user_stream_retired",
						"message": "Binance 已下线 spot 用户数据流接口 — 实时余额更新暂不可用。订单事件不受影响。",
					})
					continue
				}
				_ = sink.SendJSON(ctx, map[string]any{
					"type":  "error",
					"topic": string(topicKind),
					"id":    topicID,
					"error": err.Error(),
				})
			}
		case "unsubscribe":
			if topicKind == "" || topicID == "" {
				continue
			}
			h.hub.Unsubscribe(sessionID, topicKind, topicID)
		case "ping":
			_ = sink.SendJSON(ctx, map[string]any{"type": "pong"})
		default:
			_ = sink.SendJSON(ctx, map[string]any{
				"type":  "error",
				"error": "unknown type",
			})
		}
	}
}

// connSink is the SessionSink implementation backed by a websocket.Conn. Writes
// are serialised via mu so concurrent fan-out is safe.
type connSink struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func newConnSink(c *websocket.Conn) *connSink { return &connSink{conn: c} }

func (s *connSink) SendJSON(ctx context.Context, v any) error {
	bs, err := json.Marshal(v)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.conn.Write(wctx, websocket.MessageText, bs)
}

// Status returns a tiny health-style snapshot for HTTP debugging.
func (h *Handler) Status() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"hub": "ok"})
	})
}
