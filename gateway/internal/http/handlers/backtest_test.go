// backtest_test.go — httptest-driven coverage for /api/v1/backtests.
//
// Mongo and Timescale are intentionally NOT mocked end-to-end; the
// repository/store types are pointer-receivers on the real (pgx/mongo)
// libraries. We only verify the gRPC pass-through path (POST), the 503
// short-circuits, and basic shape of the not-configured guards.

package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func newBacktestEcho(quant *fakeQuant) *echo.Echo {
	e := echo.New()
	g := e.Group("/api/v1")
	NewBacktestHandler(nil, nil, quant).Register(g)
	return e
}

func TestPostBacktest_503WhenQuantNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewBacktestHandler(nil, nil, nil).Register(g)

	body := `{"strategyId":"x","symbol":"BTCUSDT","exchange":"binance","timeframe":"1h","start":"2024-01-01T00:00:00Z","end":"2024-01-02T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtests", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when quant client missing, got %d", rec.Code)
	}
}

func TestPostBacktest_HappyPath(t *testing.T) {
	fq := &fakeQuant{}
	e := newBacktestEcho(fq)

	body := `{
        "strategyId": "strat-1",
        "kind": "grid_dca",
        "params": {"stopProfitRate": 0.03, "stopLossRate": 0.1},
        "symbol": "BTCUSDT",
        "exchange": "binance",
        "timeframe": "1h",
        "start": "2024-01-01T00:00:00Z",
        "end":   "2024-01-31T00:00:00Z",
        "initialCapital": 10000,
        "commissionRate": 0.0004,
        "slippageBps": 1
    }`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtests", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	if fq.backtestCalls != 1 {
		t.Fatalf("expected 1 RunBacktest call, got %d", fq.backtestCalls)
	}
	if !strings.Contains(rec.Body.String(), `"runId":"test-run"`) {
		t.Fatalf("response missing runId, body=%s", rec.Body.String())
	}
	if fq.backtestRequest == nil {
		t.Fatal("backtestRequest should be captured")
	}
	if fq.backtestRequest.GetKind() != "grid_dca" {
		t.Errorf("kind passthrough wrong: %q", fq.backtestRequest.GetKind())
	}
	if fq.backtestRequest.GetParams() == nil || fq.backtestRequest.GetParams().Fields == nil {
		t.Errorf("params not propagated to gRPC request")
	}
	if fq.backtestRequest.GetInitialCapital() != 10000 {
		t.Errorf("initialCapital passthrough wrong: %v", fq.backtestRequest.GetInitialCapital())
	}
}

func TestPostBacktest_RejectsBadTimeframe(t *testing.T) {
	e := newBacktestEcho(&fakeQuant{})
	body := `{"strategyId":"x","symbol":"BTCUSDT","exchange":"binance","timeframe":"42m","start":"2024-01-01T00:00:00Z","end":"2024-01-02T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtests", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestPostBacktest_RejectsInvertedRange(t *testing.T) {
	e := newBacktestEcho(&fakeQuant{})
	body := `{"strategyId":"x","symbol":"BTCUSDT","exchange":"binance","timeframe":"1h","start":"2024-02-01T00:00:00Z","end":"2024-01-01T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtests", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListBacktests_503WhenRepoNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewBacktestHandler(nil, nil, &fakeQuant{}).Register(g)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backtests", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
}

func TestEquity_503WhenStoreNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewBacktestHandler(nil, nil, &fakeQuant{}).Register(g)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backtests/abc/equity", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
}
