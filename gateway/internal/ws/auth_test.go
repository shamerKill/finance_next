// auth_test.go — Phase 1.A.4 WS auth + per-subscription ownership.
//
// We don't pull the real JWT signer into these tests — the handler
// accepts an AuthVerifier closure, so the test stub treats the cookie
// value verbatim as a token and decodes a few well-known strings into
// claims. That keeps these tests fast, offline, and decoupled from
// the handlers package (which would otherwise re-introduce the import
// cycle the production wiring carefully avoids).
package ws

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/finance_next/gateway/internal/exchange"
	"github.com/labstack/echo/v4"
)

// stubVerifier maps fixed cookie values to (userID, role) claims. Any
// other value returns an "invalid token" error so the handler can't
// upgrade. Mirrors what handlers.ParseJWT would yield for real tokens.
func stubVerifier(r *http.Request) (string, string, error) {
	c, err := r.Cookie("auth_token")
	if err != nil || c == nil || c.Value == "" {
		return "", "", errors.New("missing cookie")
	}
	switch c.Value {
	case "tok-user-alice":
		return "alice", "user", nil
	case "tok-user-bob":
		return "bob", "user", nil
	case "tok-admin":
		return "ops", AdminRole, nil
	case "tok-expired":
		return "", "", errors.New("token expired")
	default:
		return "", "", errors.New("invalid token")
	}
}

// dialOpts builds a websocket.DialOptions seeded with an auth_token
// cookie (when value is non-empty) so the test can drive the
// pre-upgrade auth path. Origin is set to a stable string because some
// clients (and proxies) refuse to dial without one — coder/websocket
// in dev mode (InsecureSkipVerify) doesn't care which.
func dialOpts(cookieValue string) *websocket.DialOptions {
	hdr := http.Header{}
	if cookieValue != "" {
		hdr.Set("Cookie", "auth_token="+cookieValue)
	}
	return &websocket.DialOptions{HTTPHeader: hdr}
}

// newHandlerForAuthTest spins up an Echo server with a Hub + Handler
// wired with the stub verifier. Resolvers are populated by the
// caller via `setResolvers` so each test case can pick the owners
// it cares about without leaking state across tests.
func newHandlerForAuthTest(t *testing.T, setResolvers func(*Hub)) (*httptest.Server, *Hub) {
	t.Helper()
	// Provide a no-op account factory so subscribe(account) doesn't
	// fail on the upstream-not-configured check (it's irrelevant to
	// the ownership question we're exercising).
	acctFactory := func(_ context.Context, _ string) (exchange.UserDataStream, error) {
		return &nopStream{events: make(chan exchange.UserDataEvent), errs: make(chan error)}, nil
	}
	hub := NewHub(acctFactory, nil)
	if setResolvers != nil {
		setResolvers(hub)
	}
	h := NewHandlerWithAuth(hub, nil, nil, stubVerifier)
	e := echo.New()
	e.GET("/ws", h.Handle)
	srv := httptest.NewServer(e)
	t.Cleanup(srv.Close)
	return srv, hub
}

// nopStream is a placeholder exchange.UserDataStream used purely so the
// account-topic subscribe path doesn't trip the "factory not configured"
// guard during ownership tests.
type nopStream struct {
	events chan exchange.UserDataEvent
	errs   chan error
}

func (n *nopStream) Events() <-chan exchange.UserDataEvent { return n.events }
func (n *nopStream) Errs() <-chan error                    { return n.errs }
func (n *nopStream) Close() error {
	close(n.events)
	close(n.errs)
	return nil
}

func wsURL(srv *httptest.Server) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
}

// ---- Upgrade-time auth tests ---------------------------------------

func TestWS_NoCookie_Rejected(t *testing.T) {
	srv, _ := newHandlerForAuthTest(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, wsURL(srv), dialOpts(""))
	if err == nil {
		t.Fatal("expected dial to fail without cookie")
	}
	if resp == nil {
		t.Fatal("expected HTTP response on failed handshake")
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestWS_ValidCookie_Upgrades(t *testing.T) {
	srv, _ := newHandlerForAuthTest(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL(srv), dialOpts("tok-user-alice"))
	if err != nil {
		t.Fatalf("valid cookie should upgrade: %v", err)
	}
	_ = conn.Close(websocket.StatusNormalClosure, "test done")
}

func TestWS_TamperedCookie_Rejected(t *testing.T) {
	srv, _ := newHandlerForAuthTest(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, wsURL(srv), dialOpts("not-a-valid-token"))
	if err == nil {
		t.Fatal("expected dial to fail with tampered cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %v", resp)
	}
}

func TestWS_ExpiredCookie_Rejected(t *testing.T) {
	srv, _ := newHandlerForAuthTest(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, wsURL(srv), dialOpts("tok-expired"))
	if err == nil {
		t.Fatal("expected dial to fail with expired cookie")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %v", resp)
	}
}

// ---- Ownership tests -----------------------------------------------

// subscribeAndReadOne dials, sends a subscribe frame, then reads exactly
// one frame back (the server response). The frame is decoded into a
// map for assertion. Returns the frame + the connection so the caller
// can close it.
func subscribeAndReadOne(t *testing.T, srv *httptest.Server, cookie, topic, id string) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL(srv), dialOpts(cookie))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "test done")

	frame := map[string]any{"type": "subscribe", "topic": topic, "id": id}
	payload, _ := json.Marshal(frame)
	if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write subscribe: %v", err)
	}

	// Set a read deadline so a silent server doesn't hang the test.
	readCtx, readCancel := context.WithTimeout(ctx, 2*time.Second)
	defer readCancel()
	_, data, err := conn.Read(readCtx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("decode frame: %v", err)
	}
	return got
}

func TestWS_Subscribe_DeniesForeignStrategy(t *testing.T) {
	srv, _ := newHandlerForAuthTest(t, func(h *Hub) {
		h.SetOwnerResolver(TopicStrategy, OwnerResolverFunc(func(_ context.Context, id string) (string, error) {
			if id == "strat-alice" {
				return "alice", nil
			}
			return "", nil
		}))
	})

	got := subscribeAndReadOne(t, srv, "tok-user-bob", "strategy", "strat-alice")
	if got["type"] != "error" {
		t.Fatalf("expected error frame, got %+v", got)
	}
	if got["error"] != "forbidden" {
		t.Errorf("expected error=forbidden, got %v", got["error"])
	}
}

func TestWS_Subscribe_AdminBypasses(t *testing.T) {
	srv, hub := newHandlerForAuthTest(t, func(h *Hub) {
		h.SetOwnerResolver(TopicStrategy, OwnerResolverFunc(func(_ context.Context, id string) (string, error) {
			return "alice", nil
		}))
	})

	// Admin subscribing to alice's strategy succeeds — there's no
	// generic factory wired, so the hub will return an "upstream
	// factory not configured" error, which the test interprets as
	// "ownership check passed, infra not wired" (different from the
	// forbidden case). We pick a strategy id that the resolver maps
	// to "alice"; admin role bypasses the userID match.
	got := subscribeAndReadOne(t, srv, "tok-admin", "strategy", "any-strategy-id")
	// Admin passed ownership — the next failure is upstream config.
	if got["error"] == "forbidden" {
		t.Errorf("admin should bypass ownership, got forbidden")
	}
	// Sanity check: no live upstream for this id.
	if hub.SubscriberCount(TopicStrategy, "any-strategy-id") != 0 {
		t.Errorf("expected no subscriber count after upstream failure")
	}
}

func TestWS_Subscribe_OwnerAllowed(t *testing.T) {
	srv, hub := newHandlerForAuthTest(t, func(h *Hub) {
		h.SetOwnerResolver(TopicAccount, OwnerResolverFunc(func(_ context.Context, id string) (string, error) {
			if id == "acct-alice" {
				return "alice", nil
			}
			return "", nil
		}))
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL(srv), dialOpts("tok-user-alice"))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "test done")

	frame := map[string]any{"type": "subscribe", "topic": "account", "id": "acct-alice"}
	payload, _ := json.Marshal(frame)
	if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write: %v", err)
	}

	// We expect the subscribe to succeed silently (no immediate frame
	// — the upstream is a nopStream). Poll the hub for the subscriber
	// count to confirm the binding landed.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if hub.SubscriberCount(TopicAccount, "acct-alice") == 1 {
			return // success
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("expected subscriber count = 1 for alice's own account")
}

func TestWS_Subscribe_NoResolver_LegacyPassthrough(t *testing.T) {
	// Hub with no resolvers registered — Subscribe falls through to
	// the legacy no-check path (back-compat for pre-auth tests). With
	// no generic factory wired the server returns an "upstream factory
	// not configured" error rather than "forbidden". This pins the
	// fallback semantics so a future tightening (fail-closed default)
	// is an explicit, audited change.
	srv, _ := newHandlerForAuthTest(t, nil)

	got := subscribeAndReadOne(t, srv, "tok-user-alice", "strategy", "any")
	if got["error"] == "forbidden" {
		t.Errorf("expected no-resolver path to fall through to upstream config, got forbidden")
	}
}
