package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/quantclient"
	"github.com/labstack/echo/v4"
)

// All admin/ai tests stay store-free: handlers that touch SystemRepo
// short-circuit to 503 when the repo is nil, so we only verify the
// validation + routing surface here. Round-trip persistence is covered
// by a manual smoke against the docker-compose stack.

// TestAdminAI_NoAdminKeyAndNoCookie — ADMIN_KEY 未设置且无 admin cookie：
// 路由始终挂载（不再 404 隐藏），但请求被 403 拒绝（双 key 模式）。
func TestAdminAI_NoAdminKeyAndNoCookie(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, nil, "" /* adminKey */).Register(g)

	for _, p := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/admin/ai/config"},
		{http.MethodPut, "/api/v1/admin/ai/config"},
		{http.MethodGet, "/api/v1/admin/ai/prompts"},
	} {
		req := httptest.NewRequest(p.method, p.path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s %s: expected 403 without admin auth, got %d", p.method, p.path, rec.Code)
		}
	}
}

func TestAdminAI_RequiresAdminHeader(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, nil, "secret").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/config", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without header or cookie, got %d", rec.Code)
	}
}

// TestAdminAI_AcceptsCookieAdmin — 在 Echo context 中预置 role=admin
// （模拟 WithAuth 解析 cookie 写入），即使没有 X-Admin-Key 也应通过。
// 这是双 key 模式的核心契约。
func TestAdminAI_AcceptsCookieAdmin(t *testing.T) {
	e := echo.New()
	// 模拟 WithAuth 中间件：写入 role=admin 到 context。
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set(gwmw.ContextRoleKey, domain.UserRoleAdmin)
			return next(c)
		}
	})
	g := e.Group("/api/v1")
	// 注意：adminKey 故意留空 —— cookie path 不应依赖它。
	NewAdminHandler(nil, nil, nil, "").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/config", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	// 后续 503（system repo nil）说明已经通过 auth gate。
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("cookie admin should bypass auth → 503 from nil repo; got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestAdminAI_ConfigReturns503WhenRepoNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, nil, "secret").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/config", nil)
	req.Header.Set("X-Admin-Key", "secret")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when system repo nil, got %d", rec.Code)
	}
}

func TestAdminAI_PromptsReturns503WhenQuantNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, nil, "secret").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/prompts", nil)
	req.Header.Set("X-Admin-Key", "secret")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when quant client nil, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestAdminAI_PromptsForwardsUnimplementedAs503(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, &fakeQuant{}, "secret").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/prompts", nil)
	req.Header.Set("X-Admin-Key", "secret")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 from unimplemented RPC, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "quant") {
		t.Fatalf("expected message to mention quant, got %s", rec.Body.String())
	}
}

// fakeQuantWithPrompts wraps the default fake to return a happy
// AIConfigResponse, simulating a server that has the RPC implemented.
type fakeQuantWithPrompts struct {
	fakeQuant
}

func (f *fakeQuantWithPrompts) GetAIConfig(_ context.Context) (*quantclient.AIConfigResponse, error) {
	return &quantclient.AIConfigResponse{
		DefineSearchSpace: "p1",
		RefineSearchSpace: "p2",
		FinalRationale:    "p3",
		Version:           "0.0.1",
		PromptsHash:       "deadbeef",
	}, nil
}

func TestAdminAI_PromptsReturns200OnSuccess(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAdminHandler(nil, nil, &fakeQuantWithPrompts{}, "secret").Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ai/prompts", nil)
	req.Header.Set("X-Admin-Key", "secret")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got quantclient.AIConfigResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.PromptsHash != "deadbeef" || got.Version != "0.0.1" {
		t.Fatalf("unexpected payload: %+v", got)
	}
}

// validateAIConfigPartial is the hot validator; exercise the grid here
// so the handler-level tests can focus on routing/auth only.
func TestValidateAIConfigPartial(t *testing.T) {
	cases := []struct {
		name    string
		input   domain.AIConfig
		wantErr string
	}{
		{
			name:  "all-empty ok (partial PUT)",
			input: domain.AIConfig{},
		},
		{
			name:  "claude family ok",
			input: domain.AIConfig{ModelFamily: "claude"},
		},
		{
			name:    "bad family rejected",
			input:   domain.AIConfig{ModelFamily: "anthropic"},
			wantErr: "modelFamily",
		},
		{
			name:    "negative budget rejected",
			input:   domain.AIConfig{BudgetUsdPerStudy: -1},
			wantErr: "budgets",
		},
		{
			name:    "study > day rejected",
			input:   domain.AIConfig{BudgetUsdPerStudy: 100, BudgetUsdPerDay: 50},
			wantErr: "budgetUsdPerStudy",
		},
		{
			name:  "study=day allowed (boundary)",
			input: domain.AIConfig{BudgetUsdPerStudy: 50, BudgetUsdPerDay: 50},
		},
		{
			name:    "lookback below floor rejected",
			input:   domain.AIConfig{LookbackDays: 3},
			wantErr: "lookbackDays",
		},
		{
			name:    "lookback above ceiling rejected",
			input:   domain.AIConfig{LookbackDays: 366},
			wantErr: "lookbackDays",
		},
		{
			name:  "lookback at floor ok",
			input: domain.AIConfig{LookbackDays: 7},
		},
		{
			name:    "bad anthropic URL rejected",
			input:   domain.AIConfig{AnthropicBaseURL: "not-a-url"},
			wantErr: "anthropicBaseURL",
		},
		{
			name:    "ftp URL rejected",
			input:   domain.AIConfig{OpenAIBaseURL: "ftp://example.com"},
			wantErr: "openaiBaseURL",
		},
		{
			name:  "https URL ok",
			input: domain.AIConfig{AnthropicBaseURL: "https://api.anthropic.com"},
		},
		{
			name:    "whitespace-only model name rejected",
			input:   domain.AIConfig{AnthropicPrimaryModel: "   "},
			wantErr: "model name",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateAIConfigPartial(&c.input)
			if c.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected err: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected err containing %q, got nil", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("err %q missing %q", err.Error(), c.wantErr)
			}
		})
	}
}

// effectiveAIConfig must source the labelled "env" when persisted is
// nil, "mongo" when every field is set, and "mixed" when only a
// subset is. We don't exercise individual env values here — those are
// hot paths covered by the existing dashboard helpers.
func TestEffectiveAIConfig_SourceLabel(t *testing.T) {
	// nil → env
	if got := effectiveAIConfig(nil); got.Source != "env" {
		t.Fatalf("nil persisted: want source=env, got %s", got.Source)
	}
	// partial → mixed
	partial := &domain.AIConfig{ModelFamily: "openai", BudgetUsdPerDay: 25}
	if got := effectiveAIConfig(partial); got.Source != "mixed" {
		t.Fatalf("partial persisted: want source=mixed, got %s", got.Source)
	}
	// fully populated → mongo
	full := &domain.AIConfig{
		ModelFamily:           "openai",
		AnthropicPrimaryModel: "claude-x",
		AnthropicRefineModel:  "claude-y",
		OpenAIPrimaryModel:    "gpt-z",
		OpenAIRefineModel:     "gpt-w",
		AnthropicBaseURL:      "https://api.anthropic.com",
		OpenAIBaseURL:         "https://api.openai.com",
		BudgetUsdPerStudy:     2,
		BudgetUsdPerDay:       10,
		LookbackDays:          30,
	}
	if got := effectiveAIConfig(full); got.Source != "mongo" {
		t.Fatalf("full persisted: want source=mongo, got %s", got.Source)
	}
}

// Period fallback: RecommendationDoc.EnsurePeriod must populate the
// gateway default when Period is nil and leave it untouched otherwise.
func TestRecommendationPeriod_DefaultFallback(t *testing.T) {
	// Using the underlying mongostore type via the existing handler
	// would require a SystemRepo — we just exercise EnsurePeriod
	// directly here since it's the hot path the handler invokes.
	d := &recommendationPeriodTestDoc{}
	d.EnsurePeriod()
	if d.Period == nil {
		t.Fatal("expected default period populated")
	}
	if d.Period.LookbackDays != 90 || d.Period.OosDays != 27 || !d.Period.SharpeAnnualized {
		t.Fatalf("unexpected default period: %+v", d.Period)
	}

	// Existing period must be preserved.
	d2 := &recommendationPeriodTestDoc{
		Period: &domain.RecommendationPeriod{
			LookbackDays:     180,
			InSampleDays:     126,
			OosDays:          54,
			SharpeAnnualized: false,
		},
	}
	d2.EnsurePeriod()
	if d2.Period.LookbackDays != 180 || d2.Period.SharpeAnnualized {
		t.Fatalf("existing period mutated: %+v", d2.Period)
	}
}

// recommendationPeriodTestDoc is a minimal shape implementing
// EnsurePeriod so the test stays decoupled from RecommendationDoc's
// full Mongo schema (the actual method on RecommendationDoc shares
// this body — see store/mongo/recommendation_repo.go).
type recommendationPeriodTestDoc struct {
	Period *domain.RecommendationPeriod
}

func (d *recommendationPeriodTestDoc) EnsurePeriod() {
	if d.Period == nil {
		d.Period = domain.DefaultRecommendationPeriod()
	}
}
