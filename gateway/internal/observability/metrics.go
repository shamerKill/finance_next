// Package observability — Phase 7 in-process Prometheus exporter +
// stdout OpenTelemetry trace exporter wiring.
//
// We deliberately avoid pulling the prometheus/client_golang dependency
// to keep the gateway's module graph small; the metrics types here are
// minimal but emit standard Prometheus exposition format ("text/plain"
// version 0.0.4). The set of metrics is just what Phase 7 deliverables
// require — http duration, mongo op duration, exchange API latency,
// order engine queue depth, and audit buffer drop count.
//
// To swap to the official client without a behaviour change:
//
//  1. Replace the [Counter] / [Histogram] types with their prometheus.*
//     equivalents.
//  2. Replace WriteText with promhttp.Handler().
//
// Tracer registration uses the noop.Tracer in tests; production wires
// the OTel SDK to a stdout exporter unless OTEL_EXPORTER_OTLP_ENDPOINT
// is set (see [InitTracer]). We default to stdout to avoid surprise
// data egress.
package observability

import (
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
)

// Registry is the in-process collection of metrics. Construct one per
// process via [NewRegistry] and pass it to handlers / engine via DI.
type Registry struct {
	mu         sync.RWMutex
	counters   map[string]*Counter
	histograms map[string]*Histogram
	gauges     map[string]*Gauge
}

// NewRegistry builds an empty registry.
func NewRegistry() *Registry {
	return &Registry{
		counters:   map[string]*Counter{},
		histograms: map[string]*Histogram{},
		gauges:     map[string]*Gauge{},
	}
}

// Counter is a monotonically-increasing float64 with optional labels.
// Labels are encoded into the metric line at write time; we don't yet
// support arbitrary cardinality (each label combo is a separate
// counter), so callers must use a small finite label set.
type Counter struct {
	name   string
	help   string
	labels map[string]string
	value  uint64 // we store as integer ticks of 1; cast on read
}

// Inc increments by 1.
func (c *Counter) Inc() { atomic.AddUint64(&c.value, 1) }

// Add increments by n (n >= 0).
func (c *Counter) Add(n uint64) { atomic.AddUint64(&c.value, n) }

// Value returns the current count.
func (c *Counter) Value() uint64 { return atomic.LoadUint64(&c.value) }

// CounterOpts configures a counter at registration.
type CounterOpts struct {
	Name   string
	Help   string
	Labels map[string]string // label_name -> label_value
}

// Counter looks up or creates a counter by (name, labels).
func (r *Registry) Counter(opts CounterOpts) *Counter {
	key := metricKey(opts.Name, opts.Labels)
	r.mu.RLock()
	if c, ok := r.counters[key]; ok {
		r.mu.RUnlock()
		return c
	}
	r.mu.RUnlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	if c, ok := r.counters[key]; ok {
		return c
	}
	c := &Counter{name: opts.Name, help: opts.Help, labels: copyLabels(opts.Labels)}
	r.counters[key] = c
	return c
}

// Gauge is a value that can go up or down (queue depth etc).
type Gauge struct {
	name   string
	help   string
	labels map[string]string
	mu     sync.RWMutex
	value  float64
}

// Set replaces the gauge value.
func (g *Gauge) Set(v float64) {
	g.mu.Lock()
	g.value = v
	g.mu.Unlock()
}

// Value returns the current gauge value.
func (g *Gauge) Value() float64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.value
}

// GaugeOpts mirrors CounterOpts.
type GaugeOpts struct {
	Name   string
	Help   string
	Labels map[string]string
}

// Gauge looks up or creates a gauge.
func (r *Registry) Gauge(opts GaugeOpts) *Gauge {
	key := metricKey(opts.Name, opts.Labels)
	r.mu.RLock()
	if g, ok := r.gauges[key]; ok {
		r.mu.RUnlock()
		return g
	}
	r.mu.RUnlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	if g, ok := r.gauges[key]; ok {
		return g
	}
	g := &Gauge{name: opts.Name, help: opts.Help, labels: copyLabels(opts.Labels)}
	r.gauges[key] = g
	return g
}

// Histogram tracks float64 observations in a fixed bucket layout.
// Labels work the same way as Counter.
type Histogram struct {
	name    string
	help    string
	labels  map[string]string
	buckets []float64
	mu      sync.Mutex
	counts  []uint64
	sum     float64
	total   uint64
}

// HistogramOpts configures a histogram.
type HistogramOpts struct {
	Name    string
	Help    string
	Labels  map[string]string
	Buckets []float64 // upper bounds; +Inf is implicit. Sorted ascending.
}

// DefaultHTTPBuckets is a sensible bucket layout for HTTP request
// duration in seconds.
var DefaultHTTPBuckets = []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

// Histogram looks up or creates a histogram.
func (r *Registry) Histogram(opts HistogramOpts) *Histogram {
	if len(opts.Buckets) == 0 {
		opts.Buckets = DefaultHTTPBuckets
	}
	key := metricKey(opts.Name, opts.Labels)
	r.mu.RLock()
	if h, ok := r.histograms[key]; ok {
		r.mu.RUnlock()
		return h
	}
	r.mu.RUnlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	if h, ok := r.histograms[key]; ok {
		return h
	}
	h := &Histogram{
		name:    opts.Name,
		help:    opts.Help,
		labels:  copyLabels(opts.Labels),
		buckets: append([]float64{}, opts.Buckets...),
		counts:  make([]uint64, len(opts.Buckets)),
	}
	r.histograms[key] = h
	return h
}

// Observe records v (typically duration in seconds).
func (h *Histogram) Observe(v float64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.total++
	h.sum += v
	for i, ub := range h.buckets {
		if v <= ub {
			h.counts[i]++
		}
	}
}

// WriteText writes Prometheus exposition format to w. The output is
// stable: metrics emitted in alphabetical order, lines terminated
// with \n, ending with a trailing newline as required by the spec.
func (r *Registry) WriteText(w io.Writer) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	keys := make([]string, 0, len(r.counters)+len(r.histograms)+len(r.gauges))
	for k := range r.counters {
		keys = append(keys, "c|"+k)
	}
	for k := range r.histograms {
		keys = append(keys, "h|"+k)
	}
	for k := range r.gauges {
		keys = append(keys, "g|"+k)
	}
	sort.Strings(keys)

	emitted := map[string]bool{}
	for _, k := range keys {
		kind := k[:1]
		key := k[2:]
		switch kind {
		case "c":
			c := r.counters[key]
			if !emitted[c.name] {
				fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s counter\n", c.name, c.help, c.name)
				emitted[c.name] = true
			}
			fmt.Fprintf(w, "%s%s %d\n", c.name, fmtLabels(c.labels), c.Value())
		case "g":
			g := r.gauges[key]
			if !emitted[g.name] {
				fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s gauge\n", g.name, g.help, g.name)
				emitted[g.name] = true
			}
			fmt.Fprintf(w, "%s%s %g\n", g.name, fmtLabels(g.labels), g.Value())
		case "h":
			h := r.histograms[key]
			if !emitted[h.name] {
				fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s histogram\n", h.name, h.help, h.name)
				emitted[h.name] = true
			}
			h.mu.Lock()
			for i, ub := range h.buckets {
				lbls := mergeLabels(h.labels, "le", fmt.Sprintf("%g", ub))
				fmt.Fprintf(w, "%s_bucket%s %d\n", h.name, fmtLabels(lbls), h.counts[i])
			}
			lblsInf := mergeLabels(h.labels, "le", "+Inf")
			fmt.Fprintf(w, "%s_bucket%s %d\n", h.name, fmtLabels(lblsInf), h.total)
			fmt.Fprintf(w, "%s_sum%s %g\n", h.name, fmtLabels(h.labels), h.sum)
			fmt.Fprintf(w, "%s_count%s %d\n", h.name, fmtLabels(h.labels), h.total)
			h.mu.Unlock()
		}
	}
	return nil
}

func metricKey(name string, labels map[string]string) string {
	if len(labels) == 0 {
		return name
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString(name)
	b.WriteByte('|')
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(labels[k])
		b.WriteByte(',')
	}
	return b.String()
}

func fmtLabels(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%s=%q", k, labels[k])
	}
	b.WriteByte('}')
	return b.String()
}

func copyLabels(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func mergeLabels(base map[string]string, k, v string) map[string]string {
	out := copyLabels(base)
	if out == nil {
		out = map[string]string{}
	}
	out[k] = v
	return out
}
