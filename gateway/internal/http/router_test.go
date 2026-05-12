package http

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/observability"
)

// TestCORS_DefaultAllowsLocalhost pins the dev-friendly fallback. When
// no ALLOWED_ORIGINS allowlist is wired through Deps, the CORS layer
// MUST default to http://localhost:3000 (the Next.js dev server origin)
// rather than "*" — Phase 1.A.3 added cookie-based auth, and per the
// CORS spec `Access-Control-Allow-Credentials: true` is mutually
// exclusive with the "*" wildcard. We also verify Allow-Credentials is
// set and that a foreign origin gets no Allow-Origin echo.
func TestCORS_DefaultAllowsLocalhost(t *testing.T) {
	e := NewRouter(Deps{})

	// Allowed dev origin → echoed back, credentials true.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("OPTIONS", "/api/v1/admin/halt", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "x-admin-key,content-type,x-user-id")
	e.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("expected Access-Control-Allow-Origin=http://localhost:3000, got %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("expected Access-Control-Allow-Credentials=true, got %q", got)
	}
	allowHdrs := strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers"))
	for _, want := range []string{"x-admin-key", "x-user-id", "content-type"} {
		if !strings.Contains(allowHdrs, want) {
			t.Errorf("expected %q in Access-Control-Allow-Headers, got %q", want, allowHdrs)
		}
	}

	// Foreign origin (no ALLOWED_ORIGINS configured but still not on the
	// implicit dev allowlist) → no echo.
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("OPTIONS", "/api/v1/admin/halt", nil)
	req2.Header.Set("Origin", "http://evil.example.com")
	req2.Header.Set("Access-Control-Request-Method", "POST")
	req2.Header.Set("Access-Control-Request-Headers", "x-admin-key")
	e.ServeHTTP(rec2, req2)
	got := rec2.Header().Get("Access-Control-Allow-Origin")
	if got == "*" || got == "http://evil.example.com" {
		t.Errorf("foreign origin must not be authorized; got Access-Control-Allow-Origin=%q", got)
	}
}

// TestCORS_StrictAllowlistRejectsForeignOrigin verifies that when an
// allowlist is configured, a request whose Origin is NOT on the list
// receives an empty (or non-matching) Access-Control-Allow-Origin
// header — the browser will then refuse the response. echo's CORS
// middleware omits the header entirely for disallowed origins.
func TestCORS_StrictAllowlistRejectsForeignOrigin(t *testing.T) {
	e := NewRouter(Deps{
		AllowedOrigins: []string{"http://localhost:3000"},
	})

	// Allowed origin → echoed back verbatim.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("OPTIONS", "/api/v1/admin/halt", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "x-admin-key")
	e.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("allowed origin: expected echo, got %q", got)
	}

	// Foreign origin → header MUST NOT contain the foreign origin (and
	// must not be "*" — that's the dev fallback we just disabled).
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("OPTIONS", "/api/v1/admin/halt", nil)
	req2.Header.Set("Origin", "http://evil.example.com")
	req2.Header.Set("Access-Control-Request-Method", "POST")
	req2.Header.Set("Access-Control-Request-Headers", "x-admin-key")
	e.ServeHTTP(rec2, req2)
	got := rec2.Header().Get("Access-Control-Allow-Origin")
	if got == "*" || got == "http://evil.example.com" {
		t.Errorf("foreign origin must not be authorized; got Access-Control-Allow-Origin=%q", got)
	}
}

// TestMetricsEndpoint_ExposesGrafanaDashboardMetrics verifies the
// /metrics endpoint exposes every metric name referenced by the
// dashboards under infra/grafana/dashboards/. A missing name here
// would cause an empty Grafana panel in production.
func TestMetricsEndpoint_ExposesGrafanaDashboardMetrics(t *testing.T) {
	reg := observability.NewRegistry()
	e := NewRouter(Deps{Metrics: reg})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/metrics", nil)
	e.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	out := string(body)

	for _, want := range []string{
		"gateway_http_request_duration_seconds",
		"gateway_mongo_op_duration_seconds",
		"gateway_order_engine_queue_depth",
		"gateway_audit_dropped_total",
		"gateway_exchange_api_errors_total",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("dashboard metric %q missing from /metrics output", want)
		}
	}
	// Per-venue exchange labels referenced by `sum by(exchange)` panels.
	for _, ex := range []string{"binance", "okx", "bybit"} {
		needle := `gateway_exchange_api_errors_total{exchange="` + ex + `"}`
		if !strings.Contains(out, needle) {
			t.Errorf("exchange label series %q missing", needle)
		}
	}
	// Content-type per Prometheus exposition format 0.0.4.
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/plain") {
		t.Errorf("expected text/plain content type, got %q", ct)
	}
}

// TestHealthz_DepsReportDisabledWhenNotWired pins Node 4.F.1 — /healthz
// always returns 200 (liveness), and the deps block surfaces the four
// downstreams (mongo / redis / timescale / quant) as "disabled" when
// Deps doesn't wire them. Status field stays "ok" to preserve the
// existing healthcheck contract.
func TestHealthz_DepsReportDisabledWhenNotWired(t *testing.T) {
	e := NewRouter(Deps{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/healthz", nil)
	e.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Status string                       `json:"status"`
		Deps   map[string]map[string]any    `json:"deps"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode /healthz body: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("expected status=ok (liveness), got %q", body.Status)
	}
	for _, dep := range []string{"mongo", "redis", "timescale", "quant"} {
		entry, ok := body.Deps[dep]
		if !ok {
			t.Errorf("deps missing %q", dep)
			continue
		}
		if entry["status"] != "disabled" {
			t.Errorf("dep %q expected status=disabled, got %v", dep, entry["status"])
		}
	}
}
