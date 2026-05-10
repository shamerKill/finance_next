package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

// All Phase 8 read endpoints share the same store-nil/503 + register-only
// scaffolding tests; we don't spin up a real Timescale here. Real-data
// integration is covered by the offline asyncpg pool tests in the quant
// suite + a manual smoke against docker-compose.

func TestDataExplorer_HiddenAdminWithoutKey(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	// Empty adminKey + nil redis → admin routes shouldn't even be registered.
	NewDataExplorerHandler(nil, nil, "" /* adminKey */).Register(g)

	for _, kind := range []string{"equities", "futures", "macro", "onchain", "news"} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/ingest/"+kind, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 admin/ingest/%s when admin key unset, got %d (body=%s)", kind, rec.Code, rec.Body.String())
		}
	}
}

func TestDataExplorer_ReadEndpoints503WhenStoreNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewDataExplorerHandler(nil, nil, "" /* admin disabled */).Register(g)

	cases := []struct {
		path string
	}{
		{"/api/v1/equities/ohlcv?exchange=nasdaq&symbol=AAPL.nasdaq&timeframe=1d&start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z"},
		{"/api/v1/futures/ohlcv?exchange=shfe&contract=cu2412&timeframe=1d&start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z"},
		{"/api/v1/macro/indicators?source=fred&code=CPIAUCSL"},
		{"/api/v1/onchain/metrics?chain=btc&metric=hash_rate"},
		{"/api/v1/news?limit=10"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("path %s: expected 503 when store nil, got %d", c.path, rec.Code)
		}
	}
}

func TestDataExplorer_AdminIngestRequiresHeader(t *testing.T) {
	// Admin key is set but no redis client; the handler short-circuits at
	// auth before checking redis, so unauthorised must still return 401.
	e := echo.New()
	g := e.Group("/api/v1")
	NewDataExplorerHandler(nil, nil, "secret").Register(g)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/ingest/news", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without admin header, got %d", rec.Code)
	}
}

func TestDataExplorer_NewsParsesSymbolsCSV(t *testing.T) {
	// Hitting the handler with store=nil yields 503 fast; this test only
	// ensures the route is registered and the query parsing doesn't panic
	// on multiple symbols.
	e := echo.New()
	g := e.Group("/api/v1")
	NewDataExplorerHandler(nil, nil, "").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/news?symbols=BTC,ETH,SOL&limit=5", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (store nil) but with a parseable query, got %d", rec.Code)
	}
}
