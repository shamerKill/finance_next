package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
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
}

// NewHandler returns a handler bound to hub.
func NewHandler(hub *Hub, log *slog.Logger) *Handler {
	if log == nil {
		log = slog.Default()
	}
	return &Handler{hub: hub, log: log}
}

// Handle is the Echo handler for GET /ws.
func (h *Handler) Handle(c echo.Context) error {
	// AcceptOptions: in dev the browser hits ws://localhost:3001 from
	// localhost:3000. We accept any origin here for now and TODO(phase 7) lock
	// it to the configured frontend origin.
	conn, err := websocket.Accept(c.Response(), c.Request(), &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
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
