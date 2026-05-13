package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/labstack/echo/v4"
)

type fakeWriter struct {
	mu      sync.Mutex
	entries []*domain.AuditEntry
}

func (f *fakeWriter) Insert(_ context.Context, e *domain.AuditEntry) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, e)
	return nil
}

func (f *fakeWriter) all() []*domain.AuditEntry {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]*domain.AuditEntry, len(f.entries))
	copy(out, f.entries)
	return out
}

func TestAudit_ScrubsSensitiveKeys(t *testing.T) {
	w := &fakeWriter{}
	mw, err := New(Config{Writer: w, BufferSize: 16})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	e.Use(mw.Middleware())
	e.POST("/api/v1/accounts", func(c echo.Context) error {
		return c.JSON(201, map[string]string{"id": "abc"})
	})

	body := `{"name":"a1","userApiKey":"k","userSecretKey":"s","passphrase":"p","apiKeyCiphertext":"ct","nested":{"secretKey":"x","ok":1}}`
	req := httptest.NewRequest("POST", "/api/v1/accounts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// Wait for the async drain.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(w.all()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	entries := w.all()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := string(entries[0].Payload)
	for _, k := range []string{`"k"`, `"s"`, `"p"`, `"ct"`, `"x"`} {
		if strings.Contains(got, k) {
			t.Errorf("payload leaked sensitive value %s; got %s", k, got)
		}
	}
	for _, want := range []string{`"userApiKey":"[redacted]"`, `"userSecretKey":"[redacted]"`, `"passphrase":"[redacted]"`, `"apiKeyCiphertext":"[redacted]"`} {
		if !strings.Contains(got, want) {
			t.Errorf("expected %s in scrubbed payload; got %s", want, got)
		}
	}
}

func TestAudit_SkipsGetAndHealthz(t *testing.T) {
	w := &fakeWriter{}
	mw, err := New(Config{Writer: w, BufferSize: 16})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	e.Use(mw.Middleware())
	e.GET("/api/v1/option", func(c echo.Context) error { return c.NoContent(200) })
	e.GET("/healthz", func(c echo.Context) error { return c.NoContent(200) })
	e.POST("/healthz", func(c echo.Context) error { return c.NoContent(200) })

	for _, p := range []string{"/api/v1/option", "/healthz"} {
		req := httptest.NewRequest("GET", p, nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
	}
	// POST to /healthz should also be skipped.
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest("POST", "/healthz", strings.NewReader("{}")))

	time.Sleep(50 * time.Millisecond)
	if got := len(w.all()); got != 0 {
		t.Errorf("expected 0 audit entries for skipped paths, got %d", got)
	}
}

func TestAudit_BufferOverflowCounted(t *testing.T) {
	// Slow writer + small buffer to force overflow.
	slow := &slowWriter{}
	mw, err := New(Config{Writer: slow, BufferSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	e.Use(mw.Middleware())
	e.POST("/api/v1/x", func(c echo.Context) error { return c.NoContent(200) })

	for i := 0; i < 50; i++ {
		req := httptest.NewRequest("POST", "/api/v1/x", strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
	}
	if mw.DropCount() == 0 {
		t.Errorf("expected some drops, got 0")
	}
}

type slowWriter struct{}

func (slowWriter) Insert(_ context.Context, _ *domain.AuditEntry) error {
	time.Sleep(50 * time.Millisecond)
	return nil
}

func TestAudit_ResourceClassification(t *testing.T) {
	cases := map[string]domain.ResourceType{
		"/api/v1/accounts":            domain.ResourceAccount,
		"/api/v1/strategies/abc/live": domain.ResourceStrategy,
		"/api/v1/option/foo":          domain.ResourceStrategy,
		"/api/v1/admin/halt":          domain.ResourceSystem,
		"/api/v1/recommendations/x":   domain.ResourceRecommendation,
		"/api/v1/market/ingest":       domain.ResourceMarket,
		"/api/v1/something":           domain.ResourceUnknown,
	}
	for path, want := range cases {
		if got := classifyResource(path); got != want {
			t.Errorf("classifyResource(%q) = %q, want %q", path, got, want)
		}
	}
}

// TestAudit_Phase9_ScrubsWalletKeys asserts the Phase 9 additions to the
// scrub list — privateKey / mnemonic / seed — never reach the audit
// store. This is the single hardest security boundary of the wallet
// layer; if anyone removes a scrub pattern, this test fails loudly.
func TestAudit_Phase9_ScrubsWalletKeys(t *testing.T) {
	w := &fakeWriter{}
	mw, err := New(Config{Writer: w, BufferSize: 16})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	e.Use(mw.Middleware())
	e.POST("/api/v1/wallets", func(c echo.Context) error {
		return c.JSON(201, map[string]string{"id": "abc"})
	})

	body := `{"label":"primary","privateKey":"0xdeadbeef0123","mnemonic":"abandon abandon abandon","seed":"0xfeedcafe","nested":{"privateKeyCiphertext":"ct","ok":1}}`
	req := httptest.NewRequest("POST", "/api/v1/wallets", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(w.all()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	entries := w.all()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := string(entries[0].Payload)
	for _, leaked := range []string{"deadbeef", "abandon", "feedcafe", `"ct"`} {
		if strings.Contains(got, leaked) {
			t.Errorf("payload leaked sensitive value %q; got %s", leaked, got)
		}
	}
	for _, want := range []string{
		`"privateKey":"[redacted]"`,
		`"mnemonic":"[redacted]"`,
		`"seed":"[redacted]"`,
		`"privateKeyCiphertext":"[redacted]"`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("expected %s in scrubbed payload; got %s", want, got)
		}
	}
}

// TestAudit_CapturesAnonymousOn401 locks in the Fix 3 ordering: audit
// middleware runs BEFORE WithAuth, so a request that fails cookie auth
// still produces an audit row with actor="anonymous". This is the
// critical path for forensics on failed-auth attempts.
func TestAudit_CapturesAnonymousOn401(t *testing.T) {
	w := &fakeWriter{}
	mw, err := New(Config{Writer: w, BufferSize: 16})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	// Fix 3 mount order: Audit FIRST, then WithAuth.
	e.Use(mw.Middleware())
	e.Use(WithAuth(AuthConfig{
		Secret: "test",
		Parser: func(token string) (*AuthClaims, error) {
			// Always reject so we hit the 401 path.
			return nil, errors.New("invalid token")
		},
	}))
	e.POST("/api/v1/option", func(c echo.Context) error {
		return c.NoContent(200)
	})

	req := httptest.NewRequest("POST", "/api/v1/option", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != 401 {
		t.Fatalf("expected 401 from failed auth, got %d body=%s", rec.Code, rec.Body.String())
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(w.all()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	entries := w.all()
	if len(entries) != 1 {
		t.Fatalf("expected 1 audit entry on 401, got %d", len(entries))
	}
	if entries[0].Actor != "anonymous" {
		t.Errorf("expected actor=anonymous on failed auth, got %q", entries[0].Actor)
	}
	if entries[0].StatusCode != 401 {
		t.Errorf("expected audited status=401, got %d", entries[0].StatusCode)
	}
}

func TestAudit_NonJSONBodyRedacted(t *testing.T) {
	out := sanitizePayload([]byte("not-json"))
	if !strings.Contains(string(out), "non-json") {
		t.Errorf("expected non-json marker, got %s", out)
	}
	// Ensure sane JSON bodies still survive.
	out2 := sanitizePayload([]byte(`{"a":1,"apiKey":"k"}`))
	var m map[string]interface{}
	if err := json.Unmarshal(out2, &m); err != nil {
		t.Fatalf("scrubbed payload is invalid JSON: %v", err)
	}
	if m["apiKey"] != "[redacted]" {
		t.Errorf("apiKey not redacted: %v", m)
	}
	if m["a"].(float64) != 1 {
		t.Errorf("non-sensitive field stripped: %v", m)
	}
}

// TestAudit_ScrubsAIProviderKeys verifies the Node 3.E.4 additions to
// scrubKeys cover all three AI provider plaintext API key fields. The
// existing `apikey` substring would already catch them; this test pins
// the contract so a future refactor can't silently regress.
func TestAudit_ScrubsAIProviderKeys(t *testing.T) {
	w := &fakeWriter{}
	mw, err := New(Config{Writer: w, BufferSize: 16})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go mw.Start(ctx)

	e := echo.New()
	e.Use(mw.Middleware())
	e.PUT("/api/v1/admin/ai/config", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"ok": "yes"})
	})

	body := `{"modelFamily":"deepseek","anthropicApiKey":"sk-anthropic-leak","openaiApiKey":"sk-openai-leak","deepseekApiKey":"sk-deepseek-leak"}`
	req := httptest.NewRequest("PUT", "/api/v1/admin/ai/config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(w.all()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	entries := w.all()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := string(entries[0].Payload)
	for _, leaked := range []string{"sk-anthropic-leak", "sk-openai-leak", "sk-deepseek-leak"} {
		if strings.Contains(got, leaked) {
			t.Errorf("payload leaked AI key %q; got %s", leaked, got)
		}
	}
	for _, want := range []string{
		`"anthropicApiKey":"[redacted]"`,
		`"openaiApiKey":"[redacted]"`,
		`"deepseekApiKey":"[redacted]"`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("expected %s in scrubbed payload; got %s", want, got)
		}
	}
}
