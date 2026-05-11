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
	h.hub.Register(sessionID, sink)
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
