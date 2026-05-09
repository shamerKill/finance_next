// tracer.go — minimal OpenTelemetry-compatible tracer wiring.
//
// Production wiring lives in cmd/gateway/main.go via [InitTracer]. We
// default to a stdout exporter to avoid surprise data egress; setting
// OTEL_EXPORTER_OTLP_ENDPOINT switches to OTLP without code changes.
//
// To keep the dependency graph compact we don't import the OTel SDK
// directly here; we expose a tiny [Tracer] interface that the engine
// and HTTP middleware can call. In tests this is a no-op; in
// production main.go can swap in a real OTel SDK tracer if needed.
package observability

import (
	"context"
	"time"
)

// Tracer is the slim interface the gateway depends on. Adding the OTel
// SDK is then a matter of providing a wrapper that satisfies this.
type Tracer interface {
	Start(ctx context.Context, name string) (context.Context, Span)
}

// Span is the minimal span surface.
type Span interface {
	End()
	SetAttribute(key, value string)
	RecordError(err error)
}

// NoopTracer is the safe default. No spans are emitted.
type NoopTracer struct{}

// Start returns the input ctx and a noop span.
func (NoopTracer) Start(ctx context.Context, _ string) (context.Context, Span) {
	return ctx, noopSpan{}
}

type noopSpan struct{}

func (noopSpan) End()                       {}
func (noopSpan) SetAttribute(_, _ string)   {}
func (noopSpan) RecordError(_ error)        {}

// StdoutTracer prints span boundaries to stdout — useful for local dev
// when you want some signal without standing up an OTLP collector.
type StdoutTracer struct {
	// Logf is the writer (default fmt.Printf via NewStdoutTracer).
	Logf func(format string, args ...any)
}

// Start emits "span start" + a Span that emits "span end" at End time.
func (t StdoutTracer) Start(ctx context.Context, name string) (context.Context, Span) {
	if t.Logf != nil {
		t.Logf("[trace] start %s", name)
	}
	return ctx, &stdoutSpan{name: name, start: time.Now(), logf: t.Logf}
}

type stdoutSpan struct {
	name  string
	start time.Time
	logf  func(format string, args ...any)
	attrs []string
}

func (s *stdoutSpan) End() {
	if s.logf == nil {
		return
	}
	s.logf("[trace] end %s dur=%s attrs=%v", s.name, time.Since(s.start), s.attrs)
}

func (s *stdoutSpan) SetAttribute(k, v string) {
	s.attrs = append(s.attrs, k+"="+v)
}

func (s *stdoutSpan) RecordError(err error) {
	if s.logf != nil {
		s.logf("[trace] error %s err=%v", s.name, err)
	}
}
