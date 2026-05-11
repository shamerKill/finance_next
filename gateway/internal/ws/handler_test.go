package ws

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/coder/websocket"
	"github.com/finance_next/gateway/internal/exchange"
	"github.com/labstack/echo/v4"
)

// nilFactory is a placeholder UpstreamFactory the handler tests do not
// actually exercise — they only care about the Accept-time Origin check.
func nilFactory(_ context.Context, _ string) (exchange.UserDataStream, error) {
	return nil, nil
}

// TestWSHandler_DefaultAcceptsAnyOrigin pins the dev fallback: when no
// allowlist is wired the handler must keep InsecureSkipVerify behaviour
// so a developer running yarn dev on an arbitrary port still connects.
func TestWSHandler_DefaultAcceptsAnyOrigin(t *testing.T) {
	hub := NewHub(nilFactory, nil)
	h := NewHandler(hub, nil, nil) // nil allowlist == dev fallback

	e := echo.New()
	e.GET("/ws", h.Handle)
	srv := httptest.NewServer(e)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*1e9) // 2s
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"http://evil.example.com"}},
	})
	if err != nil {
		t.Fatalf("expected dev fallback to accept any origin, got dial err: %v", err)
	}
	_ = conn.Close(websocket.StatusNormalClosure, "test done")
}

// TestWSHandler_StrictRejectsForeignOrigin verifies that when an
// allowlist is configured the WS upgrade rejects a mismatched Origin
// with HTTP 403 (the response the underlying coder/websocket emits
// when OriginPatterns fails to match).
func TestWSHandler_StrictRejectsForeignOrigin(t *testing.T) {
	hub := NewHub(nilFactory, nil)
	h := NewHandler(hub, nil, []string{"http://localhost:3000"})

	e := echo.New()
	e.GET("/ws", h.Handle)
	srv := httptest.NewServer(e)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*1e9)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"http://evil.example.com"}},
	})
	if err == nil {
		t.Fatal("expected dial to fail for foreign origin")
	}
	if resp == nil {
		t.Fatal("expected HTTP response on failed handshake")
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 on foreign Origin, got %d", resp.StatusCode)
	}
}

// TestWSHandler_StrictAcceptsAllowedOrigin completes the matrix: an
// origin on the allowlist should successfully upgrade to a WS
// connection.
func TestWSHandler_StrictAcceptsAllowedOrigin(t *testing.T) {
	hub := NewHub(nilFactory, nil)
	h := NewHandler(hub, nil, []string{"http://localhost:3000"})

	e := echo.New()
	e.GET("/ws", h.Handle)
	srv := httptest.NewServer(e)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*1e9)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"http://localhost:3000"}},
	})
	if err != nil {
		t.Fatalf("allowed origin should connect, got: %v", err)
	}
	_ = conn.Close(websocket.StatusNormalClosure, "test done")
}

// TestOriginPatternsFromURLs ensures the URL→host extraction handles
// the common shapes operators will put in ALLOWED_ORIGINS: scheme+host,
// scheme+host:port, and bare host strings (pass-through fallback).
func TestOriginPatternsFromURLs(t *testing.T) {
	cases := []struct {
		in   []string
		want []string
	}{
		{nil, nil},
		{[]string{}, nil},
		{[]string{"http://localhost:3000"}, []string{"localhost:3000"}},
		{[]string{"https://app.example.com"}, []string{"app.example.com"}},
		{
			[]string{"http://localhost:3000", "https://app.example.com"},
			[]string{"localhost:3000", "app.example.com"},
		},
		// Bare host: pass through so an operator who already gave a
		// host pattern is not silently broken.
		{[]string{"app.example.com"}, []string{"app.example.com"}},
	}
	for _, c := range cases {
		got := originPatternsFromURLs(c.in)
		if !equalStringSlices(got, c.want) {
			t.Errorf("originPatternsFromURLs(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
