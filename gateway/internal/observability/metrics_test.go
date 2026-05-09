package observability

import (
	"bytes"
	"regexp"
	"strings"
	"testing"
)

// TestPrometheusExposition_HelpTypeAndCounts verifies that WriteText
// emits the textual exposition format Prometheus expects: every metric
// has matching `# HELP` + `# TYPE` lines, histograms emit
// `_bucket{le="..."}`, `_sum`, `_count`, and counters report integer
// values without trailing whitespace.
func TestPrometheusExposition_HelpTypeAndCounts(t *testing.T) {
	r := NewRegistry()
	c := r.Counter(CounterOpts{Name: "foo_calls_total", Help: "Total foo calls."})
	c.Inc()
	c.Inc()
	g := r.Gauge(GaugeOpts{Name: "foo_inflight", Help: "Inflight foo."})
	g.Set(3)
	h := r.Histogram(HistogramOpts{
		Name:    "foo_latency_seconds",
		Help:    "Foo latency.",
		Buckets: []float64{0.1, 0.5, 1},
	})
	h.Observe(0.05)
	h.Observe(0.4)
	h.Observe(2)

	var buf bytes.Buffer
	if err := r.WriteText(&buf); err != nil {
		t.Fatalf("WriteText: %v", err)
	}
	out := buf.String()

	// Each metric needs HELP + TYPE.
	for _, want := range []string{
		"# HELP foo_calls_total Total foo calls.",
		"# TYPE foo_calls_total counter",
		"# HELP foo_inflight Inflight foo.",
		"# TYPE foo_inflight gauge",
		"# HELP foo_latency_seconds Foo latency.",
		"# TYPE foo_latency_seconds histogram",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}

	// Counter value.
	if !strings.Contains(out, "foo_calls_total 2\n") {
		t.Errorf("counter value not exposed:\n%s", out)
	}

	// Histogram bucket lines.
	for _, want := range []string{
		`foo_latency_seconds_bucket{le="0.1"} 1`,
		`foo_latency_seconds_bucket{le="0.5"} 2`,
		`foo_latency_seconds_bucket{le="1"} 2`,
		`foo_latency_seconds_bucket{le="+Inf"} 3`,
		"foo_latency_seconds_sum ",
		"foo_latency_seconds_count 3",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing histogram line %q in:\n%s", want, out)
		}
	}

	// No tab characters or carriage returns — Prometheus exposition is
	// strictly LF.
	if strings.ContainsAny(out, "\t\r") {
		t.Errorf("exposition output contains tab or CR:\n%q", out)
	}

	// Each non-comment line must end with a newline.
	for _, line := range strings.Split(strings.TrimRight(out, "\n"), "\n") {
		if line == "" {
			continue
		}
		// Match either comment or sample.
		if !strings.HasPrefix(line, "#") {
			// A sample line must have the form `name[{labels}] value`.
			re := regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\{[^}]*\})? [-+]?[0-9.eE+]+$`)
			if !re.MatchString(line) {
				t.Errorf("malformed sample line: %q", line)
			}
		}
	}
}

// TestLabelsEscapedAndSorted ensures label encoding follows the
// exposition format: keys sorted alphabetically, values quoted.
func TestLabelsEscapedAndSorted(t *testing.T) {
	r := NewRegistry()
	c := r.Counter(CounterOpts{
		Name:   "errors_total",
		Help:   "Errors.",
		Labels: map[string]string{"venue": "binance", "code": "429"},
	})
	c.Inc()
	var buf bytes.Buffer
	_ = r.WriteText(&buf)
	out := buf.String()
	if !strings.Contains(out, `errors_total{code="429",venue="binance"} 1`) {
		t.Errorf("labels not sorted/quoted: %s", out)
	}
}
