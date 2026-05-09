package http

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/observability"
)

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
