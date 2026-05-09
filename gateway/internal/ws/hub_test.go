package ws

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/exchange"
)

// fakeStream is an in-memory exchange.UserDataStream for hub tests.
type fakeStream struct {
	events    chan exchange.UserDataEvent
	errs      chan error
	closed    bool
	chanClose bool // true when test explicitly closed the underlying channels
	mu        sync.Mutex
}

func newFakeStream() *fakeStream {
	return &fakeStream{
		events: make(chan exchange.UserDataEvent, 16),
		errs:   make(chan error, 1),
	}
}

func (f *fakeStream) Events() <-chan exchange.UserDataEvent { return f.events }
func (f *fakeStream) Errs() <-chan error                    { return f.errs }
func (f *fakeStream) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.closed {
		return nil
	}
	f.closed = true
	if !f.chanClose {
		close(f.events)
		close(f.errs)
	}
	return nil
}
// markChannelsClosedExternally tells Close to skip closing the channels (the
// test already did).
func (f *fakeStream) markChannelsClosedExternally() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.chanClose = true
}
func (f *fakeStream) wasClosed() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closed
}

// fakeSink captures envelopes the hub pushes to a session.
type fakeSink struct {
	mu  sync.Mutex
	got []map[string]any
}

func (f *fakeSink) SendJSON(_ context.Context, v any) error {
	bs, err := json.Marshal(v)
	if err != nil {
		return err
	}
	var m map[string]any
	if err := json.Unmarshal(bs, &m); err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got = append(f.got, m)
	return nil
}

func (f *fakeSink) snapshot() []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]map[string]any, len(f.got))
	copy(out, f.got)
	return out
}

func waitFor(t *testing.T, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", msg)
}

func TestSubscribeStartsUpstreamLazily(t *testing.T) {
	stream := newFakeStream()
	factoryCalls := 0
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		factoryCalls++
		return stream, nil
	}, nil)

	sink := &fakeSink{}
	hub.Register("sess1", sink)

	if hub.HasUpstream("acct-A") {
		t.Fatal("expected no upstream before subscribe")
	}
	if err := hub.Subscribe(context.Background(), "sess1", "acct-A"); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	if factoryCalls != 1 {
		t.Errorf("expected 1 factory call, got %d", factoryCalls)
	}
	if !hub.HasUpstream("acct-A") {
		t.Fatal("expected upstream to be live after subscribe")
	}

	// Subscribing again should be idempotent and not start a second upstream.
	if err := hub.Subscribe(context.Background(), "sess1", "acct-A"); err != nil {
		t.Fatalf("Subscribe (re): %v", err)
	}
	if factoryCalls != 1 {
		t.Errorf("expected idempotent subscribe; got %d factory calls", factoryCalls)
	}
}

func TestFanOutDeliversToSubscribedSessions(t *testing.T) {
	stream := newFakeStream()
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		return stream, nil
	}, nil)

	sinkA, sinkB, sinkC := &fakeSink{}, &fakeSink{}, &fakeSink{}
	hub.Register("A", sinkA)
	hub.Register("B", sinkB)
	hub.Register("C", sinkC)
	if err := hub.Subscribe(context.Background(), "A", "acct-1"); err != nil {
		t.Fatalf("subscribe A: %v", err)
	}
	if err := hub.Subscribe(context.Background(), "B", "acct-1"); err != nil {
		t.Fatalf("subscribe B: %v", err)
	}
	// C does NOT subscribe to acct-1.

	stream.events <- exchange.UserDataEvent{Payload: []byte(`{"e":"executionReport"}`)}
	waitFor(t, func() bool { return len(sinkA.snapshot()) == 1 && len(sinkB.snapshot()) == 1 }, "fan-out to A and B")

	if got := len(sinkC.snapshot()); got != 0 {
		t.Errorf("non-subscriber C received %d events, want 0", got)
	}

	got := sinkA.snapshot()[0]
	if got["type"] != "account.event" {
		t.Errorf("envelope type = %v, want account.event", got["type"])
	}
	if got["accountId"] != "acct-1" {
		t.Errorf("accountId = %v, want acct-1", got["accountId"])
	}
}

func TestUnsubscribeStopsUpstreamWhenLastLeaves(t *testing.T) {
	stream := newFakeStream()
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		return stream, nil
	}, nil)
	hub.Register("A", &fakeSink{})
	hub.Register("B", &fakeSink{})
	if err := hub.Subscribe(context.Background(), "A", "acct-1"); err != nil {
		t.Fatal(err)
	}
	if err := hub.Subscribe(context.Background(), "B", "acct-1"); err != nil {
		t.Fatal(err)
	}

	hub.Unsubscribe("A", "acct-1")
	if !hub.HasUpstream("acct-1") {
		t.Fatal("upstream should still be live (B is subscribed)")
	}
	if hub.SubscriberCount("acct-1") != 1 {
		t.Errorf("expected 1 subscriber, got %d", hub.SubscriberCount("acct-1"))
	}

	hub.Unsubscribe("B", "acct-1")
	if hub.HasUpstream("acct-1") {
		t.Fatal("upstream should be torn down after last unsubscribe")
	}
	if !stream.wasClosed() {
		t.Fatal("stream should have been Close()d")
	}
}

func TestUnregisterDetachesAllSubs(t *testing.T) {
	stream1, stream2 := newFakeStream(), newFakeStream()
	streams := map[string]*fakeStream{"acct-1": stream1, "acct-2": stream2}
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		return streams[accountID], nil
	}, nil)
	hub.Register("A", &fakeSink{})
	if err := hub.Subscribe(context.Background(), "A", "acct-1"); err != nil {
		t.Fatal(err)
	}
	if err := hub.Subscribe(context.Background(), "A", "acct-2"); err != nil {
		t.Fatal(err)
	}
	hub.Unregister("A")
	if hub.HasUpstream("acct-1") || hub.HasUpstream("acct-2") {
		t.Fatal("unregister should tear down all subscribed upstreams")
	}
}

func TestUpstreamErrorNotifiesSubscribers(t *testing.T) {
	stream := newFakeStream()
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		return stream, nil
	}, nil)
	sink := &fakeSink{}
	hub.Register("S", sink)
	if err := hub.Subscribe(context.Background(), "S", "acct-1"); err != nil {
		t.Fatal(err)
	}

	stream.errs <- errors.New("upstream went bye-bye")
	stream.markChannelsClosedExternally()
	close(stream.errs)
	close(stream.events)
	waitFor(t, func() bool {
		for _, m := range sink.snapshot() {
			if m["type"] == "account.upstream_closed" {
				return true
			}
		}
		return false
	}, "upstream_closed envelope")

	if hub.HasUpstream("acct-1") {
		t.Fatal("upstream should be reaped after error")
	}
}

func TestSubscribeUnknownSession(t *testing.T) {
	hub := NewHub(func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		t.Fatal("factory should not be called for unknown session")
		return nil, nil
	}, nil)
	if err := hub.Subscribe(context.Background(), "ghost", "acct"); err == nil {
		t.Fatal("expected error for unknown session id")
	}
}
