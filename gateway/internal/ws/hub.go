// Package ws is the gateway-side WebSocket hub.
//
// Architecture (single-process, phase 1):
//
//	Browser --(WSS /ws)--> Hub --(per-account upstream)--> Binance user-data
//
// Each browser session subscribes to one or more accountIds. The hub lazily
// starts an upstream user-data goroutine the first time anyone subscribes to a
// given account, and stops it when the last subscriber goes away.
//
// Phase 7 will revisit this for multi-replica gateway deployments — the
// Hub.Subscribe / Unsubscribe surface stays, but the upstream lifecycle moves
// behind a leader-elected executor and Redis Streams fans out to replicas.
package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/finance_next/gateway/internal/exchange"
)

// UpstreamFactory builds an upstream stream for a given accountId. The hub
// calls it the first time an account is subscribed; the gateway wires this to
// account.Repo + binance.NewClient at construction time.
type UpstreamFactory func(ctx context.Context, accountID string) (exchange.UserDataStream, error)

// SessionSink is the side of a session the hub pushes into. The HTTP layer
// adapts the websocket connection to this interface; tests use a fake.
type SessionSink interface {
	// SendJSON serialises v and writes a single message. Must be safe for
	// concurrent calls from the hub.
	SendJSON(ctx context.Context, v any) error
}

// session tracks one browser connection.
type session struct {
	id        string
	sink      SessionSink
	subs      map[string]struct{} // account ids
	closeOnce sync.Once
}

// upstream tracks one shared per-account upstream connection plus the set of
// session ids subscribed to it.
type upstream struct {
	stream  exchange.UserDataStream
	cancel  context.CancelFunc
	subs    map[string]struct{} // session ids
	stopped bool
}

// Hub multiplexes per-account upstreams to per-session subscribers.
//
// All mutations go through the single mu — the throughput target is human
// scale (a few accounts × a handful of dashboards), not HFT.
type Hub struct {
	mu       sync.Mutex
	sessions map[string]*session
	upstream map[string]*upstream
	factory  UpstreamFactory
	log      *slog.Logger
}

// NewHub returns a fresh Hub.
func NewHub(factory UpstreamFactory, log *slog.Logger) *Hub {
	if log == nil {
		log = slog.Default()
	}
	return &Hub{
		sessions: map[string]*session{},
		upstream: map[string]*upstream{},
		factory:  factory,
		log:      log,
	}
}

// Register adds a new browser session. Returns the registered session id; the
// caller is expected to call Unregister when the WS closes.
func (h *Hub) Register(id string, sink SessionSink) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sessions[id] = &session{
		id:   id,
		sink: sink,
		subs: map[string]struct{}{},
	}
}

// Unregister removes a session and decrements every account it was subscribed
// to, stopping idle upstreams.
func (h *Hub) Unregister(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[id]
	if !ok {
		return
	}
	for accountID := range s.subs {
		h.detachLocked(id, accountID)
	}
	delete(h.sessions, id)
}

// Subscribe binds a session id to an accountId, starting the upstream if this
// is the first subscriber. Safe to call repeatedly with the same pair.
func (h *Hub) Subscribe(ctx context.Context, sessionID, accountID string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[sessionID]
	if !ok {
		return errors.New("ws: unknown session")
	}
	if _, already := s.subs[accountID]; already {
		return nil
	}

	up, ok := h.upstream[accountID]
	if !ok {
		// Start a fresh upstream. We pass a hub-owned ctx so the upstream
		// outlives the request that triggered this subscribe call.
		ctx, cancel := context.WithCancel(context.Background())
		stream, err := h.factory(ctx, accountID)
		if err != nil {
			cancel()
			return fmt.Errorf("ws: start upstream: %w", err)
		}
		up = &upstream{
			stream: stream,
			cancel: cancel,
			subs:   map[string]struct{}{},
		}
		h.upstream[accountID] = up
		go h.fanOut(accountID, up)
	}
	up.subs[sessionID] = struct{}{}
	s.subs[accountID] = struct{}{}
	return nil
}

// Unsubscribe is the inverse of Subscribe. Stops the upstream when the last
// subscriber leaves.
func (h *Hub) Unsubscribe(sessionID, accountID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[sessionID]
	if !ok {
		return
	}
	if _, has := s.subs[accountID]; !has {
		return
	}
	delete(s.subs, accountID)
	h.detachLocked(sessionID, accountID)
}

// detachLocked removes sessionID from accountID's upstream and stops the
// upstream when empty. Caller must hold h.mu.
func (h *Hub) detachLocked(sessionID, accountID string) {
	up, ok := h.upstream[accountID]
	if !ok {
		return
	}
	delete(up.subs, sessionID)
	if len(up.subs) == 0 {
		up.stopped = true
		up.cancel()
		_ = up.stream.Close()
		delete(h.upstream, accountID)
	}
}

// fanOut consumes events from one upstream and delivers them to every
// currently-subscribed session as `account.event` envelopes.
func (h *Hub) fanOut(accountID string, up *upstream) {
	for {
		select {
		case ev, ok := <-up.stream.Events():
			if !ok {
				h.handleUpstreamEnd(accountID, up, nil)
				return
			}
			h.deliver(accountID, ev.Payload)
		case err, ok := <-up.stream.Errs():
			if !ok {
				return
			}
			h.handleUpstreamEnd(accountID, up, err)
			return
		}
	}
}

// handleUpstreamEnd notifies subscribers and reaps the upstream record. Phase
// 1 does *not* auto-reconnect server-side; the browser detects the dropped
// `account.event` flow and re-subscribes (its WS client owns reconnect logic).
func (h *Hub) handleUpstreamEnd(accountID string, up *upstream, cause error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if up.stopped {
		return
	}
	up.stopped = true
	for sessionID := range up.subs {
		s, ok := h.sessions[sessionID]
		if !ok {
			continue
		}
		_ = s.sink.SendJSON(context.Background(), map[string]any{
			"type":      "account.upstream_closed",
			"accountId": accountID,
			"error":     errString(cause),
		})
		delete(s.subs, accountID)
	}
	delete(h.upstream, accountID)
	up.cancel()
	_ = up.stream.Close()
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// deliver writes one event to every current subscriber. We snapshot the
// session set under the lock then release before writing.
func (h *Hub) deliver(accountID string, payload []byte) {
	type envelope struct {
		Type      string          `json:"type"`
		AccountID string          `json:"accountId"`
		Payload   json.RawMessage `json:"payload"`
	}

	h.mu.Lock()
	up, ok := h.upstream[accountID]
	if !ok {
		h.mu.Unlock()
		return
	}
	sinks := make([]SessionSink, 0, len(up.subs))
	for sid := range up.subs {
		if s, ok := h.sessions[sid]; ok {
			sinks = append(sinks, s.sink)
		}
	}
	h.mu.Unlock()

	env := envelope{
		Type:      "account.event",
		AccountID: accountID,
		Payload:   json.RawMessage(payload),
	}
	for _, sink := range sinks {
		if err := sink.SendJSON(context.Background(), env); err != nil {
			h.log.Warn("ws deliver failed", "accountId", accountID, "err", err)
		}
	}
}

// HasUpstream reports whether the hub holds a live upstream for accountID.
// Exposed for tests.
func (h *Hub) HasUpstream(accountID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.upstream[accountID]
	return ok
}

// SubscriberCount returns how many sessions are subscribed to accountID.
// Exposed for tests.
func (h *Hub) SubscriberCount(accountID string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	up, ok := h.upstream[accountID]
	if !ok {
		return 0
	}
	return len(up.subs)
}
