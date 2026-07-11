package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
)

func TestAIGoalExtractsProviderText(t *testing.T) {
	tests := []struct {
		name   string
		family string
		body   string
		want   string
	}{
		{
			name:   "anthropic content text",
			family: "anthropic",
			body:   `{"content":[{"type":"text","text":"{\"summary\":\"anthropic\"}"}]}`,
			want:   `{"summary":"anthropic"}`,
		},
		{
			name:   "openai output text",
			family: "openai",
			body:   `{"output_text":"{\"summary\":\"openai\"}"}`,
			want:   `{"summary":"openai"}`,
		},
		{
			name:   "openai nested output text",
			family: "openai",
			body:   `{"output":[{"content":[{"type":"output_text","text":"{\"summary\":\"nested\"}"}]}]}`,
			want:   `{"summary":"nested"}`,
		},
		{
			name:   "openai chat completion text",
			family: "openai",
			body:   `{"choices":[{"message":{"content":"{\"summary\":\"openai chat\"}"}}]}`,
			want:   `{"summary":"openai chat"}`,
		},
		{
			name:   "deepseek chat completion",
			family: "deepseek",
			body:   `{"choices":[{"message":{"content":"{\"summary\":\"deepseek\"}"}}]}`,
			want:   `{"summary":"deepseek"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractGoalAIText(tt.family, []byte(tt.body))
			if err != nil {
				t.Fatalf("extractGoalAIText() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("extractGoalAIText() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestAIGoalOpenAIRetriesChatCompletionsWhenResponsesUnsupported(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test-secret")

	h := NewAIGoalHandler(nil, nil, nil, nil, nil)
	h.system = fakeAIGoalSystemStore{
		cfg: &domain.AIConfig{
			ModelFamily:        "openai",
			OpenAIBaseURL:      "https://newapi.example",
			OpenAIPrimaryModel: "gpt-5.5",
		},
	}

	var calls []string
	h.httpPost = func(_ context.Context, endpoint string, headers map[string]string, payload []byte) ([]byte, int, error) {
		calls = append(calls, endpoint)
		if strings.Contains(endpoint, "/responses") {
			return []byte(`{"error":"responses not found"}`), http.StatusNotFound, nil
		}
		if !strings.Contains(endpoint, "/chat/completions") {
			t.Fatalf("unexpected fallback endpoint: %s", endpoint)
		}
		if got := headers["Authorization"]; got != "Bearer sk-test-secret" {
			t.Fatalf("auth header = %q, want bearer key", got)
		}
		if strings.Contains(string(payload), "sk-test-secret") {
			t.Fatalf("payload leaked api key: %s", string(payload))
		}
		content := `{"summary":"chat ok","strategyDrafts":[{"name":"btca","kind":"watch_only","symbol":"BTCUSDT","thesis":"observe"}]}`
		body, err := json.Marshal(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]string{"content": content},
			}},
		})
		if err != nil {
			t.Fatalf("marshal fake response: %v", err)
		}
		return body, http.StatusOK, nil
	}

	got := h.runGoalAI(context.Background(), aiGoalAnalyzeRequest{
		Goal:          "观察 BTC 风险",
		Symbols:       []string{"BTC"},
		ExecutionMode: "observe",
	}, aiGoalContext{})

	if len(calls) != 2 {
		t.Fatalf("calls = %d (%v), want responses then chat fallback", len(calls), calls)
	}
	if !strings.Contains(calls[0], "/v1/responses") || !strings.Contains(calls[1], "/v1/chat/completions") {
		t.Fatalf("unexpected call order: %v", calls)
	}
	if got.AI.Status != "ok" || got.AI.Family != "openai" {
		t.Fatalf("AI status = %#v, want ok openai", got.AI)
	}
	if got.Summary != "chat ok" {
		t.Fatalf("summary = %q, want chat ok", got.Summary)
	}
	if got.AI.BaseURL != "https://newapi.example" {
		t.Fatalf("baseURL = %q, want newapi origin", got.AI.BaseURL)
	}
}

func TestAIGoalMalformedAIOutputFallsBack(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 和 ETH 的低风险赚钱机会",
		Symbols:        []string{"BTC", "ETH"},
		Horizon:        "1-4 weeks",
		RiskPreference: "conservative",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		ExistingStrategies: []domain.Option{
			{Name: "btcgrid", ExecSymbol: "BTCUSDT"},
		},
		Notes: []string{"news unavailable"},
	}

	got := parseGoalAIResponse("not-json", req, ctx, "provider returned malformed JSON")

	if got.AI.Status != "fallback" {
		t.Fatalf("AI status = %q, want fallback", got.AI.Status)
	}
	if got.Summary == "" {
		t.Fatalf("fallback summary should not be empty")
	}
	if len(got.StrategyDrafts) == 0 {
		t.Fatalf("fallback should include at least one strategy draft")
	}
	if !strings.Contains(got.Execution.NextSteps[0], "人工复核") {
		t.Fatalf("first execution step should require review, got %#v", got.Execution.NextSteps)
	}
	if !containsString(got.Execution.SafetyGates, "24-72 小时 paper 复盘证据") {
		t.Fatalf("fallback safety gates missing paper evidence: %#v", got.Execution.SafetyGates)
	}
	draft := got.StrategyDrafts[0]
	for _, want := range []string{"24-72 小时", "市场风向、舆论、人性偏差、执行摩擦"} {
		if !containsStringFragment(draft.ValidationPlan, want) {
			t.Fatalf("fallback validation plan missing %q: %#v", want, draft.ValidationPlan)
		}
	}
	if !containsStringFragment(draft.ExecutionPlan, "复盘证据完成后再考虑测试网") {
		t.Fatalf("fallback execution plan missing paper evidence step: %#v", draft.ExecutionPlan)
	}
}

func TestAIGoalFallbackTurnsMarketContextIntoWatchSignals(t *testing.T) {
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 的低回撤赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		News: []timescale.NewsItem{
			{
				Source:    "cryptopanic",
				Time:      now,
				Title:     "ETF inflows accelerate",
				Sentiment: 0.72,
				Symbols:   []string{"BTC"},
			},
		},
		Macro: []timescale.MacroPoint{
			{Source: "fred", Code: "FEDFUNDS", Time: now, Value: 5.25, Unit: "%"},
		},
		Onchain: []timescale.OnchainPoint{
			{Source: "blockchain_info", Chain: "btc", Metric: "hash_rate", Time: now, Value: 123},
		},
	}

	got := fallbackGoalAnalysis(req, ctx, "AI provider key not configured")

	for _, want := range []string{"ETF inflows accelerate", "FEDFUNDS", "hash_rate"} {
		if !watchSignalsContainFragment(got.WatchSignals, want) {
			t.Fatalf("fallback watch signals missing %q: %#v", want, got.WatchSignals)
		}
	}
}

func TestParseGoalAIResponseNormalizesUnsafeProviderOutput(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 的低回撤赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{}
	raw := `{
		"summary": "模型认为可以直接执行。",
		"marketRead": "短期看涨。",
		"humanFactors": [],
		"strategyDrafts": [
			{
				"name": "btca",
				"kind": "grid_dca",
				"symbol": "BTCUSDT",
				"thesis": "追踪上涨趋势",
				"params": {"positionLevel": 50}
			}
		],
		"watchSignals": [],
		"execution": {
			"mode": "mainnet",
			"canAutoExecute": true,
			"nextSteps": [],
			"safetyGates": []
		}
	}`

	got := parseGoalAIResponse(raw, req, ctx, "")

	if got.Execution.Mode != "paper" {
		t.Fatalf("execution mode = %q, want paper", got.Execution.Mode)
	}
	if got.Execution.CanAutoExecute {
		t.Fatal("canAutoExecute should always be false")
	}
	for _, want := range []string{"risk caps", "backtest", "mainnet token gate"} {
		if !containsString(got.Execution.SafetyGates, want) {
			t.Fatalf("safety gates missing %q: %#v", want, got.Execution.SafetyGates)
		}
	}
	if !containsString(got.Execution.SafetyGates, "paper review evidence") {
		t.Fatalf("safety gates missing paper review evidence: %#v", got.Execution.SafetyGates)
	}
	if len(got.StrategyDrafts) != 1 {
		t.Fatalf("draft count = %d, want 1", len(got.StrategyDrafts))
	}
	draft := got.StrategyDrafts[0]
	if draft.RiskCaps["maxPositionUsd"] <= 0 ||
		draft.RiskCaps["maxLeverage"] <= 0 ||
		draft.RiskCaps["dailyLossCapUsd"] <= 0 {
		t.Fatalf("risk caps not filled: %#v", draft.RiskCaps)
	}
	if len(draft.ValidationPlan) == 0 || len(draft.ExecutionPlan) == 0 || len(draft.Blockers) == 0 {
		t.Fatalf("draft safety plans not filled: %#v", draft)
	}
	for _, want := range []string{"24-72 小时", "市场风向、舆论、人性偏差、执行摩擦"} {
		if !containsStringFragment(draft.ValidationPlan, want) {
			t.Fatalf("draft validation plan missing %q: %#v", want, draft.ValidationPlan)
		}
	}
	if !containsStringFragment(draft.ExecutionPlan, "复盘证据完成后再考虑测试网") {
		t.Fatalf("draft execution plan missing paper evidence step: %#v", draft.ExecutionPlan)
	}
}

func TestParseGoalAIResponseBackfillsContextWatchSignals(t *testing.T) {
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 的低回撤赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		News: []timescale.NewsItem{
			{Source: "cryptopanic", Time: now, Title: "ETF inflows accelerate", Sentiment: 0.72, Symbols: []string{"BTC"}},
		},
		Macro: []timescale.MacroPoint{
			{Source: "fred", Code: "FEDFUNDS", Time: now, Value: 5.25, Unit: "%"},
		},
		Onchain: []timescale.OnchainPoint{
			{Source: "blockchain_info", Chain: "btc", Metric: "hash_rate", Time: now, Value: 123},
		},
	}
	raw := `{
		"summary": "模型给出保守蓝图。",
		"marketRead": "需要继续观察。",
		"humanFactors": ["避免 FOMO"],
		"strategyDrafts": [
			{"name": "btca", "kind": "grid_dca", "symbol": "BTCUSDT", "thesis": "先验证"}
		],
		"watchSignals": [],
		"execution": {"mode": "paper", "canAutoExecute": false}
	}`

	got := parseGoalAIResponse(raw, req, ctx, "")

	if got.AI.Status != "ok" {
		t.Fatalf("AI status = %q, want ok", got.AI.Status)
	}
	for _, want := range []string{"ETF inflows accelerate", "FEDFUNDS", "hash_rate"} {
		if !watchSignalsContainFragment(got.WatchSignals, want) {
			t.Fatalf("parsed watch signals missing %q: %#v", want, got.WatchSignals)
		}
	}
}

func TestParseGoalAIResponseCapsDraftParamsByRiskCaps(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 的低回撤赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{}
	raw := `{
		"summary": "模型给出高杠杆策略。",
		"marketRead": "短期看涨。",
		"humanFactors": [],
		"strategyDrafts": [
			{
				"name": "btca",
				"kind": "grid_dca",
				"symbol": "BTCUSDT",
				"thesis": "追踪上涨趋势",
				"params": {
					"positionLevel": 50,
					"orderGroupMargin": 999
				},
				"riskCaps": {
					"maxPositionUsd": 120,
					"maxLeverage": 3,
					"dailyLossCapUsd": 20
				}
			}
		],
		"watchSignals": [],
		"execution": {
			"mode": "paper",
			"canAutoExecute": false,
			"nextSteps": ["人工复核"],
			"safetyGates": ["backtest"]
		}
	}`

	got := parseGoalAIResponse(raw, req, ctx, "")

	if len(got.StrategyDrafts) != 1 {
		t.Fatalf("draft count = %d, want 1", len(got.StrategyDrafts))
	}
	params := got.StrategyDrafts[0].Params
	if got := paramFloat(t, params, "positionLevel"); got != 3 {
		t.Fatalf("positionLevel = %v, want 3", got)
	}
	if got := paramFloat(t, params, "orderGroupMargin"); got != 120 {
		t.Fatalf("orderGroupMargin = %v, want 120", got)
	}
}

func TestParseGoalAIResponseAddsExecutionContextBlockers(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "用 AI 寻找 BTC 的低回撤赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		Execution: aiGoalExecutionContext{
			AccountCount:                  1,
			TradeableAccountCount:         0,
			WithdrawalEnabledAccountCount: 1,
			TradingHalted:                 true,
			HaltedReason:                  "manual halt",
			PortfolioLimits:               domain.PortfolioLimits{UserID: "default"},
		},
	}
	raw := `{
		"summary": "模型认为可以推进。",
		"marketRead": "短期看涨。",
		"humanFactors": [],
		"strategyDrafts": [
			{
				"name": "btca",
				"kind": "grid_dca",
				"symbol": "BTCUSDT",
				"thesis": "低回撤验证",
				"params": {"positionLevel": 3},
				"riskCaps": {
					"maxPositionUsd": 100,
					"maxLeverage": 3,
					"dailyLossCapUsd": 20
				}
			}
		],
		"watchSignals": [],
		"execution": {
			"mode": "paper",
			"canAutoExecute": false,
			"nextSteps": ["创建策略"],
			"safetyGates": ["backtest"]
		}
	}`

	got := parseGoalAIResponse(raw, req, ctx, "")

	for _, want := range []string{"tradeable account", "trading halt", "portfolio limits"} {
		if !containsString(got.Execution.SafetyGates, want) {
			t.Fatalf("safety gates missing %q: %#v", want, got.Execution.SafetyGates)
		}
	}
	for _, want := range []string{"添加可交易且不可提现账户", "解除全局 trading halt", "设置组合限额"} {
		if !containsString(got.Execution.NextSteps, want) {
			t.Fatalf("next steps missing %q: %#v", want, got.Execution.NextSteps)
		}
	}
	if len(got.StrategyDrafts) != 1 {
		t.Fatalf("draft count = %d, want 1", len(got.StrategyDrafts))
	}
	blockers := got.StrategyDrafts[0].Blockers
	for _, want := range []string{"缺少可交易且无提现权限账户", "全局交易已暂停", "组合限额未设置"} {
		if !containsString(blockers, want) {
			t.Fatalf("draft blockers missing %q: %#v", want, blockers)
		}
	}
}

func paramFloat(t *testing.T, params map[string]any, key string) float64 {
	t.Helper()
	switch v := params[key].(type) {
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case float64:
		return v
	case float32:
		return float64(v)
	default:
		t.Fatalf("params[%s] has unsupported type %T: %#v", key, v, v)
	}
	return 0
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func containsStringFragment(values []string, needle string) bool {
	for _, value := range values {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func watchSignalsContainFragment(values []aiGoalWatchSignal, needle string) bool {
	for _, value := range values {
		if strings.Contains(value.Signal, needle) ||
			strings.Contains(value.Source, needle) ||
			strings.Contains(value.Interpretation, needle) ||
			strings.Contains(value.Action, needle) {
			return true
		}
	}
	return false
}

func equalStringSlices(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func TestAIGoalSystemPromptIncludesPaperEvidenceContract(t *testing.T) {
	prompt := goalAgentSystemPrompt()

	for _, want := range []string{
		"24-72h paper review evidence",
		"market direction / sentiment / human-bias / execution-friction review evidence",
		"no testnet/mainnet promotion before evidence",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("system prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestAIGoalPromptIncludesMarketAndHumanContext(t *testing.T) {
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	req := aiGoalAnalyzeRequest{
		Goal:           "三个月内稳健增加现金流",
		Symbols:        []string{"BTC", "ETH"},
		Horizon:        "3 months",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		News: []timescale.NewsItem{
			{
				Source:    "cryptopanic",
				Time:      now,
				Title:     "ETF inflows accelerate",
				Sentiment: 0.72,
				Symbols:   []string{"BTC"},
			},
		},
		Macro: []timescale.MacroPoint{
			{Source: "fred", Code: "FEDFUNDS", Time: now, Value: 5.25, Unit: "%"},
		},
		Onchain: []timescale.OnchainPoint{
			{Source: "blockchain_info", Chain: "btc", Metric: "hash_rate", Time: now, Value: 123},
		},
		ExistingStrategies: []domain.Option{
			{Name: "ethgrid", ExecSymbol: "ETHUSDT"},
		},
	}

	prompt := buildGoalPrompt(req, ctx)

	for _, want := range []string{
		"三个月内稳健增加现金流",
		"ETF inflows accelerate",
		"FEDFUNDS",
		"hash_rate",
		"ethgrid",
		"human psychology",
		"market sentiment",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestAIGoalPromptRequiresPaperEvidenceBeforeTestnet(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "让 AI 自动分析 BTC 并推进到安全测试网",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "testnet",
	}

	prompt := buildGoalPrompt(req, aiGoalContext{})

	for _, want := range []string{
		"Evidence-gated execution rules",
		"requested testnet/mainnet is an upper bound, not permission",
		"Before testnet, require backtest plus 24-72h paper review evidence",
		"market direction, sentiment/crowding, human bias, execution friction/slippage",
		"thin paper_watch done notes remain unresolved",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestAIGoalPromptIncludesExecutionContext(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "只在安全条件满足时推进 AI 策略",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "conservative",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		Execution: aiGoalExecutionContext{
			AccountCount:                  2,
			TradeableAccountCount:         1,
			WithdrawalEnabledAccountCount: 1,
			TradingHalted:                 true,
			HaltedReason:                  "operator halt",
			PortfolioLimits: domain.PortfolioLimits{
				UserID:                "default",
				MaxOpenNotionalUsd:    500,
				MaxOpenPositionsCount: 3,
				MaxDailyLossUsd:       30,
			},
		},
	}

	prompt := buildGoalPrompt(req, ctx)

	for _, want := range []string{
		"Execution readiness",
		"tradeableAccounts=1/2",
		"withdrawEnabledAccounts=1",
		"tradingHalted=true",
		"operator halt",
		"maxOpenNotionalUsd=500",
		"maxOpenPositionsCount=3",
		"maxDailyLossUsd=30",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestBuildGoalPromptIncludesRecentAIGoalMemory(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:           "继续寻找低回撤 AI 赚钱机会",
		Symbols:        []string{"BTC"},
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	ctx := aiGoalContext{
		RecentRuns: []mongostore.AIGoalRunDoc{
			{
				ID:                  "goal_old",
				CreatedAt:           time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
				Goal:                "BTC 旧风向",
				Summary:             "旧判断证据不足，建议重扫。",
				Symbols:             []string{"BTC"},
				AIStatus:            "fallback",
				ExecutionMode:       "paper",
				StrategyDraftCount:  0,
				ContextNewsCount:    0,
				ContextMacroCount:   0,
				ContextOnchainCount: 0,
				Actions: []mongostore.AIGoalRunAction{
					{ID: "refresh_context", Status: "done", RelatedID: "goal_new", Note: "已重扫"},
				},
			},
			{
				ID:                  "goal_new",
				CreatedAt:           time.Date(2026, 6, 3, 4, 0, 0, 0, time.UTC),
				Goal:                "BTC 新风向",
				Summary:             "ETF 资金和链上证据改善，进入 paper 候选观察。",
				Symbols:             []string{"BTC", "ETH"},
				AIStatus:            "ok",
				ExecutionMode:       "paper",
				StrategyDraftCount:  2,
				ContextNewsCount:    4,
				ContextMacroCount:   1,
				ContextOnchainCount: 2,
				Analysis: map[string]any{
					"marketRead":   "ETF 资金转暖但社媒拥挤。",
					"humanFactors": []any{"FOMO 追涨", "拥挤交易"},
					"watchSignals": []any{
						map[string]any{"signal": "ETF 流入放缓", "source": "news"},
						map[string]any{"signal": "资金费率过热", "source": "price"},
					},
				},
				Actions: []mongostore.AIGoalRunAction{
					{ID: "backtest", Status: "done", RelatedID: "run_btc", Note: "回测完成"},
					{
						ID:        "paper_watch",
						Status:    "manual",
						RelatedID: "btca",
						Note:      "AI paper 观察计划：btca，评分 82，关联回测 run_btc。窗口：24-72 小时。指标：收益 18.00%，回撤 8.00%，夏普 1.35。停止规则：paper 期间最大回撤超过 12.00% 时暂停观察并回到策略蓝图。首个触发器：社媒 FOMO -> 降低 paper 仓位。",
					},
				},
			},
		},
	}

	prompt := buildGoalPrompt(req, ctx)

	for _, want := range []string{
		"Recent AI goal memory",
		"goal_old",
		"BTC 旧风向",
		"旧判断证据不足",
		"context=0/0/0",
		"action=refresh_context status=done related=goal_new note=已重扫",
		"goal_new",
		"ETF 资金和链上证据改善",
		"drafts=2",
		"context=4/1/2",
		"action=backtest status=done related=run_btc note=回测完成",
		"action=paper_watch status=manual related=btca note=AI paper 观察计划",
		"handoffDetail=paper_watch status=manual related=btca",
		"停止规则：paper 期间最大回撤超过 12.00%",
		"首个触发器：社媒 FOMO -> 降低 paper 仓位",
		"Recent action handoff rules",
		"done actions are evidence; do not ask the user to repeat them unless new contradictory data appears",
		"manual, ready, or blocked actions are unresolved handoff items",
		"run=goal_new actionHandoff unresolved=1 done=1 ready=0 manual=1 blocked=0",
		"marketMemory read=ETF 资金转暖但社媒拥挤。",
		"human=FOMO 追涨 | 拥挤交易",
		"watch=ETF 流入放缓 | 资金费率过热",
		"Do not promote to testnet or mainnet while sentiment_review or paper_watch is unresolved",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestSummarizeGoalContextIncludesRecentRunMemory(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:          "继续用 AI 找低回撤机会",
		Symbols:       []string{"BTC"},
		ExecutionMode: "paper",
	}
	ctx := aiGoalContext{
		RecentRuns: []mongostore.AIGoalRunDoc{
			{
				ID:                  "goal_old",
				Goal:                "BTC 旧风向",
				Summary:             "旧判断证据不足，建议重扫。",
				AIStatus:            "fallback",
				ExecutionMode:       "paper",
				StrategyDraftCount:  0,
				ContextNewsCount:    0,
				ContextMacroCount:   0,
				ContextOnchainCount: 0,
				Analysis:            map[string]any{"privateAlpha": "do-not-return"},
				Actions: []mongostore.AIGoalRunAction{
					{ID: "refresh_context", Status: "done", RelatedID: "goal_new", Note: "已重扫"},
				},
			},
			{
				ID:                  "goal_new",
				Goal:                "BTC 新风向",
				Summary:             "ETF 资金和链上证据改善，进入 paper 候选观察。",
				AIStatus:            "ok",
				ExecutionMode:       "paper",
				StrategyDraftCount:  2,
				ContextNewsCount:    4,
				ContextMacroCount:   1,
				ContextOnchainCount: 2,
				Analysis: map[string]any{
					"marketRead":   "ETF 资金转暖但社媒拥挤。",
					"humanFactors": []any{"FOMO 追涨", "拥挤交易"},
					"watchSignals": []any{
						map[string]any{"signal": "ETF 流入放缓", "source": "news"},
						map[string]any{"signal": "资金费率过热", "source": "price"},
					},
				},
				Actions: []mongostore.AIGoalRunAction{
					{ID: "backtest", Status: "done", RelatedID: "run_btc", Note: "回测完成"},
					{ID: "paper_watch", Status: "manual", RelatedID: "btca", Note: "等待观察"},
				},
			},
		},
	}

	summary := summarizeGoalContext(req, ctx)

	if summary.RecentRunCount != 2 {
		t.Fatalf("RecentRunCount = %d, want 2", summary.RecentRunCount)
	}
	if len(summary.RecentRunSummaries) != 2 {
		t.Fatalf("RecentRunSummaries length = %d, want 2", len(summary.RecentRunSummaries))
	}
	first := summary.RecentRunSummaries[0]
	if first.ID != "goal_old" || first.Goal != "BTC 旧风向" || first.Summary == "" {
		t.Fatalf("unexpected first recent run summary: %#v", first)
	}
	if first.AIStatus != "fallback" || first.ExecutionMode != "paper" || first.ActionCount != 1 {
		t.Fatalf("unexpected first recent run metadata: %#v", first)
	}
	second := summary.RecentRunSummaries[1]
	if second.StrategyDraftCount != 2 || second.ContextNewsCount != 4 || second.ContextMacroCount != 1 || second.ContextOnchainCount != 2 || second.ActionCount != 2 {
		t.Fatalf("unexpected second recent run metadata: %#v", second)
	}
	if second.DoneActionCount != 1 || second.ManualActionCount != 1 || second.ReadyActionCount != 0 || second.BlockedActionCount != 0 || second.OpenActionCount != 1 {
		t.Fatalf("unexpected second recent run action counts: %#v", second)
	}
	if second.MarketRead != "ETF 资金转暖但社媒拥挤。" {
		t.Fatalf("MarketRead = %q, want ETF 资金转暖但社媒拥挤。", second.MarketRead)
	}
	if len(second.HumanFactors) != 2 || second.HumanFactors[0] != "FOMO 追涨" || second.HumanFactors[1] != "拥挤交易" {
		t.Fatalf("HumanFactors = %#v, want FOMO / crowded", second.HumanFactors)
	}
	if second.WatchSignalCount != 2 {
		t.Fatalf("WatchSignalCount = %d, want 2", second.WatchSignalCount)
	}
	if len(second.WatchSignalHighlights) != 2 || second.WatchSignalHighlights[0] != "ETF 流入放缓" || second.WatchSignalHighlights[1] != "资金费率过热" {
		t.Fatalf("WatchSignalHighlights = %#v, want ETF / funding", second.WatchSignalHighlights)
	}
	body, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("json.Marshal(summary) error = %v", err)
	}
	if strings.Contains(string(body), "privateAlpha") || strings.Contains(string(body), "do-not-return") {
		t.Fatalf("summary leaked full analysis payload: %s", string(body))
	}
}

func TestSummarizeGoalContextIncludesMarketContextHighlights(t *testing.T) {
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	req := aiGoalAnalyzeRequest{
		Goal:          "让 AI 自动观察 BTC 市场风向",
		Symbols:       []string{"BTC"},
		ExecutionMode: "paper",
	}
	ctx := aiGoalContext{
		News: []timescale.NewsItem{
			{
				Source:    "cryptopanic",
				Time:      now,
				Title:     "ETF inflows accelerate",
				Sentiment: 0.72,
				Symbols:   []string{"BTC"},
			},
		},
		Macro: []timescale.MacroPoint{
			{Source: "fred", Code: "FEDFUNDS", Time: now, Value: 5.25, Unit: "%"},
		},
		Onchain: []timescale.OnchainPoint{
			{Source: "blockchain_info", Chain: "btc", Metric: "hash_rate", Time: now, Value: 123},
		},
	}

	summary := summarizeGoalContext(req, ctx)

	if len(summary.MarketContextHighlights) != 3 {
		t.Fatalf("MarketContextHighlights length = %d, want 3: %#v", len(summary.MarketContextHighlights), summary.MarketContextHighlights)
	}
	want := []string{"ETF inflows accelerate", "FEDFUNDS", "hash_rate"}
	for i, label := range want {
		if !strings.Contains(summary.MarketContextHighlights[i].Label, label) {
			t.Fatalf("highlight %d label = %q, want fragment %q", i, summary.MarketContextHighlights[i].Label, label)
		}
		if summary.MarketContextHighlights[i].Detail == "" {
			t.Fatalf("highlight %d detail should explain the evidence: %#v", i, summary.MarketContextHighlights[i])
		}
	}
}

func TestAIGoalBuildContextPreservesRecentRunMarketMemory(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:          "继续用 AI 找低回撤机会",
		Symbols:       []string{"BTC"},
		ExecutionMode: "paper",
	}
	h := NewAIGoalHandler(nil, nil, nil, nil, nil)
	h.runs = fakeAIGoalRunStore{
		rows: []mongostore.AIGoalRunDoc{
			{
				ID:                  "goal_memory",
				Goal:                "BTC 市场风向",
				Summary:             "上一轮发现舆论拥挤。",
				AIStatus:            "ok",
				ExecutionMode:       "paper",
				StrategyDraftCount:  1,
				ContextNewsCount:    3,
				ContextMacroCount:   0,
				ContextOnchainCount: 1,
				Analysis: map[string]any{
					"marketRead":   "ETF 资金转暖但社媒拥挤。",
					"humanFactors": []any{"FOMO 追涨"},
					"watchSignals": []any{
						map[string]any{"signal": "ETF 流入放缓", "source": "news"},
					},
				},
			},
		},
	}

	ctx := h.buildGoalContext(context.Background(), "u1", req)
	summary := summarizeGoalContext(req, ctx)

	if len(summary.RecentRunSummaries) != 1 {
		t.Fatalf("RecentRunSummaries length = %d, want 1", len(summary.RecentRunSummaries))
	}
	recent := summary.RecentRunSummaries[0]
	if recent.MarketRead != "ETF 资金转暖但社媒拥挤。" {
		t.Fatalf("MarketRead = %q, want preserved market read", recent.MarketRead)
	}
	if len(recent.HumanFactors) != 1 || recent.HumanFactors[0] != "FOMO 追涨" {
		t.Fatalf("HumanFactors = %#v, want preserved human factors", recent.HumanFactors)
	}
	if recent.WatchSignalCount != 1 || len(recent.WatchSignalHighlights) != 1 || recent.WatchSignalHighlights[0] != "ETF 流入放缓" {
		t.Fatalf("watch signal memory not preserved: %#v", recent)
	}
}

func TestAIGoalRunActionPatchAcceptsRefreshContext(t *testing.T) {
	action, err := normalizeAIGoalRunActionPatch(
		"refresh_context",
		aiGoalRunActionPatchRequest{
			Status:    "done",
			RelatedID: "goal_new",
			Href:      "/ai-money?runId=goal_new",
			Note:      "已重新扫描为新 AI run。",
		},
		time.Date(2026, 6, 3, 4, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("normalizeAIGoalRunActionPatch() error = %v", err)
	}
	if action.ID != "refresh_context" || action.Status != "done" || action.RelatedID != "goal_new" {
		t.Fatalf("unexpected action: %#v", action)
	}
}

type fakeAIGoalAccountStore struct {
	accounts []domain.Account
}

func (f fakeAIGoalAccountStore) FindAll(ctx context.Context, userID string) ([]domain.Account, error) {
	return f.accounts, nil
}

type fakeAIGoalRunStore struct {
	rows []mongostore.AIGoalRunDoc
}

func (f fakeAIGoalRunStore) Create(ctx context.Context, run *mongostore.AIGoalRunDoc) error {
	return nil
}

func (f fakeAIGoalRunStore) FindAllForUser(ctx context.Context, userID string, limit int) ([]mongostore.AIGoalRunDoc, error) {
	return f.rows, nil
}

func (f fakeAIGoalRunStore) FindByIDForUser(ctx context.Context, userID, id string) (*mongostore.AIGoalRunDoc, error) {
	return nil, mongostore.ErrAIGoalRunNotFound
}

func (f fakeAIGoalRunStore) UpsertActionForUser(
	ctx context.Context,
	userID, id string,
	action mongostore.AIGoalRunAction,
) (*mongostore.AIGoalRunDoc, error) {
	return nil, mongostore.ErrAIGoalRunNotFound
}

type fakeAIGoalSystemStore struct {
	state  *domain.SystemState
	limits *domain.PortfolioLimits
	cfg    *domain.AIConfig
	err    error
}

func (f fakeAIGoalSystemStore) GetAIConfig(ctx context.Context) (*domain.AIConfig, error) {
	return f.cfg, f.err
}

func (f fakeAIGoalSystemStore) GetSystemState(ctx context.Context) (*domain.SystemState, error) {
	return f.state, nil
}

func (f fakeAIGoalSystemStore) GetPortfolioLimits(ctx context.Context, userID string) (*domain.PortfolioLimits, error) {
	return f.limits, nil
}

func TestAIGoalProviderStatusReportsMissingActiveKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	t.Setenv("AI_MODEL_FAMILY", "openai")

	h := NewAIGoalHandler(nil, nil, nil, nil, nil)
	h.system = fakeAIGoalSystemStore{}
	e := echo.New()
	g := e.Group("/api/v1")
	h.Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ai/goals/provider-status", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["status"] != "blocked" {
		t.Fatalf("status = %v, want blocked", got["status"])
	}
	if got["providerFamily"] != "openai" {
		t.Fatalf("providerFamily = %v, want openai", got["providerFamily"])
	}
	if got["keyConfigured"] != false {
		t.Fatalf("keyConfigured = %v, want false", got["keyConfigured"])
	}
	if got["primaryHref"] != "/settings/ai" {
		t.Fatalf("primaryHref = %v, want /settings/ai", got["primaryHref"])
	}
}

func TestAIGoalProviderStatusReportsPersistedDeepseekKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	t.Setenv("AI_MODEL_FAMILY", "claude")

	h := NewAIGoalHandler(nil, nil, nil, nil, nil)
	h.system = fakeAIGoalSystemStore{
		cfg: &domain.AIConfig{
			ModelFamily:               "deepseek",
			DeepseekPrimaryModel:      "deepseek-reasoner",
			DeepseekAPIKeyCiphertext:  "cipher",
			AnthropicAPIKeyCiphertext: "anthropic-cipher",
			OpenAIAPIKeyCiphertext:    "openai-cipher",
		},
	}
	e := echo.New()
	g := e.Group("/api/v1")
	h.Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ai/goals/provider-status", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "cipher") {
		t.Fatalf("provider status leaked ciphertext: %s", body)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["status"] != "ready" {
		t.Fatalf("status = %v, want ready", got["status"])
	}
	if got["providerFamily"] != "deepseek" {
		t.Fatalf("providerFamily = %v, want deepseek", got["providerFamily"])
	}
	if got["keyConfigured"] != true {
		t.Fatalf("keyConfigured = %v, want true", got["keyConfigured"])
	}
	if got["model"] != "deepseek-reasoner" {
		t.Fatalf("model = %v, want deepseek-reasoner", got["model"])
	}
}

func TestAIGoalBuildContextCollectsExecutionContext(t *testing.T) {
	h := NewAIGoalHandler(nil, nil, nil, nil, nil)
	h.accounts = fakeAIGoalAccountStore{
		accounts: []domain.Account{
			{
				Exchange:    domain.ExchangeBinance,
				Label:       "safe",
				Permissions: domain.Permissions{CanTrade: true, CanWithdraw: false},
			},
			{
				Exchange:    domain.ExchangeOKX,
				Label:       "withdraw-enabled",
				Permissions: domain.Permissions{CanTrade: true, CanWithdraw: true},
			},
		},
	}
	h.system = fakeAIGoalSystemStore{
		state:  &domain.SystemState{TradingHalted: true, HaltedReason: "risk review"},
		limits: &domain.PortfolioLimits{UserID: "u1", MaxOpenNotionalUsd: 750, MaxOpenPositionsCount: 4, MaxDailyLossUsd: 45},
	}

	got := h.buildGoalContext(context.Background(), "u1", aiGoalAnalyzeRequest{Symbols: []string{"BTC"}})
	summary := summarizeGoalContext(aiGoalAnalyzeRequest{Symbols: []string{"BTC"}}, got)

	if got.Execution.AccountCount != 2 {
		t.Fatalf("account count = %d, want 2", got.Execution.AccountCount)
	}
	if got.Execution.TradeableAccountCount != 1 {
		t.Fatalf("tradeable account count = %d, want 1", got.Execution.TradeableAccountCount)
	}
	if got.Execution.WithdrawalEnabledAccountCount != 1 {
		t.Fatalf("withdraw-enabled account count = %d, want 1", got.Execution.WithdrawalEnabledAccountCount)
	}
	if !summary.Execution.TradingHalted || summary.Execution.HaltedReason != "risk review" {
		t.Fatalf("summary halt context not filled: %#v", summary.Execution)
	}
	if summary.Execution.PortfolioLimits.MaxOpenNotionalUsd != 750 {
		t.Fatalf("portfolio limits not summarized: %#v", summary.Execution.PortfolioLimits)
	}
}

func TestAIGoalListRuns_503WhenRepoNil(t *testing.T) {
	e := echo.New()
	g := e.Group("/api/v1")
	NewAIGoalHandler(nil, nil, nil, nil, nil).Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ai/goals/runs", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when run repo missing, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAIGoalRunPreviewFromAnalysis(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Horizon:        "2-6 weeks",
		RiskPreference: "conservative",
		ExecutionMode:  "paper",
	}
	analysis := aiGoalAnalysis{
		ID:        "goal_abc",
		CreatedAt: "2026-06-02T08:00:00Z",
		Goal:      "寻找 BTC 低回撤机会",
		Summary:   "先观察舆情再小仓位验证。",
		StrategyDrafts: []aiGoalStrategyDraft{
			{Name: "btca", Symbol: "BTCUSDT"},
			{Name: "etha", Symbol: "ETHUSDT"},
		},
		Context: aiGoalContextSummary{
			Symbols:      []string{"BTC", "ETH"},
			NewsCount:    3,
			MacroCount:   2,
			OnchainCount: 1,
		},
		Execution: aiGoalExecutionPlan{Mode: "paper"},
		AI:        aiGoalMetadata{Status: "ok", Model: "claude-sonnet"},
	}

	preview := goalRunPreviewFromAnalysis(domain.DefaultUserID, analysis, req)

	if preview.ID != "goal_abc" {
		t.Fatalf("preview id = %q", preview.ID)
	}
	if preview.UserID != domain.DefaultUserID {
		t.Fatalf("preview userID = %q", preview.UserID)
	}
	if preview.StrategyDraftCount != 2 {
		t.Fatalf("draft count = %d", preview.StrategyDraftCount)
	}
	if preview.ContextNewsCount != 3 || preview.ContextMacroCount != 2 || preview.ContextOnchainCount != 1 {
		t.Fatalf("context counts not copied: %+v", preview)
	}
	if preview.AIStatus != "ok" || preview.AIModel != "claude-sonnet" {
		t.Fatalf("ai fields not copied: %+v", preview)
	}
	if preview.Horizon != "2-6 weeks" || preview.RiskPreference != "conservative" {
		t.Fatalf("request preferences not copied: %+v", preview)
	}
}

func TestAIGoalRunPreviewSeedsDefaultActions(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "testnet",
	}
	analysis := aiGoalAnalysis{
		ID:        "goal_actions",
		CreatedAt: "2026-06-03T08:00:00Z",
		Goal:      "让 AI 自动分析 BTC 并给出策略",
		Summary:   "先回测再 paper。",
		HumanFactors: []string{
			"FOMO 追涨风险上升",
		},
		StrategyDrafts: []aiGoalStrategyDraft{
			{Name: "btca", Kind: "grid_dca", Symbol: "BTCUSDT"},
		},
		Context: aiGoalContextSummary{
			Symbols:      []string{"BTC"},
			NewsCount:    0,
			MacroCount:   1,
			OnchainCount: 1,
			Notes:        []string{"news: empty"},
		},
		Execution: aiGoalExecutionPlan{Mode: "testnet"},
		AI:        aiGoalMetadata{Status: "ok", Model: "claude-sonnet"},
	}

	preview := goalRunPreviewFromAnalysis(domain.DefaultUserID, analysis, req)

	if len(preview.Actions) != 7 {
		t.Fatalf("actions length = %d, want 7: %#v", len(preview.Actions), preview.Actions)
	}
	assertRunAction(t, preview.Actions, "review", "manual")
	assertRunAction(t, preview.Actions, "data", "blocked")
	assertRunAction(t, preview.Actions, "sentiment_review", "manual")
	assertRunAction(t, preview.Actions, "backtest", "ready")
	assertRunAction(t, preview.Actions, "strategy", "ready")
	paperWatch := findRunAction(t, preview.Actions, "paper_watch")
	if paperWatch.Status != "blocked" {
		t.Fatalf("paper_watch status = %q, want blocked", paperWatch.Status)
	}
	for _, want := range []string{"24-72 小时", "市场风向", "舆论", "人性偏差", "执行摩擦"} {
		if !strings.Contains(paperWatch.Note, want) {
			t.Fatalf("paper_watch note missing %q: %s", want, paperWatch.Note)
		}
	}
	assertRunAction(t, preview.Actions, "gate", "blocked")
}

func TestAIGoalRunPreviewSentimentReviewIncludesWatchSignalAction(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "paper",
	}
	analysis := aiGoalAnalysis{
		ID:        "goal_watch_action",
		CreatedAt: "2026-06-03T08:00:00Z",
		Goal:      "让 AI 自动分析 BTC 并给出策略",
		Summary:   "先观察风向。",
		WatchSignals: []aiGoalWatchSignal{
			{
				Signal:         "ETF inflows accelerate",
				Source:         "news",
				Interpretation: "资金流改善但社媒拥挤",
				Action:         "只允许 paper 观察，不追涨加仓",
			},
		},
		StrategyDrafts: []aiGoalStrategyDraft{
			{Name: "btca", Kind: "grid_dca", Symbol: "BTCUSDT"},
		},
		Context: aiGoalContextSummary{
			Symbols:   []string{"BTC"},
			NewsCount: 1,
		},
		Execution: aiGoalExecutionPlan{Mode: "paper"},
		AI:        aiGoalMetadata{Status: "ok", Model: "claude-sonnet"},
	}

	preview := goalRunPreviewFromAnalysis(domain.DefaultUserID, analysis, req)
	sentimentReview := findRunAction(t, preview.Actions, "sentiment_review")

	if sentimentReview.Status != "manual" {
		t.Fatalf("sentiment_review status = %q, want manual", sentimentReview.Status)
	}
	for _, want := range []string{"ETF inflows accelerate", "资金流改善", "只允许 paper"} {
		if !strings.Contains(sentimentReview.Note, want) {
			t.Fatalf("sentiment_review note missing %q: %s", want, sentimentReview.Note)
		}
	}
}

func findRunAction(t *testing.T, actions []mongostore.AIGoalRunAction, id string) mongostore.AIGoalRunAction {
	t.Helper()
	for _, action := range actions {
		if action.ID == id {
			return action
		}
	}
	t.Fatalf("action %s not found in %#v", id, actions)
	return mongostore.AIGoalRunAction{}
}

func assertRunAction(t *testing.T, actions []mongostore.AIGoalRunAction, id, status string) {
	t.Helper()
	for _, action := range actions {
		if action.ID == id {
			if action.Status != status {
				t.Fatalf("action %s status = %q, want %q", id, action.Status, status)
			}
			if action.UpdatedAt.IsZero() {
				t.Fatalf("action %s missing updatedAt", id)
			}
			return
		}
	}
	t.Fatalf("action %s not found in %#v", id, actions)
}

func TestAIGoalRunActionPatchRejectsInvalidStatus(t *testing.T) {
	_, err := normalizeAIGoalRunActionPatch(
		"backtest",
		aiGoalRunActionPatchRequest{Status: "live"},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("expected invalid status error, got nil")
	}
	if !strings.Contains(err.Error(), "invalid action status") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAIGoalRunActionPatchNormalizesSafeFields(t *testing.T) {
	now := time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC)
	action, err := normalizeAIGoalRunActionPatch(
		" backtest ",
		aiGoalRunActionPatchRequest{
			Status:    "done",
			RelatedID: " run_1 ",
			Href:      " /backtests/run_1 ",
			Note:      " 已发起 AI 草案回测 ",
		},
		now,
	)
	if err != nil {
		t.Fatalf("normalize action patch error = %v", err)
	}
	if action.ID != "backtest" || action.Status != "done" {
		t.Fatalf("action id/status not normalized: %+v", action)
	}
	if action.RelatedID != "run_1" || action.Href != "/backtests/run_1" || action.Note != "已发起 AI 草案回测" {
		t.Fatalf("action optional fields not normalized: %+v", action)
	}
	if !action.UpdatedAt.Equal(now) {
		t.Fatalf("updatedAt = %s, want %s", action.UpdatedAt, now)
	}
}

func TestAIGoalRunActionPatchAllowsPaperWatch(t *testing.T) {
	action, err := normalizeAIGoalRunActionPatch(
		"paper_watch",
		aiGoalRunActionPatchRequest{
			Status:    "manual",
			RelatedID: "btca",
			Href:      "/backtests/run_1",
			Note:      "观察 24-72 小时后再决定测试网。",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("normalize paper watch action error = %v", err)
	}
	if action.ID != "paper_watch" || action.Status != "manual" {
		t.Fatalf("paper watch action not normalized: %+v", action)
	}
	if action.RelatedID != "btca" || action.Href != "/backtests/run_1" {
		t.Fatalf("paper watch action fields not copied: %+v", action)
	}
}

func TestAIGoalRunActionPatchRejectsThinPaperWatchDone(t *testing.T) {
	_, err := normalizeAIGoalRunActionPatch(
		"paper_watch",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Href:   "/backtests/run_1",
			Note:   "Paper 已完成",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("expected thin paper_watch done error, got nil")
	}
	if !strings.Contains(err.Error(), "paper_watch done requires review evidence") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAIGoalRunActionPatchAllowsEvidenceBackedPaperWatchDone(t *testing.T) {
	action, err := normalizeAIGoalRunActionPatch(
		"paper_watch",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Href:   "/backtests/run_1",
			Note:   "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("normalize evidence-backed paper watch done error = %v", err)
	}
	if action.ID != "paper_watch" || action.Status != "done" {
		t.Fatalf("paper watch done not normalized: %+v", action)
	}
}

func TestAIGoalRunActionPatchRejectsThinGateDone(t *testing.T) {
	_, err := normalizeAIGoalRunActionPatch(
		"gate",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Note:   "检查执行闸门 已人工确认完成",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("expected thin gate done error, got nil")
	}
	if !strings.Contains(err.Error(), "gate done requires execution safety evidence") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAIGoalRunActionPatchAllowsEvidenceBackedGateDone(t *testing.T) {
	action, err := normalizeAIGoalRunActionPatch(
		"gate",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Note:   "已确认 kill switch、组合限额、交易闸门和 paper 复盘证据；只允许进入测试网前检查。",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("normalize evidence-backed gate done error = %v", err)
	}
	if action.ID != "gate" || action.Status != "done" {
		t.Fatalf("gate done not normalized: %+v", action)
	}
}

func TestAIGoalRunActionPatchRejectsThinSentimentReviewDone(t *testing.T) {
	_, err := normalizeAIGoalRunActionPatch(
		"sentiment_review",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Href:   "/data-explorer/news",
			Note:   "风向 / 人性复核已完成。",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("expected thin sentiment_review done error, got nil")
	}
	if !strings.Contains(err.Error(), "sentiment_review done requires market and sentiment evidence") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAIGoalRunActionPatchAllowsEvidenceBackedSentimentReviewDone(t *testing.T) {
	action, err := normalizeAIGoalRunActionPatch(
		"sentiment_review",
		aiGoalRunActionPatchRequest{
			Status: "done",
			Href:   "/data-explorer/news",
			Note:   "已复核市场风向、舆论情绪和人性偏差/拥挤度；确认未出现 FOMO 追涨或单边叙事过热，只允许进入 paper 采用前检查。",
		},
		time.Date(2026, 6, 2, 8, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("normalize sentiment review action error = %v", err)
	}
	if action.ID != "sentiment_review" || action.Status != "done" {
		t.Fatalf("sentiment review action not normalized: %+v", action)
	}
	if action.Href != "/data-explorer/news" || action.Note != "已复核市场风向、舆论情绪和人性偏差/拥挤度；确认未出现 FOMO 追涨或单边叙事过热，只允许进入 paper 采用前检查。" {
		t.Fatalf("sentiment review fields not copied: %+v", action)
	}
}

func TestAIGoalOperatorConstraintsNormalize(t *testing.T) {
	got, err := normalizeGoalRequest(aiGoalAnalyzeRequest{
		Goal:                "用 AI 寻找 BTC 的低回撤机会",
		Symbols:             []string{"BTC"},
		BehaviorConstraints: []string{" 避免 FOMO 追涨 ", "连续亏损后暂停", "避免 FOMO 追涨"},
		MarketNarrativeFocus: []string{
			"ETF 资金流",
			"监管消息",
		},
		AvoidScenarios: []string{"高杠杆", "数据缺口时执行", "主网自动下单"},
	})
	if err != nil {
		t.Fatalf("normalizeGoalRequest error = %v", err)
	}
	if want := []string{"避免 FOMO 追涨", "连续亏损后暂停"}; !equalStringSlices(got.BehaviorConstraints, want) {
		t.Fatalf("behavior constraints = %#v, want %#v", got.BehaviorConstraints, want)
	}
	if want := []string{"ETF 资金流", "监管消息"}; !equalStringSlices(got.MarketNarrativeFocus, want) {
		t.Fatalf("market narrative focus = %#v, want %#v", got.MarketNarrativeFocus, want)
	}
	if want := []string{"高杠杆", "数据缺口时执行", "主网自动下单"}; !equalStringSlices(got.AvoidScenarios, want) {
		t.Fatalf("avoid scenarios = %#v, want %#v", got.AvoidScenarios, want)
	}
}

func TestAIGoalNormalizeRequestAddsDefaultOperatorConstraints(t *testing.T) {
	got, err := normalizeGoalRequest(aiGoalAnalyzeRequest{
		Goal:    "用 AI 寻找 BTC 的低回撤机会",
		Symbols: []string{"BTC"},
	})
	if err != nil {
		t.Fatalf("normalizeGoalRequest error = %v", err)
	}
	if want := []string{"避免 FOMO 追涨", "连续亏损后暂停加仓", "市场过热时降低仓位"}; !equalStringSlices(got.BehaviorConstraints, want) {
		t.Fatalf("behavior constraints = %#v, want %#v", got.BehaviorConstraints, want)
	}
	if want := []string{"ETF 资金流", "监管消息", "社媒拥挤度"}; !equalStringSlices(got.MarketNarrativeFocus, want) {
		t.Fatalf("market narrative focus = %#v, want %#v", got.MarketNarrativeFocus, want)
	}
	if want := []string{"高杠杆", "数据缺口时执行", "主网自动下单"}; !equalStringSlices(got.AvoidScenarios, want) {
		t.Fatalf("avoid scenarios = %#v, want %#v", got.AvoidScenarios, want)
	}
}

func TestAIGoalNormalizeRequestCapsUnsafeExecutionModes(t *testing.T) {
	tests := []struct {
		name string
		mode string
		want string
	}{
		{name: "mainnet caps to paper", mode: "mainnet", want: "paper"},
		{name: "testnet caps to paper", mode: "testnet", want: "paper"},
		{name: "paper stays paper", mode: "paper", want: "paper"},
		{name: "observe stays observe", mode: "observe", want: "observe"},
		{name: "unknown caps to paper", mode: "aggressive-live", want: "paper"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeGoalRequest(aiGoalAnalyzeRequest{
				Goal:          "用 AI 寻找 BTC 的低回撤机会",
				Symbols:       []string{"BTC"},
				ExecutionMode: tt.mode,
			})
			if err != nil {
				t.Fatalf("normalizeGoalRequest error = %v", err)
			}
			if got.ExecutionMode != tt.want {
				t.Fatalf("ExecutionMode = %q, want %q", got.ExecutionMode, tt.want)
			}
		})
	}
}

func TestAIGoalNormalizeRequestCapsUnknownRiskPreferences(t *testing.T) {
	tests := []struct {
		name string
		risk string
		want string
	}{
		{name: "conservative stays conservative", risk: "conservative", want: "conservative"},
		{name: "balanced stays balanced", risk: "balanced", want: "balanced"},
		{name: "aggressive stays aggressive", risk: "aggressive", want: "aggressive"},
		{name: "blank caps to balanced", risk: "", want: "balanced"},
		{name: "unknown caps to balanced", risk: "all-in", want: "balanced"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeGoalRequest(aiGoalAnalyzeRequest{
				Goal:           "用 AI 寻找 BTC 的低回撤机会",
				Symbols:        []string{"BTC"},
				RiskPreference: tt.risk,
			})
			if err != nil {
				t.Fatalf("normalizeGoalRequest error = %v", err)
			}
			if got.RiskPreference != tt.want {
				t.Fatalf("RiskPreference = %q, want %q", got.RiskPreference, tt.want)
			}
		})
	}
}

func TestBuildGoalPromptIncludesOperatorConstraints(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:                "用 AI 寻找 BTC 的低回撤机会",
		Symbols:             []string{"BTC"},
		Horizon:             "1-4 weeks",
		RiskPreference:      "balanced",
		ExecutionMode:       "paper",
		BehaviorConstraints: []string{"避免 FOMO 追涨", "连续亏损后暂停"},
		MarketNarrativeFocus: []string{
			"ETF 资金流",
			"社媒拥挤度",
		},
		AvoidScenarios: []string{"高杠杆", "主网自动下单"},
	}

	prompt := buildGoalPrompt(req, aiGoalContext{})

	for _, want := range []string{
		"Operator behavior constraints",
		"避免 FOMO 追涨",
		"Market narrative focus",
		"社媒拥挤度",
		"Avoid scenarios",
		"主网自动下单",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}

func TestParseGoalAIResponseCarriesOperatorConstraints(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:                "用 AI 寻找 BTC 的低回撤机会",
		Symbols:             []string{"BTC"},
		Horizon:             "1-4 weeks",
		RiskPreference:      "balanced",
		ExecutionMode:       "paper",
		BehaviorConstraints: []string{"避免 FOMO 追涨", "连续亏损后暂停"},
		MarketNarrativeFocus: []string{
			"ETF 资金流",
			"社媒拥挤度",
		},
		AvoidScenarios: []string{"高杠杆", "主网自动下单"},
	}
	raw := `{
		"summary": "按约束生成计划。",
		"marketRead": "谨慎看待上涨。",
		"humanFactors": ["避免追涨"],
		"strategyDrafts": [
			{
				"name": "btca",
				"kind": "grid_dca",
				"symbol": "BTCUSDT",
				"thesis": "低回撤验证",
				"params": {"positionLevel": 3},
				"riskCaps": {
					"maxPositionUsd": 100,
					"maxLeverage": 3,
					"dailyLossCapUsd": 20
				}
			}
		],
		"watchSignals": [],
		"execution": {
			"mode": "paper",
			"canAutoExecute": false,
			"nextSteps": ["回测"],
			"safetyGates": ["backtest"]
		}
	}`

	got := parseGoalAIResponse(raw, req, aiGoalContext{}, "")

	if want := []string{"避免 FOMO 追涨", "连续亏损后暂停"}; !equalStringSlices(got.Context.OperatorConstraints.BehaviorConstraints, want) {
		t.Fatalf("behavior constraints = %#v, want %#v", got.Context.OperatorConstraints.BehaviorConstraints, want)
	}
	if want := []string{"ETF 资金流", "社媒拥挤度"}; !equalStringSlices(got.Context.OperatorConstraints.MarketNarrativeFocus, want) {
		t.Fatalf("market narrative focus = %#v, want %#v", got.Context.OperatorConstraints.MarketNarrativeFocus, want)
	}
	if want := []string{"高杠杆", "主网自动下单"}; !equalStringSlices(got.Context.OperatorConstraints.AvoidScenarios, want) {
		t.Fatalf("avoid scenarios = %#v, want %#v", got.Context.OperatorConstraints.AvoidScenarios, want)
	}
}

func TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Goal:                "用 AI 寻找 BTC 的低回撤机会",
		Symbols:             []string{"BTC"},
		Horizon:             "1-4 weeks",
		RiskPreference:      "balanced",
		ExecutionMode:       "paper",
		BehaviorConstraints: []string{"避免 FOMO 追涨", "连续亏损后暂停"},
		MarketNarrativeFocus: []string{
			"ETF 资金流",
			"社媒拥挤度",
		},
		AvoidScenarios: []string{"高杠杆", "主网自动下单"},
	}
	raw := `{
		"summary": "模型给出很稀疏的计划。",
		"marketRead": "需要继续观察。",
		"humanFactors": [],
		"strategyDrafts": [
			{
				"name": "btca",
				"kind": "grid_dca",
				"symbol": "BTCUSDT",
				"thesis": "低回撤验证",
				"params": {"positionLevel": 3},
				"riskCaps": {
					"maxPositionUsd": 100,
					"maxLeverage": 3,
					"dailyLossCapUsd": 20
				}
			}
		],
		"watchSignals": [],
		"execution": {
			"mode": "paper",
			"canAutoExecute": false,
			"nextSteps": ["回测"],
			"safetyGates": ["backtest"]
		}
	}`

	got := parseGoalAIResponse(raw, req, aiGoalContext{}, "")

	for _, want := range []string{"避免 FOMO 追涨", "连续亏损后暂停"} {
		if !containsString(got.HumanFactors, want) {
			t.Fatalf("human factors missing %q: %#v", want, got.HumanFactors)
		}
	}
	for _, want := range []string{"ETF 资金流", "社媒拥挤度"} {
		if !watchSignalsContainFragment(got.WatchSignals, want) {
			t.Fatalf("watch signals missing %q: %#v", want, got.WatchSignals)
		}
	}
	for _, want := range []string{"禁止场景：高杠杆", "禁止场景：主网自动下单"} {
		if !containsString(got.Execution.SafetyGates, want) {
			t.Fatalf("safety gates missing %q: %#v", want, got.Execution.SafetyGates)
		}
		if !containsString(got.StrategyDrafts[0].Blockers, want) {
			t.Fatalf("draft blockers missing %q: %#v", want, got.StrategyDrafts[0].Blockers)
		}
	}
	if want := []string{"避免 FOMO 追涨", "连续亏损后暂停"}; !equalStringSlices(got.Context.OperatorConstraints.BehaviorConstraints, want) {
		t.Fatalf("behavior constraints = %#v, want %#v", got.Context.OperatorConstraints.BehaviorConstraints, want)
	}
	if want := []string{"ETF 资金流", "社媒拥挤度"}; !equalStringSlices(got.Context.OperatorConstraints.MarketNarrativeFocus, want) {
		t.Fatalf("market narrative focus = %#v, want %#v", got.Context.OperatorConstraints.MarketNarrativeFocus, want)
	}
	if want := []string{"高杠杆", "主网自动下单"}; !equalStringSlices(got.Context.OperatorConstraints.AvoidScenarios, want) {
		t.Fatalf("avoid scenarios = %#v, want %#v", got.Context.OperatorConstraints.AvoidScenarios, want)
	}
}
