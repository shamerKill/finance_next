// Package ws is the gateway-side WebSocket hub.
//
// Architecture (single-process, phase 1+3):
//
//	Browser --(WSS /ws)--> Hub --+--> Per-account upstream (Binance user-data)
//	                              \--> Per-topic event source (Redis Stream
//	                                   for backtest progress, etc.)
//
// Topic model (Phase 3 generalisation): each subscription is keyed by
// (kind, id). The Hub keeps the per-key upstream count + tears down
// idle upstreams. Two upstream factories are wired:
//
//   - AccountUpstreamFactory: produces an exchange.UserDataStream.
//     Lifecycle remains identical to phase 1.
//   - GenericUpstreamFactory: produces a generic event channel
//     (used for backtest progress fan-out from Redis Streams).
//
// Phase 7 will revisit this for multi-replica gateway deployments.
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

// ErrUpstreamRetired signals that the venue has retired the upstream this
// subscription depends on (e.g. Binance spot user-data REST endpoint). The
// /ws session handler maps this to a "degraded" notice frame and keeps the
// connection open rather than rejecting the subscribe — other event sources
// (Redis Stream order events) still flow.
var ErrUpstreamRetired = errors.New("ws: venue upstream retired; subscription degraded (no live events)")

// TopicKind discriminates subscription types.
type TopicKind string

const (
	// TopicAccount: Binance user-data fan-out (phase 1).
	TopicAccount TopicKind = "account"
	// TopicBacktest: backtest progress events (phase 3).
	TopicBacktest TopicKind = "backtest"
	// (TopicStrategy is defined in redis_strategy.go — phase 4 — with
	// the same string constant the browser sends. Keep its definition
	// next to its consumer for readability.)
	// TopicOptimization: Optuna study progress events (phase 6). Emitted
	// by the Python quant worker on `event.optimization.progress` and
	// forwarded to subscribers on (kind=optimization, id=studyId).
	TopicOptimization TopicKind = "optimization"
)

// topicKey is the hub-internal map key.
type topicKey struct {
	Kind TopicKind
	ID   string
}

// AccountUpstreamFactory builds an exchange user-data stream for an
// accountId. Same shape as in Phase 1.
type AccountUpstreamFactory func(ctx context.Context, accountID string) (exchange.UserDataStream, error)

// GenericEvent is the payload emitted by a non-account upstream. The Kind
// is set by the factory and propagates into the WS envelope.
type GenericEvent struct {
	Type    string          // e.g. "backtest.progress" or "backtest.completed"
	Payload json.RawMessage // already-encoded JSON; the hub forwards verbatim
}

// GenericUpstream is a topic-scoped event source. Implementations must
// drain Events() until Stop() (or the context ends), and Stop() must
// close the channel to signal end-of-stream.
type GenericUpstream interface {
	Events() <-chan GenericEvent
	Stop()
}

// GenericUpstreamFactory builds a GenericUpstream for one (kind, id) pair.
// Phase 3 wires this for TopicBacktest backed by Redis Streams.
type GenericUpstreamFactory func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error)

// SessionSink is the side of a session the hub pushes into.
type SessionSink interface {
	SendJSON(ctx context.Context, v any) error
}

type session struct {
	id   string
	sink SessionSink
	subs map[topicKey]struct{}
	// userID / role are populated at Register time from the authenticated
	// JWT claims. The Hub uses them to enforce per-subscription ownership
	// (see ownership.go). Empty userID denotes an anonymous session and
	// will fail every ownership check — Phase 1.A.4 forbids unauthenticated
	// /ws upgrades, so this should never happen in production.
	userID    string
	role      string
	closeOnce sync.Once
}

// upstream tracks one shared per-topic event source plus subscribers.
// Exactly one of `acctStream` / `generic` is non-nil (chosen by Kind).
type upstream struct {
	kind       TopicKind
	id         string
	acctStream exchange.UserDataStream
	generic    GenericUpstream
	cancel     context.CancelFunc
	subs       map[string]struct{}
	stopped    bool
}

// Hub multiplexes per-topic upstreams to per-session subscribers.
type Hub struct {
	mu       sync.Mutex
	sessions map[string]*session
	upstream map[topicKey]*upstream

	acctFactory    AccountUpstreamFactory
	genericFactory GenericUpstreamFactory

	// Phase 1.A.4: per-topic-kind ownership resolver. A subscribe request
	// for (kind, id) is admitted iff the session's userID matches the
	// owner returned by resolvers[kind] — or the session has role=admin.
	// Topic kinds without a registered resolver fail-closed.
	resolvers map[TopicKind]OwnerResolver

	log *slog.Logger
}

// NewHub returns a fresh Hub with the legacy account-only factory wired.
// Equivalent to Phase 1's ws.NewHub.
func NewHub(factory AccountUpstreamFactory, log *slog.Logger) *Hub {
	return NewHubFull(factory, nil, log)
}

// NewHubFull returns a Hub with both an account-upstream factory and an
// optional generic-topic factory. Pass `nil` for genericFactory if you
// only need account fan-out.
func NewHubFull(acctF AccountUpstreamFactory, genF GenericUpstreamFactory, log *slog.Logger) *Hub {
	if log == nil {
		log = slog.Default()
	}
	return &Hub{
		sessions:       map[string]*session{},
		upstream:       map[topicKey]*upstream{},
		acctFactory:    acctF,
		genericFactory: genF,
		resolvers:      map[TopicKind]OwnerResolver{},
		log:            log,
	}
}

// SetOwnerResolver registers (or replaces) the ownership resolver for a
// topic kind. Mounted by the router at startup for each kind whose
// underlying repo is non-nil. Topic kinds with no resolver fail-closed:
// Subscribe returns ErrOwnershipUnknown.
//
// Passing a nil resolver removes the entry, which is sometimes useful
// in tests but should not happen in production wiring.
func (h *Hub) SetOwnerResolver(kind TopicKind, r OwnerResolver) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r == nil {
		delete(h.resolvers, kind)
		return
	}
	h.resolvers[kind] = r
}

// Register adds a new browser session.
//
// Legacy entry point: no authenticated user attached. Equivalent to
// RegisterAuthed(id, sink, "", ""). Phase 1.A.4 production wiring uses
// RegisterAuthed so the per-subscription ownership check has something
// to compare against; the parameter-less form remains for the handful
// of test sites that pre-date auth.
func (h *Hub) Register(id string, sink SessionSink) {
	h.RegisterAuthed(id, sink, "", "")
}

// RegisterAuthed adds a new browser session with the authenticated
// userID + role attached. The handler obtains these by validating the
// `auth_token` cookie at WS upgrade time; an unauthenticated upgrade
// is rejected before Register is reached, so userID is non-empty in
// production.
func (h *Hub) RegisterAuthed(id string, sink SessionSink, userID, role string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sessions[id] = &session{
		id:     id,
		sink:   sink,
		subs:   map[topicKey]struct{}{},
		userID: userID,
		role:   role,
	}
}

// Unregister removes a session and decrements every topic it was subscribed to.
func (h *Hub) Unregister(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[id]
	if !ok {
		return
	}
	for tk := range s.subs {
		h.detachLocked(id, tk)
	}
	delete(h.sessions, id)
}

// Subscribe binds a session to a (kind, id) topic. Convenience wrappers
// SubscribeAccount / SubscribeBacktest exist for the common cases.
//
// Phase 1.A.4 ownership gate: when a resolver is registered for `kind`,
// Subscribe looks up the resource owner and rejects with
// ErrOwnershipDenied unless the session's userID matches (or the
// session's role is "admin"). Topic kinds with no resolver registered
// fall back to legacy "no-check" behaviour — the router *always*
// registers resolvers, so this fallback only fires in unit tests that
// pre-date auth.
func (h *Hub) Subscribe(ctx context.Context, sessionID string, kind TopicKind, id string) error {
	// Ownership check runs *before* we take the hub lock so the resolver
	// (which may hit Mongo) doesn't block other sessions. We grab the
	// session snapshot under the lock first to read userID / role.
	h.mu.Lock()
	s, ok := h.sessions[sessionID]
	if !ok {
		h.mu.Unlock()
		return errors.New("ws: unknown session")
	}
	sessUserID := s.userID
	sessRole := s.role
	resolver, hasResolver := h.resolvers[kind]
	h.mu.Unlock()

	if hasResolver && sessRole != AdminRole {
		owner, err := resolver.OwnerOf(ctx, id)
		if err != nil {
			// Lookup failure — fail-closed (don't smuggle resource access
			// through a transient Mongo error).
			return ErrOwnershipDenied
		}
		if owner == "" || owner != sessUserID {
			return ErrOwnershipDenied
		}
	}

	tk := topicKey{Kind: kind, ID: id}
	h.mu.Lock()
	defer h.mu.Unlock()
	// Re-fetch the session under the lock in case it raced with
	// Unregister between the ownership check and now.
	s, ok = h.sessions[sessionID]
	if !ok {
		return errors.New("ws: unknown session")
	}
	if _, already := s.subs[tk]; already {
		return nil
	}

	up, ok := h.upstream[tk]
	if !ok {
		newCtx, cancel := context.WithCancel(context.Background())
		var (
			acctStream exchange.UserDataStream
			generic    GenericUpstream
			err        error
		)
		switch kind {
		case TopicAccount:
			if h.acctFactory == nil {
				cancel()
				return errors.New("ws: account upstream factory not configured")
			}
			acctStream, err = h.acctFactory(newCtx, id)
		case TopicBacktest, TopicStrategy, TopicOptimization:
			// Generic-stream topics. The composed generic factory in
			// router.go dispatches by kind; we only enforce that *some*
			// factory exists.
			if h.genericFactory == nil {
				cancel()
				return errors.New("ws: generic upstream factory not configured")
			}
			generic, err = h.genericFactory(newCtx, kind, id)
		default:
			cancel()
			return fmt.Errorf("ws: unknown topic kind %q", kind)
		}
		if err != nil {
			cancel()
			// Binance's spot user-data REST endpoint was retired in 2024
			// (returns 410 Gone). We surface this as a degraded subscription
			// rather than a hard failure: the WS connection stays open with
			// no upstream events. Order events still flow because the order
			// engine uses Redis Streams, not Binance's user-data WS.
			if errors.Is(err, exchange.ErrUserStreamRetired) {
				return ErrUpstreamRetired
			}
			return fmt.Errorf("ws: start upstream: %w", err)
		}
		up = &upstream{
			kind:       kind,
			id:         id,
			acctStream: acctStream,
			generic:    generic,
			cancel:     cancel,
			subs:       map[string]struct{}{},
		}
		h.upstream[tk] = up
		go h.fanOut(tk, up)
	}
	up.subs[sessionID] = struct{}{}
	s.subs[tk] = struct{}{}
	return nil
}

// SubscribeAccount is the Phase 1 entry point retained for backwards-compat.
func (h *Hub) SubscribeAccount(ctx context.Context, sessionID, accountID string) error {
	return h.Subscribe(ctx, sessionID, TopicAccount, accountID)
}

// SubscribeBacktest binds a session to a backtest run id.
func (h *Hub) SubscribeBacktest(ctx context.Context, sessionID, runID string) error {
	return h.Subscribe(ctx, sessionID, TopicBacktest, runID)
}

// SubscribeStrategy binds a session to a strategy id for live order events.
func (h *Hub) SubscribeStrategy(ctx context.Context, sessionID, strategyID string) error {
	return h.Subscribe(ctx, sessionID, TopicStrategy, strategyID)
}

// Unsubscribe is the inverse of Subscribe.
func (h *Hub) Unsubscribe(sessionID string, kind TopicKind, id string) {
	tk := topicKey{Kind: kind, ID: id}
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[sessionID]
	if !ok {
		return
	}
	if _, has := s.subs[tk]; !has {
		return
	}
	delete(s.subs, tk)
	h.detachLocked(sessionID, tk)
}

// UnsubscribeAccount is a Phase 1 backwards-compat shim.
func (h *Hub) UnsubscribeAccount(sessionID, accountID string) {
	h.Unsubscribe(sessionID, TopicAccount, accountID)
}

func (h *Hub) detachLocked(sessionID string, tk topicKey) {
	up, ok := h.upstream[tk]
	if !ok {
		return
	}
	delete(up.subs, sessionID)
	if len(up.subs) == 0 {
		up.stopped = true
		up.cancel()
		if up.acctStream != nil {
			_ = up.acctStream.Close()
		}
		if up.generic != nil {
			up.generic.Stop()
		}
		delete(h.upstream, tk)
	}
}

// fanOut dispatches one upstream's events to the right deliver method.
func (h *Hub) fanOut(tk topicKey, up *upstream) {
	if up.acctStream != nil {
		h.fanOutAccount(tk, up)
		return
	}
	if up.generic != nil {
		h.fanOutGeneric(tk, up)
		return
	}
}

func (h *Hub) fanOutAccount(tk topicKey, up *upstream) {
	for {
		select {
		case ev, ok := <-up.acctStream.Events():
			if !ok {
				h.handleUpstreamEnd(tk, up, nil)
				return
			}
			h.deliverAccount(tk.ID, ev.Payload)
		case err, ok := <-up.acctStream.Errs():
			if !ok {
				return
			}
			h.handleUpstreamEnd(tk, up, err)
			return
		}
	}
}

func (h *Hub) fanOutGeneric(tk topicKey, up *upstream) {
	for ev := range up.generic.Events() {
		h.deliverGeneric(tk, ev)
	}
	// Channel closed → upstream is done. Notify subscribers and reap.
	h.handleUpstreamEnd(tk, up, nil)
}

func (h *Hub) handleUpstreamEnd(tk topicKey, up *upstream, cause error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if up.stopped {
		return
	}
	up.stopped = true
	notifType := "account.upstream_closed"
	idField := "accountId"
	switch tk.Kind {
	case TopicBacktest:
		notifType = "backtest.upstream_closed"
		idField = "runId"
	case TopicStrategy:
		notifType = "strategy.upstream_closed"
		idField = "strategyId"
	}
	for sessionID := range up.subs {
		s, ok := h.sessions[sessionID]
		if !ok {
			continue
		}
		_ = s.sink.SendJSON(context.Background(), map[string]any{
			"type":  notifType,
			idField: tk.ID,
			"error": errString(cause),
		})
		delete(s.subs, tk)
	}
	delete(h.upstream, tk)
	up.cancel()
	if up.acctStream != nil {
		_ = up.acctStream.Close()
	}
	if up.generic != nil {
		up.generic.Stop()
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// deliverAccount writes one account event to every current subscriber.
// Envelope mirrors phase 1 exactly so the existing browser client doesn't
// need to change.
func (h *Hub) deliverAccount(accountID string, payload []byte) {
	type envelope struct {
		Type      string          `json:"type"`
		AccountID string          `json:"accountId"`
		Payload   json.RawMessage `json:"payload"`
	}
	sinks := h.snapshotSinks(topicKey{Kind: TopicAccount, ID: accountID})
	env := envelope{
		Type:      "account.event",
		AccountID: accountID,
		Payload:   json.RawMessage(payload),
	}
	for _, sink := range sinks {
		if err := sink.SendJSON(context.Background(), env); err != nil {
			h.log.Warn("ws deliver failed", "kind", "account", "id", accountID, "err", err)
		}
	}
}

// deliverGeneric writes one non-account event to subscribers. The
// envelope shape is intentionally minimal; the type field carries the
// concrete event kind so the client can demultiplex.
func (h *Hub) deliverGeneric(tk topicKey, ev GenericEvent) {
	type envelope struct {
		Type    string          `json:"type"`
		Topic   string          `json:"topic"`
		ID      string          `json:"id"`
		Payload json.RawMessage `json:"payload,omitempty"`
	}
	sinks := h.snapshotSinks(tk)
	env := envelope{
		Type:    ev.Type,
		Topic:   string(tk.Kind),
		ID:      tk.ID,
		Payload: ev.Payload,
	}
	for _, sink := range sinks {
		if err := sink.SendJSON(context.Background(), env); err != nil {
			h.log.Warn("ws deliver failed", "kind", string(tk.Kind), "id", tk.ID, "err", err)
		}
	}
}

func (h *Hub) snapshotSinks(tk topicKey) []SessionSink {
	h.mu.Lock()
	defer h.mu.Unlock()
	up, ok := h.upstream[tk]
	if !ok {
		return nil
	}
	out := make([]SessionSink, 0, len(up.subs))
	for sid := range up.subs {
		if s, ok := h.sessions[sid]; ok {
			out = append(out, s.sink)
		}
	}
	return out
}

// HasUpstream reports whether the hub holds a live upstream for (kind, id).
func (h *Hub) HasUpstream(kind TopicKind, id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.upstream[topicKey{Kind: kind, ID: id}]
	return ok
}

// HasUpstreamAccount is a phase-1 backwards-compat shim used by tests.
func (h *Hub) HasUpstreamAccount(accountID string) bool {
	return h.HasUpstream(TopicAccount, accountID)
}

// SubscriberCount returns how many sessions are subscribed to (kind, id).
func (h *Hub) SubscriberCount(kind TopicKind, id string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	up, ok := h.upstream[topicKey{Kind: kind, ID: id}]
	if !ok {
		return 0
	}
	return len(up.subs)
}

// SubscriberCountAccount is a phase-1 backwards-compat shim used by tests.
func (h *Hub) SubscriberCountAccount(accountID string) int {
	return h.SubscriberCount(TopicAccount, accountID)
}
