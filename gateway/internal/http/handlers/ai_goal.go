// ai_goal.go — goal-driven AI strategy analysis.
//
// This endpoint is intentionally upstream of the existing strategy /
// recommendation / execution surfaces. It lets an operator describe a
// money-making objective in natural language, gathers available market
// context, asks the configured AI provider for structured blueprints, and
// returns execution gates. It never creates strategies or submits orders.
package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	cryptosvc "github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
)

const goalAIOutputContract = `{
  "summary": "one paragraph in Chinese",
  "marketRead": "market direction and uncertainty in Chinese",
  "humanFactors": ["behavioral, sentiment, crowding, fear/greed observations"],
  "strategyDrafts": [
    {
      "name": "3-8 char strategy name",
      "kind": "grid_dca|polymarket_event|watch_only",
      "symbol": "BTCUSDT",
      "thesis": "why this strategy fits the goal",
      "params": {"positionLevel": 3, "stopProfitRate": 0.03},
      "riskCaps": {"maxPositionUsd": 100, "maxLeverage": 3, "dailyLossCapUsd": 20},
      "validationPlan": ["backtest", "24-72h paper review evidence", "market direction / sentiment / human-bias / execution-friction review evidence"],
      "executionPlan": ["create strategy draft", "run backtest", "paper observe and review", "no testnet/mainnet promotion before evidence"],
      "blockers": ["missing data, account, or market condition"]
    }
  ],
  "watchSignals": [
    {"signal": "what to watch", "source": "news|macro|onchain|price|human", "interpretation": "why it matters", "action": "what to do"}
  ],
  "execution": {
    "mode": "observe|paper|testnet|mainnet",
    "canAutoExecute": false,
    "nextSteps": ["human review first"],
    "safetyGates": ["risk caps", "backtest", "paper review evidence", "mainnet token"]
  }
}`

var defaultGoalBehaviorConstraints = []string{"避免 FOMO 追涨", "连续亏损后暂停加仓", "市场过热时降低仓位"}
var defaultGoalMarketNarrativeFocus = []string{"ETF 资金流", "监管消息", "社媒拥挤度"}
var defaultGoalAvoidScenarios = []string{"高杠杆", "数据缺口时执行", "主网自动下单"}

// AIGoalHandler wires the goal-agent endpoint.
type AIGoalHandler struct {
	system   aiGoalSystemStore
	accounts aiGoalAccountStore
	options  *mongostore.OptionRepo
	ts       *timescale.Store
	crypto   *cryptosvc.Service
	runs     aiGoalRunStore
	httpPost func(ctx context.Context, endpoint string, headers map[string]string, payload []byte) ([]byte, int, error)
}

type aiGoalRunStore interface {
	Create(ctx context.Context, run *mongostore.AIGoalRunDoc) error
	FindAllForUser(ctx context.Context, userID string, limit int) ([]mongostore.AIGoalRunDoc, error)
	FindByIDForUser(ctx context.Context, userID, id string) (*mongostore.AIGoalRunDoc, error)
	UpsertActionForUser(ctx context.Context, userID, id string, action mongostore.AIGoalRunAction) (*mongostore.AIGoalRunDoc, error)
}

type aiGoalAccountStore interface {
	FindAll(ctx context.Context, userID string) ([]domain.Account, error)
}

type aiGoalSystemStore interface {
	GetAIConfig(ctx context.Context) (*domain.AIConfig, error)
	GetSystemState(ctx context.Context) (*domain.SystemState, error)
	GetPortfolioLimits(ctx context.Context, userID string) (*domain.PortfolioLimits, error)
}

func NewAIGoalHandler(
	system *mongostore.SystemRepo,
	options *mongostore.OptionRepo,
	ts *timescale.Store,
	crypto *cryptosvc.Service,
	runs *mongostore.AIGoalRunRepo,
) *AIGoalHandler {
	h := &AIGoalHandler{options: options, ts: ts, crypto: crypto}
	if system != nil {
		h.system = system
	}
	if runs != nil {
		h.runs = runs
	}
	h.httpPost = defaultGoalHTTPPost
	return h
}

func (h *AIGoalHandler) WithAccountStore(accounts aiGoalAccountStore) *AIGoalHandler {
	h.accounts = accounts
	return h
}

func (h *AIGoalHandler) Register(g *echo.Group) {
	g.GET("/ai/goals/provider-status", h.providerStatus)
	g.POST("/ai/goals/analyze", h.analyze)
	g.GET("/ai/goals/runs", h.listRuns)
	g.GET("/ai/goals/runs/:id", h.findRun)
	g.PATCH("/ai/goals/runs/:id/actions/:actionId", h.patchRunAction)
}

type aiGoalProviderStatusAction struct {
	Kind  string `json:"kind"`
	Label string `json:"label"`
}

type aiGoalProviderStatusResponse struct {
	Status         string                     `json:"status"`
	Tone           string                     `json:"tone"`
	ProviderFamily string                     `json:"providerFamily"`
	ModelFamily    string                     `json:"modelFamily"`
	ProviderLabel  string                     `json:"providerLabel"`
	Model          string                     `json:"model"`
	KeyConfigured  bool                       `json:"keyConfigured"`
	Source         string                     `json:"source"`
	PrimaryHref    string                     `json:"primaryHref"`
	PrimaryAction  aiGoalProviderStatusAction `json:"primaryAction"`
	Summary        string                     `json:"summary"`
	NextActions    []string                   `json:"nextActions"`
}

type aiGoalAnalyzeRequest struct {
	Goal                 string   `json:"goal"`
	Symbols              []string `json:"symbols"`
	Horizon              string   `json:"horizon"`
	RiskPreference       string   `json:"riskPreference"`
	ExecutionMode        string   `json:"executionMode"`
	BehaviorConstraints  []string `json:"behaviorConstraints"`
	MarketNarrativeFocus []string `json:"marketNarrativeFocus"`
	AvoidScenarios       []string `json:"avoidScenarios"`
}

type aiGoalContext struct {
	News               []timescale.NewsItem   `json:"news"`
	Macro              []timescale.MacroPoint `json:"macro"`
	Onchain            []timescale.OnchainPoint
	ExistingStrategies []domain.Option `json:"existingStrategies"`
	RecentRuns         []mongostore.AIGoalRunDoc
	Execution          aiGoalExecutionContext
	Notes              []string `json:"notes"`
}

type aiGoalExecutionContext struct {
	AccountCount                  int                    `json:"accountCount"`
	TradeableAccountCount         int                    `json:"tradeableAccountCount"`
	WithdrawalEnabledAccountCount int                    `json:"withdrawalEnabledAccountCount"`
	TradingHalted                 bool                   `json:"tradingHalted"`
	HaltedReason                  string                 `json:"haltedReason,omitempty"`
	PortfolioLimits               domain.PortfolioLimits `json:"portfolioLimits"`
}

func (h *AIGoalHandler) providerStatus(c echo.Context) error {
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ai config store not configured")
	}
	persisted, err := h.system.GetAIConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ai config: "+err.Error())
	}
	return c.JSON(http.StatusOK, providerStatusFromEffectiveAIConfig(effectiveAIConfig(persisted)))
}

func providerStatusFromEffectiveAIConfig(eff AIConfigEffective) aiGoalProviderStatusResponse {
	modelFamily := strings.ToLower(strings.TrimSpace(eff.ModelFamily))
	providerFamily := "anthropic"
	providerLabel := "Anthropic"
	model := strings.TrimSpace(eff.AnthropicPrimaryModel)
	keyConfigured := eff.AnthropicAPIKeyConfigured

	switch modelFamily {
	case "openai":
		providerFamily = "openai"
		providerLabel = "OpenAI"
		model = strings.TrimSpace(eff.OpenAIPrimaryModel)
		keyConfigured = eff.OpenAIAPIKeyConfigured
	case "deepseek":
		providerFamily = "deepseek"
		providerLabel = "DeepSeek"
		model = strings.TrimSpace(eff.DeepseekPrimaryModel)
		keyConfigured = eff.DeepseekAPIKeyConfigured
	default:
		modelFamily = "claude"
	}
	if model == "" {
		model = "未设置"
	}

	out := aiGoalProviderStatusResponse{
		Status:         "blocked",
		Tone:           "warning",
		ProviderFamily: providerFamily,
		ModelFamily:    modelFamily,
		ProviderLabel:  providerLabel,
		Model:          model,
		KeyConfigured:  keyConfigured,
		Source:         eff.Source,
		PrimaryHref:    "/settings/ai",
		PrimaryAction: aiGoalProviderStatusAction{
			Kind:  "open_link",
			Label: "配置真实 AI",
		},
		Summary: fmt.Sprintf("当前启用 %s，但 API key 未配置。AI Money 会退回本地 fallback，无法完成真实市场风向、舆论和策略分析。", providerLabel),
		NextActions: []string{
			"打开 AI 设置并填写当前 provider 的 API key。",
			"保存后点击测试连接。",
			"连接正常后回到 AI Money 重新分析目标。",
		},
	}
	if keyConfigured {
		out.Status = "ready"
		out.Tone = "success"
		out.PrimaryHref = "/ai-money?intent=rerun_ai"
		out.PrimaryAction = aiGoalProviderStatusAction{
			Kind:  "open_link",
			Label: "使用真实 AI 分析",
		}
		out.Summary = fmt.Sprintf("%s 已配置 API key，主模型 %s。AI Money 可以调用真实 AI 分析目标、市场风向、舆论和人性约束。", providerLabel, model)
		out.NextActions = []string{
			"在 AI Money 输入或采用自动补全目标。",
			"让 AI 生成策略蓝图并批量回测。",
			"通过后只进入 paper 观察，不直接主网交易。",
		}
	}
	return out
}

type aiGoalOperatorConstraints struct {
	BehaviorConstraints  []string `json:"behaviorConstraints"`
	MarketNarrativeFocus []string `json:"marketNarrativeFocus"`
	AvoidScenarios       []string `json:"avoidScenarios"`
}

type aiGoalContextSummary struct {
	Symbols                 []string                  `json:"symbols"`
	NewsCount               int                       `json:"newsCount"`
	MacroCount              int                       `json:"macroCount"`
	OnchainCount            int                       `json:"onchainCount"`
	ExistingStrategyCount   int                       `json:"existingStrategyCount"`
	ExistingStrategyNames   []string                  `json:"existingStrategyNames"`
	MarketContextHighlights []aiGoalContextHighlight  `json:"marketContextHighlights"`
	RecentRunCount          int                       `json:"recentRunCount"`
	RecentRunSummaries      []aiGoalRecentRunSummary  `json:"recentRunSummaries"`
	Execution               aiGoalExecutionContext    `json:"execution"`
	OperatorConstraints     aiGoalOperatorConstraints `json:"operatorConstraints"`
	Notes                   []string                  `json:"notes"`
}

type aiGoalContextHighlight struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Label  string `json:"label"`
	Detail string `json:"detail"`
	At     string `json:"at,omitempty"`
}

type aiGoalRecentRunSummary struct {
	ID                    string   `json:"id"`
	Goal                  string   `json:"goal"`
	Summary               string   `json:"summary"`
	AIStatus              string   `json:"aiStatus"`
	ExecutionMode         string   `json:"executionMode"`
	StrategyDraftCount    int      `json:"strategyDraftCount"`
	ContextNewsCount      int      `json:"contextNewsCount"`
	ContextMacroCount     int      `json:"contextMacroCount"`
	ContextOnchainCount   int      `json:"contextOnchainCount"`
	MarketRead            string   `json:"marketRead,omitempty"`
	HumanFactors          []string `json:"humanFactors,omitempty"`
	WatchSignalCount      int      `json:"watchSignalCount,omitempty"`
	WatchSignalHighlights []string `json:"watchSignalHighlights,omitempty"`
	ActionCount           int      `json:"actionCount"`
	DoneActionCount       int      `json:"doneActionCount"`
	ReadyActionCount      int      `json:"readyActionCount"`
	ManualActionCount     int      `json:"manualActionCount"`
	BlockedActionCount    int      `json:"blockedActionCount"`
	OpenActionCount       int      `json:"openActionCount"`
}

type aiGoalAnalysis struct {
	ID             string                `json:"id"`
	CreatedAt      string                `json:"createdAt"`
	Goal           string                `json:"goal"`
	Summary        string                `json:"summary"`
	MarketRead     string                `json:"marketRead"`
	HumanFactors   []string              `json:"humanFactors"`
	StrategyDrafts []aiGoalStrategyDraft `json:"strategyDrafts"`
	WatchSignals   []aiGoalWatchSignal   `json:"watchSignals"`
	Execution      aiGoalExecutionPlan   `json:"execution"`
	Context        aiGoalContextSummary  `json:"context"`
	AI             aiGoalMetadata        `json:"ai"`
}

type aiGoalStrategyDraft struct {
	Name           string             `json:"name"`
	Kind           string             `json:"kind"`
	Symbol         string             `json:"symbol"`
	Thesis         string             `json:"thesis"`
	Params         map[string]any     `json:"params"`
	RiskCaps       map[string]float64 `json:"riskCaps"`
	ValidationPlan []string           `json:"validationPlan"`
	ExecutionPlan  []string           `json:"executionPlan"`
	Blockers       []string           `json:"blockers"`
}

type aiGoalWatchSignal struct {
	Signal         string `json:"signal"`
	Source         string `json:"source"`
	Interpretation string `json:"interpretation"`
	Action         string `json:"action"`
}

type aiGoalExecutionPlan struct {
	Mode           string   `json:"mode"`
	CanAutoExecute bool     `json:"canAutoExecute"`
	NextSteps      []string `json:"nextSteps"`
	SafetyGates    []string `json:"safetyGates"`
}

type aiGoalMetadata struct {
	Status      string `json:"status"`
	Family      string `json:"family"`
	Model       string `json:"model"`
	BaseURL     string `json:"baseUrl"`
	LatencyMs   int64  `json:"latencyMs"`
	Error       string `json:"error,omitempty"`
	ContextHash string `json:"contextHash,omitempty"`
}

type aiGoalRunActionPatchRequest struct {
	Status    string `json:"status"`
	RelatedID string `json:"relatedId"`
	Href      string `json:"href"`
	Note      string `json:"note"`
}

func (h *AIGoalHandler) analyze(c echo.Context) error {
	if h.system == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "system repo not configured")
	}
	var body aiGoalAnalyzeRequest
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	req, err := normalizeGoalRequest(body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 35*time.Second)
	defer cancel()
	userID := gwmw.FromEcho(c)
	goalCtx := h.buildGoalContext(ctx, userID, req)
	analysis := h.runGoalAI(ctx, req, goalCtx)
	if h.runs != nil {
		run := goalRunPreviewFromAnalysis(userID, analysis, req)
		run.Analysis = analysisMap(analysis)
		if err := h.runs.Create(ctx, &run); err != nil {
			analysis.Context.Notes = append(analysis.Context.Notes, "ai goal run persistence: "+err.Error())
		}
	}
	return c.JSON(http.StatusOK, analysis)
}

func (h *AIGoalHandler) listRuns(c echo.Context) error {
	if h.runs == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ai goal run repo not configured")
	}
	limit := 20
	if raw := c.QueryParam("limit"); raw != "" {
		var parsed int
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	docs, err := h.runs.FindAllForUser(c.Request().Context(), gwmw.FromEcho(c), limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	for i := range docs {
		docs[i].Analysis = nil
	}
	return c.JSON(http.StatusOK, docs)
}

func (h *AIGoalHandler) findRun(c echo.Context) error {
	if h.runs == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ai goal run repo not configured")
	}
	doc, err := h.runs.FindByIDForUser(c.Request().Context(), gwmw.FromEcho(c), c.Param("id"))
	if errors.Is(err, mongostore.ErrAIGoalRunNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "ai goal run not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, doc)
}

func (h *AIGoalHandler) patchRunAction(c echo.Context) error {
	if h.runs == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ai goal run repo not configured")
	}
	var body aiGoalRunActionPatchRequest
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	action, err := normalizeAIGoalRunActionPatch(c.Param("actionId"), body, time.Now().UTC())
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	doc, err := h.runs.UpsertActionForUser(
		c.Request().Context(),
		gwmw.FromEcho(c),
		c.Param("id"),
		action,
	)
	if errors.Is(err, mongostore.ErrAIGoalRunNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "ai goal run not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, doc)
}

func normalizeAIGoalRunActionPatch(
	actionID string,
	in aiGoalRunActionPatchRequest,
	now time.Time,
) (mongostore.AIGoalRunAction, error) {
	out := mongostore.AIGoalRunAction{
		ID:        strings.TrimSpace(actionID),
		Status:    strings.TrimSpace(in.Status),
		RelatedID: strings.TrimSpace(in.RelatedID),
		Href:      strings.TrimSpace(in.Href),
		Note:      strings.TrimSpace(in.Note),
		UpdatedAt: now,
	}
	if out.ID == "" {
		return out, errors.New("action id required")
	}
	if !validAIGoalActionID(out.ID) {
		return out, errors.New("invalid action id")
	}
	if !validAIGoalActionStatus(out.Status) {
		return out, errors.New("invalid action status")
	}
	if len(out.RelatedID) > 200 {
		return out, errors.New("relatedId too long")
	}
	if len(out.Href) > 500 {
		return out, errors.New("href too long")
	}
	if out.Href != "" && (!strings.HasPrefix(out.Href, "/") || strings.HasPrefix(out.Href, "//")) {
		return out, errors.New("href must be a relative path")
	}
	if len(out.Note) > 500 {
		return out, errors.New("note too long")
	}
	if out.ID == "paper_watch" && out.Status == "done" && !paperWatchDoneEvidenceComplete(out.Note) {
		return out, errors.New("paper_watch done requires review evidence")
	}
	if out.ID == "sentiment_review" && out.Status == "done" && !sentimentReviewDoneEvidenceComplete(out.Note) {
		return out, errors.New("sentiment_review done requires market and sentiment evidence")
	}
	if out.ID == "gate" && out.Status == "done" && !gateDoneEvidenceComplete(out.Note) {
		return out, errors.New("gate done requires execution safety evidence")
	}
	return out, nil
}

func paperWatchDoneEvidenceComplete(note string) bool {
	value := strings.ToLower(strings.TrimSpace(note))
	if value == "" {
		return false
	}
	groups := [][]string{
		{"24-72", "24h", "72h", "观察"},
		{"市场风向", "market"},
		{"舆论", "sentiment", "情绪"},
		{"人性偏差", "fomo", "behavior"},
		{"执行摩擦", "滑点", "friction"},
	}
	for _, group := range groups {
		if !containsAnyFolded(value, group) {
			return false
		}
	}
	return true
}

func sentimentReviewDoneEvidenceComplete(note string) bool {
	value := strings.ToLower(strings.TrimSpace(note))
	if value == "" {
		return false
	}
	groups := [][]string{
		{"市场风向", "market"},
		{"舆论", "sentiment", "情绪"},
		{"人性偏差", "拥挤", "fomo", "behavior", "crowding"},
	}
	for _, group := range groups {
		if !containsAnyFolded(value, group) {
			return false
		}
	}
	return true
}

func gateDoneEvidenceComplete(note string) bool {
	value := strings.ToLower(strings.TrimSpace(note))
	if value == "" {
		return false
	}
	groups := [][]string{
		{"kill switch", "kill-switch", "停机", "熔断"},
		{"组合限额", "portfolio limit", "portfolio cap", "限额"},
		{"交易闸门", "execution gate", "trading gate", "闸门"},
		{"paper 复盘证据", "paper review evidence", "paper evidence"},
	}
	for _, group := range groups {
		if !containsAnyFolded(value, group) {
			return false
		}
	}
	return true
}

func containsAnyFolded(value string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(value, strings.ToLower(needle)) {
			return true
		}
	}
	return false
}

func validAIGoalActionID(id string) bool {
	switch id {
	case "review", "data", "sentiment_review", "backtest", "strategy", "paper_watch", "gate", "refresh_context":
		return true
	default:
		return false
	}
}

func validAIGoalActionStatus(status string) bool {
	switch status {
	case "done", "ready", "manual", "blocked":
		return true
	default:
		return false
	}
}

func normalizeGoalRequest(in aiGoalAnalyzeRequest) (aiGoalAnalyzeRequest, error) {
	out := aiGoalAnalyzeRequest{
		Goal:                 strings.TrimSpace(in.Goal),
		Horizon:              strings.TrimSpace(in.Horizon),
		RiskPreference:       safeGoalRiskPreference(in.RiskPreference),
		ExecutionMode:        safeRequestedGoalExecutionMode(in.ExecutionMode),
		BehaviorConstraints:  normalizeGoalTextList(in.BehaviorConstraints, 8),
		MarketNarrativeFocus: normalizeGoalTextList(in.MarketNarrativeFocus, 8),
		AvoidScenarios:       normalizeGoalTextList(in.AvoidScenarios, 8),
	}
	if out.Goal == "" {
		return out, errors.New("goal required")
	}
	if len(out.Goal) > 2000 {
		return out, errors.New("goal too long")
	}
	if out.Horizon == "" {
		out.Horizon = "1-4 weeks"
	}
	if len(out.BehaviorConstraints) == 0 {
		out.BehaviorConstraints = normalizeGoalTextList(defaultGoalBehaviorConstraints, 8)
	}
	if len(out.MarketNarrativeFocus) == 0 {
		out.MarketNarrativeFocus = normalizeGoalTextList(defaultGoalMarketNarrativeFocus, 8)
	}
	if len(out.AvoidScenarios) == 0 {
		out.AvoidScenarios = normalizeGoalTextList(defaultGoalAvoidScenarios, 8)
	}
	seen := map[string]bool{}
	for _, s := range in.Symbols {
		t := strings.ToUpper(strings.TrimSpace(s))
		t = strings.TrimSuffix(t, "/USDT")
		t = strings.TrimSuffix(t, "USDT")
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out.Symbols = append(out.Symbols, t)
		if len(out.Symbols) >= 8 {
			break
		}
	}
	if len(out.Symbols) == 0 {
		out.Symbols = []string{"BTC", "ETH"}
	}
	return out, nil
}

func safeGoalRiskPreference(riskPreference string) string {
	switch strings.ToLower(strings.TrimSpace(riskPreference)) {
	case "conservative":
		return "conservative"
	case "balanced":
		return "balanced"
	case "aggressive":
		return "aggressive"
	default:
		return "balanced"
	}
}

func safeRequestedGoalExecutionMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "observe":
		return "observe"
	case "paper", "":
		return "paper"
	default:
		return "paper"
	}
}

func normalizeGoalTextList(values []string, limit int) []string {
	if limit <= 0 {
		limit = 8
	}
	seen := map[string]bool{}
	capacity := len(values)
	if capacity > limit {
		capacity = limit
	}
	out := make([]string, 0, capacity)
	for _, value := range values {
		v := strings.TrimSpace(value)
		if v == "" || seen[v] {
			continue
		}
		if len(v) > 120 {
			v = v[:120]
		}
		seen[v] = true
		out = append(out, v)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func (h *AIGoalHandler) buildGoalContext(ctx context.Context, userID string, req aiGoalAnalyzeRequest) aiGoalContext {
	out := aiGoalContext{Notes: []string{}}
	if h.options == nil {
		out.Notes = append(out.Notes, "strategy repo not configured")
	} else if rows, err := h.options.FindAll(ctx, userID); err != nil {
		out.Notes = append(out.Notes, "strategies: "+err.Error())
	} else {
		out.ExistingStrategies = rows
	}
	if h.runs != nil {
		if rows, err := h.runs.FindAllForUser(ctx, userID, 5); err != nil {
			out.Notes = append(out.Notes, "ai goal memory: "+err.Error())
		} else {
			for _, row := range rows {
				out.RecentRuns = append(out.RecentRuns, row)
			}
		}
	}
	h.fillGoalExecutionContext(ctx, userID, &out)
	if h.ts == nil {
		out.Notes = append(out.Notes, "timescale not configured; market context limited")
		return out
	}
	sinceNews := time.Now().UTC().Add(-72 * time.Hour)
	newsSymbols := make([]string, 0, len(req.Symbols)*2)
	for _, s := range req.Symbols {
		newsSymbols = append(newsSymbols, s, s+"USDT")
	}
	if rows, err := h.ts.QueryNews(ctx, newsSymbols, sinceNews, 12); err != nil {
		out.Notes = append(out.Notes, "news: "+err.Error())
	} else {
		out.News = rows
	}
	now := time.Now().UTC()
	for _, pair := range [][2]string{
		{"fred", "CPIAUCSL"},
		{"fred", "FEDFUNDS"},
		{"fred", "M2SL"},
	} {
		rows, err := h.ts.QueryMacro(ctx, pair[0], pair[1], now.AddDate(-5, 0, 0), now.Add(24*time.Hour), 5000)
		if err != nil {
			out.Notes = append(out.Notes, "macro "+pair[1]+": "+err.Error())
			continue
		}
		if len(rows) > 0 {
			out.Macro = append(out.Macro, rows[len(rows)-1])
		}
	}
	for _, spec := range onchainSpecsForSymbols(req.Symbols) {
		rows, err := h.ts.QueryOnchain(ctx, spec.chain, spec.metric, now.AddDate(0, -3, 0), now.Add(24*time.Hour), 5000)
		if err != nil {
			out.Notes = append(out.Notes, "onchain "+spec.chain+"."+spec.metric+": "+err.Error())
			continue
		}
		if len(rows) > 0 {
			out.Onchain = append(out.Onchain, rows[len(rows)-1])
		}
	}
	return out
}

func (h *AIGoalHandler) fillGoalExecutionContext(ctx context.Context, userID string, out *aiGoalContext) {
	if out == nil {
		return
	}
	if h.accounts != nil {
		accounts, err := h.accounts.FindAll(ctx, userID)
		if err != nil {
			out.Notes = append(out.Notes, "accounts: "+err.Error())
		} else {
			out.Execution.AccountCount = len(accounts)
			for _, account := range accounts {
				if account.Permissions.CanWithdraw {
					out.Execution.WithdrawalEnabledAccountCount++
				}
				if account.Permissions.CanTrade && !account.Permissions.CanWithdraw {
					out.Execution.TradeableAccountCount++
				}
			}
		}
	}
	if h.system == nil {
		return
	}
	state, err := h.system.GetSystemState(ctx)
	if err != nil {
		out.Notes = append(out.Notes, "system state: "+err.Error())
	} else if state != nil {
		out.Execution.TradingHalted = state.TradingHalted
		out.Execution.HaltedReason = state.HaltedReason
	}
	limits, err := h.system.GetPortfolioLimits(ctx, userID)
	if err != nil {
		out.Notes = append(out.Notes, "portfolio limits: "+err.Error())
	} else if limits != nil {
		out.Execution.PortfolioLimits = *limits
	}
}

type onchainSpec struct {
	chain  string
	metric string
}

func onchainSpecsForSymbols(symbols []string) []onchainSpec {
	specs := []onchainSpec{}
	seen := map[string]bool{}
	add := func(chain, metric string) {
		key := chain + "." + metric
		if !seen[key] {
			seen[key] = true
			specs = append(specs, onchainSpec{chain: chain, metric: metric})
		}
	}
	for _, s := range symbols {
		switch strings.ToUpper(s) {
		case "BTC", "BTCUSDT":
			add("btc", "hash_rate")
		case "ETH", "ETHUSDT":
			add("eth", "eth_supply")
		}
	}
	return specs
}

func (h *AIGoalHandler) runGoalAI(ctx context.Context, req aiGoalAnalyzeRequest, goalCtx aiGoalContext) aiGoalAnalysis {
	persisted, err := h.system.GetAIConfig(ctx)
	if err != nil {
		return fallbackGoalAnalysis(req, goalCtx, "ai config: "+err.Error())
	}
	eff := effectiveAIConfig(persisted)
	family := strings.ToLower(strings.TrimSpace(eff.ModelFamily))
	if family == "" {
		family = "claude"
	}
	key, baseURL, model, defaultBaseURL := resolveGoalProviderConfig(h.crypto, family, persisted, eff)
	if key == "" {
		return fallbackGoalAnalysis(req, goalCtx, "AI provider key not configured")
	}
	systemPrompt := goalAgentSystemPrompt()
	userPrompt := buildGoalPrompt(req, goalCtx)
	endpoint, hdrs, payload, err := buildGoalAIRequest(family, baseURL, defaultBaseURL, model, key, systemPrompt, userPrompt)
	if err != nil {
		return fallbackGoalAnalysis(req, goalCtx, err.Error())
	}
	start := time.Now()
	body, statusCode, err := h.httpPost(ctx, endpoint, hdrs, payload)
	latency := time.Since(start).Milliseconds()
	if err == nil && family == "openai" && shouldRetryOpenAIChatCompletion(statusCode, body) {
		chatEndpoint, chatHdrs, chatPayload, chatErr := buildGoalOpenAIChatCompletionRequest(baseURL, defaultBaseURL, model, key, systemPrompt, userPrompt)
		if chatErr == nil {
			chatBody, chatStatusCode, chatPostErr := h.httpPost(ctx, chatEndpoint, chatHdrs, chatPayload)
			if chatPostErr == nil && chatStatusCode >= 200 && chatStatusCode < 300 {
				endpoint = chatEndpoint
				body = chatBody
				statusCode = chatStatusCode
			}
		}
		latency = time.Since(start).Milliseconds()
	}
	if err != nil {
		out := fallbackGoalAnalysis(req, goalCtx, redactKey(err.Error(), key))
		out.AI.Family = family
		out.AI.Model = model
		out.AI.BaseURL = baseOrigin(endpoint)
		out.AI.LatencyMs = latency
		return out
	}
	if statusCode < 200 || statusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		if len(msg) > 200 {
			msg = msg[:200] + "…"
		}
		out := fallbackGoalAnalysis(req, goalCtx, redactKey(fmt.Sprintf("AI HTTP %d: %s", statusCode, msg), key))
		out.AI.Family = family
		out.AI.Model = model
		out.AI.BaseURL = baseOrigin(endpoint)
		out.AI.LatencyMs = latency
		return out
	}
	text, err := extractGoalAIText(family, body)
	if err != nil {
		out := fallbackGoalAnalysis(req, goalCtx, err.Error())
		out.AI.Family = family
		out.AI.Model = model
		out.AI.BaseURL = baseOrigin(endpoint)
		out.AI.LatencyMs = latency
		return out
	}
	out := parseGoalAIResponse(text, req, goalCtx, "")
	out.AI.Status = "ok"
	out.AI.Family = family
	out.AI.Model = model
	out.AI.BaseURL = baseOrigin(endpoint)
	out.AI.LatencyMs = latency
	return out
}

func goalAgentSystemPrompt() string {
	return "You are the finance_next goal agent. Given a user's money-making objective, analyze market data, sentiment, crowd psychology, human behavior, and execution constraints. Return JSON only. Never promise profit. Never bypass risk gates. Output shape:\n" + goalAIOutputContract
}

func buildGoalPrompt(req aiGoalAnalyzeRequest, ctx aiGoalContext) string {
	var b strings.Builder
	b.WriteString("User goal:\n")
	b.WriteString(req.Goal)
	b.WriteString("\n\nPreferences:\n")
	fmt.Fprintf(&b, "- symbols: %s\n", strings.Join(req.Symbols, ", "))
	fmt.Fprintf(&b, "- horizon: %s\n", req.Horizon)
	fmt.Fprintf(&b, "- risk preference: %s\n", req.RiskPreference)
	fmt.Fprintf(&b, "- requested execution mode: %s\n", req.ExecutionMode)
	writeGoalPromptList(&b, "Operator behavior constraints", req.BehaviorConstraints)
	writeGoalPromptList(&b, "Market narrative focus", req.MarketNarrativeFocus)
	writeGoalPromptList(&b, "Avoid scenarios", req.AvoidScenarios)
	b.WriteString("\nRequired reasoning dimensions:\n")
	b.WriteString("- market sentiment\n")
	b.WriteString("- human psychology: fear, greed, crowding, reflexivity, narrative risk\n")
	b.WriteString("- macro backdrop\n")
	b.WriteString("- on-chain signals when relevant\n")
	b.WriteString("- existing strategy overlap and execution gates\n")

	b.WriteString("\nEvidence-gated execution rules:\n")
	b.WriteString("- requested testnet/mainnet is an upper bound, not permission.\n")
	b.WriteString("- Before testnet, require backtest plus 24-72h paper review evidence.\n")
	b.WriteString("- paper review evidence must cover market direction, sentiment/crowding, human bias, execution friction/slippage, and drawdown/profit behavior.\n")
	b.WriteString("- thin paper_watch done notes remain unresolved; require a concrete review note before testnet.\n")
	b.WriteString("- mainnet still requires portfolio limits, kill switch, admin token gate, and explicit human confirmation.\n")

	b.WriteString("\nExecution readiness:\n")
	fmt.Fprintf(&b, "- tradeableAccounts=%d/%d\n", ctx.Execution.TradeableAccountCount, ctx.Execution.AccountCount)
	fmt.Fprintf(&b, "- withdrawEnabledAccounts=%d\n", ctx.Execution.WithdrawalEnabledAccountCount)
	fmt.Fprintf(&b, "- tradingHalted=%t\n", ctx.Execution.TradingHalted)
	if ctx.Execution.HaltedReason != "" {
		fmt.Fprintf(&b, "- haltedReason=%s\n", ctx.Execution.HaltedReason)
	}
	limits := ctx.Execution.PortfolioLimits
	fmt.Fprintf(&b, "- portfolioLimits maxOpenNotionalUsd=%.0f maxOpenPositionsCount=%d maxDailyLossUsd=%.0f\n",
		limits.MaxOpenNotionalUsd, limits.MaxOpenPositionsCount, limits.MaxDailyLossUsd)
	if ctx.Execution.TradeableAccountCount == 0 {
		b.WriteString("- execution blocker: no account with trade permission and withdraw disabled\n")
	}
	if ctx.Execution.TradingHalted {
		b.WriteString("- execution blocker: global trading halt is active\n")
	}

	b.WriteString("\nRecent news:\n")
	if len(ctx.News) == 0 {
		b.WriteString("- no recent news rows available\n")
	}
	for _, n := range ctx.News {
		fmt.Fprintf(&b, "- [%s] sentiment=%+.2f source=%s symbols=%s title=%s\n",
			n.Time.UTC().Format(time.RFC3339), n.Sentiment, n.Source, strings.Join(n.Symbols, ","), n.Title)
	}

	b.WriteString("\nMacro snapshot:\n")
	if len(ctx.Macro) == 0 {
		b.WriteString("- no macro rows available\n")
	}
	for _, m := range ctx.Macro {
		fmt.Fprintf(&b, "- %s.%s=%v %s @ %s\n", m.Source, m.Code, m.Value, m.Unit, m.Time.UTC().Format(time.RFC3339))
	}

	b.WriteString("\nOn-chain snapshot:\n")
	if len(ctx.Onchain) == 0 {
		b.WriteString("- no on-chain rows available\n")
	}
	for _, o := range ctx.Onchain {
		fmt.Fprintf(&b, "- %s.%s.%s=%v @ %s\n", o.Source, o.Chain, o.Metric, o.Value, o.Time.UTC().Format(time.RFC3339))
	}

	b.WriteString("\nExisting strategies:\n")
	if len(ctx.ExistingStrategies) == 0 {
		b.WriteString("- none\n")
	}
	for _, s := range ctx.ExistingStrategies {
		live := "off"
		if s.Live != nil && s.Live.Enabled {
			live = string(s.Live.Mode)
		}
		fmt.Fprintf(&b, "- %s symbol=%s leverage=%dx live=%s version=%d\n",
			s.Name, s.ExecSymbol, s.PositionLevel, live, s.CurrentVersion)
	}

	writeRecentGoalRunMemory(&b, ctx.RecentRuns)

	if len(ctx.Notes) > 0 {
		b.WriteString("\nContext gaps / data source notes:\n")
		for _, n := range ctx.Notes {
			fmt.Fprintf(&b, "- %s\n", n)
		}
	}

	b.WriteString("\nReturn strict JSON only. Do not include markdown fences.")
	return b.String()
}

func writeRecentGoalRunMemory(b *strings.Builder, runs []mongostore.AIGoalRunDoc) {
	b.WriteString("\nRecent AI goal memory:\n")
	if len(runs) == 0 {
		b.WriteString("- none\n")
		return
	}
	b.WriteString("Recent action handoff rules:\n")
	b.WriteString("- done actions are evidence; do not ask the user to repeat them unless new contradictory data appears.\n")
	b.WriteString("- manual, ready, or blocked actions are unresolved handoff items; continue, unblock, or invalidate them explicitly.\n")
	b.WriteString("- Do not promote to testnet or mainnet while sentiment_review or paper_watch is unresolved.\n")
	b.WriteString("- paper_watch done is only evidence when the note records 24-72h market/sentiment/human/execution-friction review; thin done notes remain unresolved.\n")
	for _, run := range runs {
		summary := compactGoalPromptText(run.Summary, 180)
		goal := compactGoalPromptText(run.Goal, 120)
		created := "unknown"
		if !run.CreatedAt.IsZero() {
			created = run.CreatedAt.UTC().Format(time.RFC3339)
		}
		counts := summarizeGoalActionStatuses(run.Actions)
		fmt.Fprintf(
			b,
			"- id=%s created=%s goal=%s symbols=%s ai=%s mode=%s drafts=%d context=%d/%d/%d summary=%s\n",
			run.ID,
			created,
			goal,
			strings.Join(run.Symbols, ","),
			run.AIStatus,
			run.ExecutionMode,
			run.StrategyDraftCount,
			run.ContextNewsCount,
			run.ContextMacroCount,
			run.ContextOnchainCount,
			summary,
		)
		fmt.Fprintf(
			b,
			"  run=%s actionHandoff unresolved=%d done=%d ready=%d manual=%d blocked=%d\n",
			run.ID,
			counts.Open,
			counts.Done,
			counts.Ready,
			counts.Manual,
			counts.Blocked,
		)
		marketRead := goalAnalysisString(run.Analysis, "marketRead", 160)
		humanFactors := goalAnalysisStringList(run.Analysis, "humanFactors", 3)
		watchSignals := goalAnalysisWatchSignalHighlights(run.Analysis, 3)
		if marketRead != "" || len(humanFactors) > 0 || len(watchSignals) > 0 {
			fmt.Fprintf(
				b,
				"  run=%s marketMemory read=%s human=%s watch=%s\n",
				run.ID,
				marketRead,
				strings.Join(humanFactors, " | "),
				strings.Join(watchSignals, " | "),
			)
		}
		for i, action := range run.Actions {
			if i >= 5 {
				break
			}
			note := compactGoalPromptText(action.Note, 120)
			fmt.Fprintf(
				b,
				"  action=%s status=%s related=%s note=%s\n",
				action.ID,
				action.Status,
				action.RelatedID,
				note,
			)
			if isDetailedGoalHandoffAction(action.ID) && isUnresolvedGoalAction(action.Status) {
				detail := compactGoalPromptText(action.Note, 360)
				if detail != "" {
					fmt.Fprintf(
						b,
						"  handoffDetail=%s status=%s related=%s detail=%s\n",
						action.ID,
						action.Status,
						action.RelatedID,
						detail,
					)
				}
			}
		}
	}
}

type aiGoalActionStatusCounts struct {
	Done    int
	Ready   int
	Manual  int
	Blocked int
	Open    int
}

func summarizeGoalActionStatuses(actions []mongostore.AIGoalRunAction) aiGoalActionStatusCounts {
	var counts aiGoalActionStatusCounts
	for _, action := range actions {
		switch strings.ToLower(strings.TrimSpace(action.Status)) {
		case "done":
			counts.Done++
		case "ready":
			counts.Ready++
			counts.Open++
		case "manual":
			counts.Manual++
			counts.Open++
		case "blocked":
			counts.Blocked++
			counts.Open++
		case "":
		default:
			counts.Open++
		}
	}
	return counts
}

func isUnresolvedGoalAction(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "manual", "ready", "blocked":
		return true
	default:
		return false
	}
}

func isDetailedGoalHandoffAction(id string) bool {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "paper_watch", "sentiment_review":
		return true
	default:
		return false
	}
}

func compactGoalPromptText(value string, limit int) string {
	text := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if limit <= 0 || len(text) <= limit {
		return text
	}
	return text[:limit]
}

func writeGoalPromptList(b *strings.Builder, title string, values []string) {
	if len(values) == 0 {
		return
	}
	fmt.Fprintf(b, "\n%s:\n", title)
	for _, value := range values {
		fmt.Fprintf(b, "- %s\n", value)
	}
}

func parseGoalAIResponse(raw string, req aiGoalAnalyzeRequest, goalCtx aiGoalContext, errNote string) aiGoalAnalysis {
	jsonText, err := extractJSONObject(raw)
	if err != nil {
		if errNote == "" {
			errNote = err.Error()
		}
		return fallbackGoalAnalysis(req, goalCtx, errNote)
	}
	var out aiGoalAnalysis
	if err := json.Unmarshal([]byte(jsonText), &out); err != nil {
		if errNote == "" {
			errNote = "parse AI JSON: " + err.Error()
		}
		return fallbackGoalAnalysis(req, goalCtx, errNote)
	}
	if out.Summary == "" || len(out.StrategyDrafts) == 0 {
		return fallbackGoalAnalysis(req, goalCtx, "AI JSON missing required summary or strategyDrafts")
	}
	fillGoalAnalysisDefaults(&out, req, goalCtx)
	out.AI.Status = "ok"
	return out
}

func fallbackGoalAnalysis(req aiGoalAnalyzeRequest, goalCtx aiGoalContext, reason string) aiGoalAnalysis {
	symbol := "BTC"
	if len(req.Symbols) > 0 {
		symbol = req.Symbols[0]
	}
	tradingSymbol := symbol
	if !strings.HasSuffix(tradingSymbol, "USDT") {
		tradingSymbol += "USDT"
	}
	name := strings.ToLower(symbol)
	if len(name) > 5 {
		name = name[:5]
	}
	if len(name) < 3 {
		name += "ai"
	}
	humanFactors := appendUniqueTrimmed([]string{
		"避免在单条新闻或短期情绪高点追涨。",
		"把 FOMO、恐慌卖出、拥挤交易视为风险信号，而不是单独的买卖依据。",
	}, req.BehaviorConstraints...)
	watchSignals := []aiGoalWatchSignal{
		{
			Signal:         "新闻情绪与价格背离",
			Source:         "news",
			Interpretation: "高情绪但价格不跟随，可能是拥挤或叙事衰竭。",
			Action:         "降低仓位或只观察，不追涨。",
		},
		{
			Signal:         "宏观利率 / 流动性变化",
			Source:         "macro",
			Interpretation: "风险资产对流动性变化敏感，影响策略风险预算。",
			Action:         "提高回测门槛并收紧止损。",
		},
	}
	watchSignals = append(watchSignals, fallbackGoalContextWatchSignals(goalCtx)...)
	for _, focus := range req.MarketNarrativeFocus {
		watchSignals = append(watchSignals, aiGoalWatchSignal{
			Signal:         focus,
			Source:         "human",
			Interpretation: "用户指定的市场风向和舆论关注项。",
			Action:         "将该信号纳入复核，不能单独作为下单依据。",
		})
	}
	safetyGates := []string{"AI 推荐不能直接实盘", "策略风控三项必须非零", "24-72 小时 paper 复盘证据", "主网需要 env + token 双 gate"}
	for _, scenario := range req.AvoidScenarios {
		safetyGates = append(safetyGates, "禁止场景："+scenario)
	}
	blockers := []string{"AI provider unavailable", "真实执行仍需要账户、风控和主网 gate"}
	for _, scenario := range req.AvoidScenarios {
		blockers = append(blockers, "禁止场景："+scenario)
	}
	out := aiGoalAnalysis{
		ID:           newGoalAnalysisID(),
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		Goal:         req.Goal,
		Summary:      "AI 输出不可用时，系统基于当前目标生成保守蓝图：先观察市场与舆情，优先回测和模拟盘，不直接实盘执行。",
		MarketRead:   "当前上下文不足以证明单边机会。应把新闻情绪、宏观利率环境、链上指标和价格结构一起看，再决定是否进入测试网。",
		HumanFactors: humanFactors,
		StrategyDrafts: []aiGoalStrategyDraft{
			{
				Name:   name,
				Kind:   "grid_dca",
				Symbol: tradingSymbol,
				Thesis: "用小仓位网格 / DCA 先验证目标与市场状态是否匹配，避免直接重仓押方向。",
				Params: map[string]any{
					"positionLevel":                3,
					"openPositionStopTime":         30,
					"orderGroupMargin":             100,
					"stopProfitRate":               0.03,
					"stopLossRate":                 0.05,
					"profitRateAfterAtAddPosition": 0.01,
					"createPositions": []map[string]float64{
						{"marginRate": 0.5, "lossAddRate": 0},
						{"marginRate": 0.5, "lossAddRate": 0.04},
					},
				},
				RiskCaps: map[string]float64{
					"maxPositionUsd":  100,
					"maxLeverage":     3,
					"dailyLossCapUsd": 20,
				},
				ValidationPlan: []string{"抓取最近行情数据", "运行至少 30-90 天回测", "paper mode 观察 24-72 小时，并记录市场风向、舆论、人性偏差、执行摩擦和回撤表现"},
				ExecutionPlan:  []string{"人工复核策略蓝图", "创建策略草案", "补齐账户与风控", "回测通过后进入 paper 观察，复盘证据完成后再考虑测试网"},
				Blockers:       blockers,
			},
		},
		WatchSignals: watchSignals,
		Execution: aiGoalExecutionPlan{
			Mode:           req.ExecutionMode,
			CanAutoExecute: false,
			NextSteps:      []string{"人工复核 AI 计划", "补齐数据源与策略风控", "先回测，再完成 24-72 小时 paper 复盘证据后再考虑测试网"},
			SafetyGates:    safetyGates,
		},
		Context: summarizeGoalContext(req, goalCtx),
		AI: aiGoalMetadata{
			Status: "fallback",
			Error:  reason,
		},
	}
	return out
}

func fallbackGoalContextWatchSignals(goalCtx aiGoalContext) []aiGoalWatchSignal {
	out := []aiGoalWatchSignal{}
	for i, n := range goalCtx.News {
		if i >= 3 {
			break
		}
		title := strings.TrimSpace(n.Title)
		if title == "" {
			title = "未命名新闻"
		}
		detail := fmt.Sprintf("source=%s sentiment=%+.2f", strings.TrimSpace(n.Source), n.Sentiment)
		if len(n.Symbols) > 0 {
			detail += " symbols=" + strings.Join(n.Symbols, ",")
		}
		out = append(out, aiGoalWatchSignal{
			Signal:         title,
			Source:         "news",
			Interpretation: detail,
			Action:         "把新闻情绪与价格/成交量联动复核，不单独作为下单依据。",
		})
	}
	for i, m := range goalCtx.Macro {
		if i >= 2 {
			break
		}
		code := strings.Trim(strings.TrimSpace(m.Source)+"."+strings.TrimSpace(m.Code), ".")
		if code == "" {
			code = "macro"
		}
		unit := strings.TrimSpace(m.Unit)
		out = append(out, aiGoalWatchSignal{
			Signal:         "宏观指标 " + code,
			Source:         "macro",
			Interpretation: fmt.Sprintf("最新值 %.4g%s @ %s", m.Value, unit, m.Time.UTC().Format(time.RFC3339)),
			Action:         "作为风险预算和仓位收缩条件复核。",
		})
	}
	for i, o := range goalCtx.Onchain {
		if i >= 2 {
			break
		}
		key := strings.Trim(strings.TrimSpace(o.Chain)+"."+strings.TrimSpace(o.Metric), ".")
		if key == "" {
			key = "onchain"
		}
		out = append(out, aiGoalWatchSignal{
			Signal:         "链上指标 " + key,
			Source:         "onchain",
			Interpretation: fmt.Sprintf("%s 最新值 %.4g @ %s", strings.TrimSpace(o.Source), o.Value, o.Time.UTC().Format(time.RFC3339)),
			Action:         "和价格结构共同验证趋势质量，不能单独触发交易。",
		})
	}
	return out
}

func fillGoalAnalysisDefaults(out *aiGoalAnalysis, req aiGoalAnalyzeRequest, goalCtx aiGoalContext) {
	if out.ID == "" {
		out.ID = newGoalAnalysisID()
	}
	if out.CreatedAt == "" {
		out.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	out.Goal = req.Goal
	if out.HumanFactors == nil {
		out.HumanFactors = []string{}
	}
	if out.WatchSignals == nil {
		out.WatchSignals = []aiGoalWatchSignal{}
	}
	if len(out.WatchSignals) == 0 {
		out.WatchSignals = fallbackGoalContextWatchSignals(goalCtx)
	}
	out.Execution.Mode = safeGoalExecutionMode(out.Execution.Mode, req.ExecutionMode)
	out.Execution.CanAutoExecute = false
	if len(out.Execution.NextSteps) == 0 {
		out.Execution.NextSteps = []string{"人工复核 AI 计划", "运行回测", "测试网验证"}
	}
	out.Execution.SafetyGates = ensureGoalSafetyGates(out.Execution.SafetyGates)
	normalizeGoalStrategyDrafts(&out.StrategyDrafts)
	backfillGoalOperatorConstraints(out, req)
	applyGoalExecutionContextGates(out, goalCtx)
	out.Context = summarizeGoalContext(req, goalCtx)
}

func safeGoalExecutionMode(providerMode, requestedMode string) string {
	order := map[string]int{"observe": 0, "paper": 1, "testnet": 2, "mainnet": 3}
	provider := strings.ToLower(strings.TrimSpace(providerMode))
	requested := strings.ToLower(strings.TrimSpace(requestedMode))
	if _, ok := order[provider]; !ok {
		provider = requested
	}
	if _, ok := order[requested]; !ok {
		requested = "paper"
	}
	if order[provider] > order[requested] {
		return requested
	}
	return provider
}

func ensureGoalSafetyGates(values []string) []string {
	out := make([]string, 0, len(values)+3)
	seen := map[string]bool{}
	add := func(value string) {
		v := strings.TrimSpace(value)
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}
	for _, value := range values {
		add(value)
	}
	add("risk caps")
	add("backtest")
	add("paper review evidence")
	add("mainnet token gate")
	return out
}

func appendUniqueTrimmed(values []string, additions ...string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values)+len(additions))
	for _, value := range values {
		v := strings.TrimSpace(value)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	for _, value := range additions {
		v := strings.TrimSpace(value)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func backfillGoalOperatorConstraints(out *aiGoalAnalysis, req aiGoalAnalyzeRequest) {
	if out == nil {
		return
	}
	out.HumanFactors = appendUniqueTrimmed(out.HumanFactors, req.BehaviorConstraints...)
	for _, focus := range req.MarketNarrativeFocus {
		focus = strings.TrimSpace(focus)
		if focus == "" {
			continue
		}
		out.WatchSignals = appendUniqueGoalWatchSignals(out.WatchSignals, aiGoalWatchSignal{
			Signal:         focus,
			Source:         "human",
			Interpretation: "用户指定的市场风向和舆论关注项。",
			Action:         "纳入人工复核和 paper 观察，不能单独触发下单。",
		})
	}
	for _, scenario := range req.AvoidScenarios {
		scenario = strings.TrimSpace(scenario)
		if scenario == "" {
			continue
		}
		blocker := "禁止场景：" + scenario
		out.Execution.SafetyGates = appendUniqueTrimmed(out.Execution.SafetyGates, blocker)
		for i := range out.StrategyDrafts {
			out.StrategyDrafts[i].Blockers = appendUniqueTrimmed(out.StrategyDrafts[i].Blockers, blocker)
		}
	}
}

func appendUniqueGoalWatchSignals(values []aiGoalWatchSignal, additions ...aiGoalWatchSignal) []aiGoalWatchSignal {
	seen := map[string]bool{}
	out := make([]aiGoalWatchSignal, 0, len(values)+len(additions))
	add := func(signal aiGoalWatchSignal) {
		signal.Signal = strings.TrimSpace(signal.Signal)
		signal.Source = strings.TrimSpace(signal.Source)
		signal.Interpretation = strings.TrimSpace(signal.Interpretation)
		signal.Action = strings.TrimSpace(signal.Action)
		if signal.Signal == "" {
			return
		}
		key := strings.ToLower(signal.Source + "|" + signal.Signal)
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, signal)
	}
	for _, value := range values {
		add(value)
	}
	for _, value := range additions {
		add(value)
	}
	return out
}

func applyGoalExecutionContextGates(out *aiGoalAnalysis, goalCtx aiGoalContext) {
	if out == nil {
		return
	}
	exec := goalCtx.Execution
	draftBlockers := []string{}
	if exec.TradeableAccountCount == 0 {
		out.Execution.SafetyGates = appendUniqueTrimmed(out.Execution.SafetyGates, "tradeable account")
		out.Execution.NextSteps = appendUniqueTrimmed(out.Execution.NextSteps, "添加可交易且不可提现账户")
		draftBlockers = append(draftBlockers, "缺少可交易且无提现权限账户")
	}
	if exec.TradingHalted {
		out.Execution.SafetyGates = appendUniqueTrimmed(out.Execution.SafetyGates, "trading halt")
		out.Execution.NextSteps = appendUniqueTrimmed(out.Execution.NextSteps, "解除全局 trading halt")
		draftBlockers = append(draftBlockers, "全局交易已暂停")
	}
	limits := exec.PortfolioLimits
	if limits.MaxOpenNotionalUsd <= 0 || limits.MaxOpenPositionsCount <= 0 || limits.MaxDailyLossUsd <= 0 {
		out.Execution.SafetyGates = appendUniqueTrimmed(out.Execution.SafetyGates, "portfolio limits")
		out.Execution.NextSteps = appendUniqueTrimmed(out.Execution.NextSteps, "设置组合限额")
		draftBlockers = append(draftBlockers, "组合限额未设置")
	}
	if len(draftBlockers) == 0 {
		return
	}
	for i := range out.StrategyDrafts {
		out.StrategyDrafts[i].Blockers = appendUniqueTrimmed(out.StrategyDrafts[i].Blockers, draftBlockers...)
	}
}

func normalizeGoalStrategyDrafts(drafts *[]aiGoalStrategyDraft) {
	if drafts == nil {
		return
	}
	for i := range *drafts {
		draft := &(*drafts)[i]
		if draft.Kind == "" {
			draft.Kind = "grid_dca"
		}
		if draft.RiskCaps == nil {
			draft.RiskCaps = map[string]float64{}
		}
		draft.RiskCaps["maxPositionUsd"] = clampGoalNumber(draft.RiskCaps["maxPositionUsd"], 100, 1, 1_000_000_000)
		draft.RiskCaps["maxLeverage"] = math.Floor(clampGoalNumber(draft.RiskCaps["maxLeverage"], 3, 1, 125))
		draft.RiskCaps["dailyLossCapUsd"] = clampGoalNumber(draft.RiskCaps["dailyLossCapUsd"], 20, 1, 1_000_000_000)
		normalizeGoalDraftParams(draft)
		if len(draft.ValidationPlan) == 0 {
			draft.ValidationPlan = []string{"运行 30-90 天回测", "paper mode 观察 24-72 小时，并记录市场风向、舆论、人性偏差、执行摩擦和回撤表现"}
		}
		if len(draft.ExecutionPlan) == 0 {
			draft.ExecutionPlan = []string{"人工复核策略蓝图", "创建策略草案", "回测通过后进入 paper 观察，复盘证据完成后再考虑测试网"}
		}
		if len(draft.Blockers) == 0 {
			draft.Blockers = []string{"真实执行仍需要账户、风控和主网 gate"}
		}
	}
}

func normalizeGoalDraftParams(draft *aiGoalStrategyDraft) {
	if draft.Params == nil {
		draft.Params = map[string]any{}
	}
	maxLeverage := math.Floor(clampGoalNumber(draft.RiskCaps["maxLeverage"], 3, 1, 125))
	maxPositionUsd := clampGoalNumber(draft.RiskCaps["maxPositionUsd"], 100, 1, 1_000_000_000)
	positionLevel := clampGoalNumber(goalParamNumber(draft.Params, "positionLevel", 3), 3, 1, maxLeverage)
	orderGroupMarginFallback := math.Min(100, maxPositionUsd)
	orderGroupMargin := clampGoalNumber(
		goalParamNumber(draft.Params, "orderGroupMargin", orderGroupMarginFallback),
		orderGroupMarginFallback,
		0,
		maxPositionUsd,
	)
	draft.Params["positionLevel"] = int(math.Round(positionLevel))
	draft.Params["orderGroupMargin"] = int(math.Round(orderGroupMargin))
}

func goalParamNumber(params map[string]any, key string, fallback float64) float64 {
	switch v := params[key].(type) {
	case int:
		return float64(v)
	case int8:
		return float64(v)
	case int16:
		return float64(v)
	case int32:
		return float64(v)
	case int64:
		return float64(v)
	case uint:
		return float64(v)
	case uint8:
		return float64(v)
	case uint16:
		return float64(v)
	case uint32:
		return float64(v)
	case uint64:
		return float64(v)
	case float32:
		return float64(v)
	case float64:
		return v
	case json.Number:
		n, err := v.Float64()
		if err == nil {
			return n
		}
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err == nil {
			return n
		}
	}
	return fallback
}

func clampGoalNumber(value, fallback, min, max float64) float64 {
	if max < min {
		max = min
	}
	n := value
	if !isFiniteGoalNumber(n) || n < min {
		n = fallback
	}
	if !isFiniteGoalNumber(n) || n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func isFiniteGoalNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func summarizeGoalContext(req aiGoalAnalyzeRequest, goalCtx aiGoalContext) aiGoalContextSummary {
	names := make([]string, 0, len(goalCtx.ExistingStrategies))
	for _, s := range goalCtx.ExistingStrategies {
		names = append(names, s.Name)
	}
	return aiGoalContextSummary{
		Symbols:                 append([]string{}, req.Symbols...),
		NewsCount:               len(goalCtx.News),
		MacroCount:              len(goalCtx.Macro),
		OnchainCount:            len(goalCtx.Onchain),
		ExistingStrategyCount:   len(goalCtx.ExistingStrategies),
		ExistingStrategyNames:   names,
		MarketContextHighlights: summarizeGoalContextHighlights(goalCtx),
		RecentRunCount:          len(goalCtx.RecentRuns),
		RecentRunSummaries:      summarizeRecentGoalRuns(goalCtx.RecentRuns),
		Execution:               goalCtx.Execution,
		OperatorConstraints: aiGoalOperatorConstraints{
			BehaviorConstraints:  append([]string{}, req.BehaviorConstraints...),
			MarketNarrativeFocus: append([]string{}, req.MarketNarrativeFocus...),
			AvoidScenarios:       append([]string{}, req.AvoidScenarios...),
		},
		Notes: append([]string{}, goalCtx.Notes...),
	}
}

func summarizeGoalContextHighlights(goalCtx aiGoalContext) []aiGoalContextHighlight {
	out := []aiGoalContextHighlight{}
	add := func(highlight aiGoalContextHighlight) {
		highlight.ID = strings.TrimSpace(highlight.ID)
		highlight.Source = strings.TrimSpace(highlight.Source)
		highlight.Label = compactGoalPromptText(highlight.Label, 140)
		highlight.Detail = compactGoalPromptText(highlight.Detail, 220)
		if highlight.ID == "" || highlight.Source == "" || highlight.Label == "" || len(out) >= 6 {
			return
		}
		out = append(out, highlight)
	}
	for i, n := range goalCtx.News {
		if i >= 3 || len(out) >= 6 {
			break
		}
		label := strings.TrimSpace(n.Title)
		if label == "" {
			label = "未命名新闻"
		}
		detail := fmt.Sprintf("%s sentiment=%+.2f", strings.TrimSpace(n.Source), n.Sentiment)
		if len(n.Symbols) > 0 {
			detail += " symbols=" + strings.Join(n.Symbols, ",")
		}
		add(aiGoalContextHighlight{
			ID:     fmt.Sprintf("news_%d", i),
			Source: "news",
			Label:  label,
			Detail: detail,
			At:     goalHighlightTime(n.Time),
		})
	}
	for i, m := range goalCtx.Macro {
		if i >= 2 || len(out) >= 6 {
			break
		}
		label := strings.Trim(strings.TrimSpace(m.Source)+"."+strings.TrimSpace(m.Code), ".")
		if label == "" {
			label = "macro"
		}
		unit := strings.TrimSpace(m.Unit)
		add(aiGoalContextHighlight{
			ID:     fmt.Sprintf("macro_%d", i),
			Source: "macro",
			Label:  label,
			Detail: fmt.Sprintf("latest value %.4g%s", m.Value, unit),
			At:     goalHighlightTime(m.Time),
		})
	}
	for i, o := range goalCtx.Onchain {
		if i >= 2 || len(out) >= 6 {
			break
		}
		label := strings.Trim(strings.TrimSpace(o.Chain)+"."+strings.TrimSpace(o.Metric), ".")
		if label == "" {
			label = "onchain"
		}
		add(aiGoalContextHighlight{
			ID:     fmt.Sprintf("onchain_%d", i),
			Source: "onchain",
			Label:  label,
			Detail: fmt.Sprintf("%s latest value %.4g", strings.TrimSpace(o.Source), o.Value),
			At:     goalHighlightTime(o.Time),
		})
	}
	return out
}

func goalHighlightTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func summarizeRecentGoalRuns(runs []mongostore.AIGoalRunDoc) []aiGoalRecentRunSummary {
	summaries := make([]aiGoalRecentRunSummary, 0, len(runs))
	for _, run := range runs {
		counts := summarizeGoalActionStatuses(run.Actions)
		watchSignalHighlights := goalAnalysisWatchSignalHighlights(run.Analysis, 4)
		summaries = append(summaries, aiGoalRecentRunSummary{
			ID:                    run.ID,
			Goal:                  run.Goal,
			Summary:               run.Summary,
			AIStatus:              run.AIStatus,
			ExecutionMode:         run.ExecutionMode,
			StrategyDraftCount:    run.StrategyDraftCount,
			ContextNewsCount:      run.ContextNewsCount,
			ContextMacroCount:     run.ContextMacroCount,
			ContextOnchainCount:   run.ContextOnchainCount,
			MarketRead:            goalAnalysisString(run.Analysis, "marketRead", 160),
			HumanFactors:          goalAnalysisStringList(run.Analysis, "humanFactors", 4),
			WatchSignalCount:      goalAnalysisWatchSignalCount(run.Analysis),
			WatchSignalHighlights: watchSignalHighlights,
			ActionCount:           len(run.Actions),
			DoneActionCount:       counts.Done,
			ReadyActionCount:      counts.Ready,
			ManualActionCount:     counts.Manual,
			BlockedActionCount:    counts.Blocked,
			OpenActionCount:       counts.Open,
		})
	}
	return summaries
}

func goalAnalysisString(m map[string]any, key string, limit int) string {
	if m == nil {
		return ""
	}
	value, ok := m[key].(string)
	if !ok {
		return ""
	}
	return compactGoalPromptText(value, limit)
}

func goalAnalysisStringList(m map[string]any, key string, limit int) []string {
	if m == nil || limit <= 0 {
		return []string{}
	}
	out := []string{}
	seen := map[string]bool{}
	add := func(value string) {
		text := compactGoalPromptText(value, 100)
		if text == "" || seen[text] || len(out) >= limit {
			return
		}
		seen[text] = true
		out = append(out, text)
	}
	switch values := m[key].(type) {
	case []string:
		for _, value := range values {
			add(value)
		}
	case []any:
		for _, value := range values {
			if text, ok := value.(string); ok {
				add(text)
			}
		}
	}
	return out
}

func goalAnalysisWatchSignalCount(m map[string]any) int {
	if m == nil {
		return 0
	}
	switch values := m["watchSignals"].(type) {
	case []aiGoalWatchSignal:
		return len(values)
	case []map[string]any:
		return len(values)
	case []any:
		return len(values)
	default:
		return 0
	}
}

func goalAnalysisWatchSignalHighlights(m map[string]any, limit int) []string {
	if m == nil || limit <= 0 {
		return []string{}
	}
	out := []string{}
	seen := map[string]bool{}
	add := func(value string) {
		text := compactGoalPromptText(value, 100)
		if text == "" || seen[text] || len(out) >= limit {
			return
		}
		seen[text] = true
		out = append(out, text)
	}
	switch values := m["watchSignals"].(type) {
	case []aiGoalWatchSignal:
		for _, value := range values {
			add(value.Signal)
		}
	case []map[string]any:
		for _, value := range values {
			if signal, ok := value["signal"].(string); ok {
				add(signal)
			}
		}
	case []any:
		for _, value := range values {
			switch row := value.(type) {
			case map[string]any:
				if signal, ok := row["signal"].(string); ok {
					add(signal)
				}
			case aiGoalWatchSignal:
				add(row.Signal)
			}
		}
	}
	return out
}

func goalRunPreviewFromAnalysis(userID string, analysis aiGoalAnalysis, req aiGoalAnalyzeRequest) mongostore.AIGoalRunDoc {
	createdAt, err := time.Parse(time.RFC3339, analysis.CreatedAt)
	if err != nil {
		createdAt = time.Now().UTC()
	}
	return mongostore.AIGoalRunDoc{
		ID:                  analysis.ID,
		UserID:              userID,
		CreatedAt:           createdAt,
		Goal:                analysis.Goal,
		Summary:             analysis.Summary,
		Symbols:             append([]string{}, analysis.Context.Symbols...),
		Horizon:             req.Horizon,
		RiskPreference:      req.RiskPreference,
		Status:              analysis.AI.Status,
		AIStatus:            analysis.AI.Status,
		AIModel:             analysis.AI.Model,
		ExecutionMode:       analysis.Execution.Mode,
		StrategyDraftCount:  len(analysis.StrategyDrafts),
		ContextNewsCount:    analysis.Context.NewsCount,
		ContextMacroCount:   analysis.Context.MacroCount,
		ContextOnchainCount: analysis.Context.OnchainCount,
		Actions:             defaultGoalRunActions(analysis),
	}
}

func defaultGoalRunActions(analysis aiGoalAnalysis) []mongostore.AIGoalRunAction {
	now := time.Now().UTC()
	firstDraft := firstGoalTradableDraft(analysis.StrategyDrafts)
	hasTradableDraft := firstDraft.Name != "" || firstDraft.Symbol != ""
	dataStatus := "done"
	dataNote := "新闻、宏观、链上数据没有明显缺口。"
	if len(analysis.Context.Notes) > 0 {
		dataStatus = "blocked"
		dataNote = strings.Join(analysis.Context.Notes[:minInt(len(analysis.Context.Notes), 2)], "；")
	}
	sentimentStatus := "done"
	sentimentNote := "AI 未发现明显额外舆论或人性阻塞。"
	if len(analysis.HumanFactors) > 0 || len(analysis.WatchSignals) > 0 {
		sentimentStatus = "manual"
		sentimentNote = goalSentimentReviewNote(analysis.HumanFactors, analysis.WatchSignals, sentimentNote)
	}
	backtestStatus := "blocked"
	strategyStatus := "blocked"
	relatedID := ""
	if hasTradableDraft {
		backtestStatus = "ready"
		strategyStatus = "ready"
		relatedID = strings.TrimSpace(firstDraft.Name)
		if relatedID == "" {
			relatedID = strings.TrimSpace(firstDraft.Symbol)
		}
	}
	actions := []mongostore.AIGoalRunAction{
		{
			ID:        "review",
			Status:    "manual",
			Note:      "复核市场判断、人性 / 舆情假设和风险上限。",
			UpdatedAt: now,
		},
		{
			ID:        "data",
			Status:    dataStatus,
			Note:      dataNote,
			UpdatedAt: now,
		},
		{
			ID:        "sentiment_review",
			Status:    sentimentStatus,
			Note:      sentimentNote,
			UpdatedAt: now,
		},
		{
			ID:        "backtest",
			Status:    backtestStatus,
			RelatedID: relatedID,
			Note:      "运行 AI 草案回测，比较收益、回撤、夏普和交易次数。",
			UpdatedAt: now,
		},
		{
			ID:        "strategy",
			Status:    strategyStatus,
			RelatedID: relatedID,
			Note:      "把 AI 参数带入策略表单，人工复核后再保存。",
			UpdatedAt: now,
		},
	}
	if hasTradableDraft {
		actions = append(actions, mongostore.AIGoalRunAction{
			ID:        "paper_watch",
			Status:    "blocked",
			RelatedID: relatedID,
			Note:      "等待回测结果后生成 24-72 小时 paper 观察计划；完成前必须复盘市场风向、舆论、人性偏差、执行摩擦和回撤表现。",
			UpdatedAt: now,
		})
	}
	actions = append(actions,
		mongostore.AIGoalRunAction{
			ID:        "gate",
			Status:    "blocked",
			Note:      "测试网 / 主网前确认 kill switch、组合限额、交易闸门和 paper 复盘证据。",
			UpdatedAt: now,
		},
	)
	return actions
}

func goalSentimentReviewNote(humanFactors []string, watchSignals []aiGoalWatchSignal, fallback string) string {
	parts := []string{}
	for _, factor := range humanFactors[:minInt(len(humanFactors), 2)] {
		factor = strings.TrimSpace(factor)
		if factor != "" {
			parts = append(parts, factor)
		}
	}
	for _, signal := range watchSignals[:minInt(len(watchSignals), 2)] {
		text := goalWatchSignalReviewNote(signal)
		if text != "" {
			parts = append(parts, text)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "；")
	}
	return fallback
}

func goalWatchSignalReviewNote(signal aiGoalWatchSignal) string {
	parts := []string{}
	if s := strings.TrimSpace(signal.Signal); s != "" {
		parts = append(parts, s)
	}
	if s := strings.TrimSpace(signal.Interpretation); s != "" {
		parts = append(parts, "含义："+s)
	}
	if s := strings.TrimSpace(signal.Action); s != "" {
		parts = append(parts, "建议："+s)
	}
	return strings.Join(parts, "；")
}

func firstGoalTradableDraft(drafts []aiGoalStrategyDraft) aiGoalStrategyDraft {
	for _, draft := range drafts {
		if strings.EqualFold(strings.TrimSpace(draft.Kind), "watch_only") {
			continue
		}
		if strings.TrimSpace(draft.Name) == "" && strings.TrimSpace(draft.Symbol) == "" {
			continue
		}
		return draft
	}
	return aiGoalStrategyDraft{}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func analysisMap(analysis aiGoalAnalysis) map[string]any {
	bs, err := json.Marshal(analysis)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(bs, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func extractGoalAIText(family string, body []byte) (string, error) {
	switch strings.ToLower(strings.TrimSpace(family)) {
	case "anthropic":
		var resp struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return "", err
		}
		for _, c := range resp.Content {
			if c.Text != "" {
				return strings.TrimSpace(c.Text), nil
			}
		}
	case "openai":
		var resp struct {
			OutputText string `json:"output_text"`
			Output     []struct {
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
			} `json:"output"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return "", err
		}
		if strings.TrimSpace(resp.OutputText) != "" {
			return strings.TrimSpace(resp.OutputText), nil
		}
		for _, out := range resp.Output {
			for _, c := range out.Content {
				if c.Text != "" {
					return strings.TrimSpace(c.Text), nil
				}
			}
		}
		var chatResp struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(body, &chatResp); err != nil {
			return "", err
		}
		for _, c := range chatResp.Choices {
			if strings.TrimSpace(c.Message.Content) != "" {
				return strings.TrimSpace(c.Message.Content), nil
			}
		}
	case "deepseek":
		var resp struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return "", err
		}
		for _, c := range resp.Choices {
			if strings.TrimSpace(c.Message.Content) != "" {
				return strings.TrimSpace(c.Message.Content), nil
			}
		}
	default:
		return "", fmt.Errorf("unsupported AI family %q", family)
	}
	return "", errors.New("AI response did not contain text")
}

func extractJSONObject(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "```") {
		lines := strings.Split(s, "\n")
		start := -1
		end := -1
		for i, line := range lines {
			if strings.HasPrefix(strings.TrimSpace(line), "{") {
				start = i
				break
			}
		}
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.HasSuffix(strings.TrimSpace(lines[i]), "}") {
				end = i
				break
			}
		}
		if start >= 0 && end >= start {
			s = strings.Join(lines[start:end+1], "\n")
		}
	}
	first := strings.Index(s, "{")
	last := strings.LastIndex(s, "}")
	if first < 0 || last < first {
		return "", errors.New("no JSON object found in AI output")
	}
	return s[first : last+1], nil
}

func buildGoalAIRequest(
	family, baseURL, defaultBaseURL, model, apiKey, systemPrompt, userPrompt string,
) (endpoint string, headers map[string]string, payload []byte, err error) {
	resolvedBase := strings.TrimRight(baseURL, "/")
	if resolvedBase == "" {
		resolvedBase = strings.TrimRight(defaultBaseURL, "/")
	}
	switch family {
	case "anthropic":
		endpoint = resolvedBase + "/v1/messages"
		headers = map[string]string{
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
		}
		payload, err = json.Marshal(map[string]any{
			"model":      model,
			"max_tokens": 2500,
			"system":     systemPrompt,
			"messages":   []map[string]string{{"role": "user", "content": userPrompt}},
		})
	case "openai":
		base := resolvedBase
		if !strings.HasSuffix(base, "/v1") && !strings.Contains(base, "/v1/") {
			base += "/v1"
		}
		endpoint = base + "/responses"
		headers = map[string]string{"Authorization": "Bearer " + apiKey}
		payload, err = json.Marshal(map[string]any{
			"model":             model,
			"input":             []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": userPrompt}},
			"max_output_tokens": 2500,
		})
	case "deepseek":
		endpoint, headers, payload, err = buildGoalChatCompletionRequest(resolvedBase, defaultBaseURL, model, apiKey, systemPrompt, userPrompt)
	default:
		err = fmt.Errorf("unsupported AI family %q", family)
	}
	return endpoint, headers, payload, err
}

func buildGoalOpenAIChatCompletionRequest(
	baseURL, defaultBaseURL, model, apiKey, systemPrompt, userPrompt string,
) (endpoint string, headers map[string]string, payload []byte, err error) {
	resolvedBase := strings.TrimRight(baseURL, "/")
	return buildGoalChatCompletionRequest(resolvedBase, defaultBaseURL, model, apiKey, systemPrompt, userPrompt)
}

func buildGoalChatCompletionRequest(
	resolvedBase, defaultBaseURL, model, apiKey, systemPrompt, userPrompt string,
) (endpoint string, headers map[string]string, payload []byte, err error) {
	base := strings.TrimRight(resolvedBase, "/")
	if base == "" {
		base = strings.TrimRight(defaultBaseURL, "/")
	}
	if !strings.HasSuffix(base, "/v1") && !strings.Contains(base, "/v1/") {
		base += "/v1"
	}
	endpoint = base + "/chat/completions"
	headers = map[string]string{"Authorization": "Bearer " + apiKey}
	payload, err = json.Marshal(map[string]any{
		"model":           model,
		"max_tokens":      2500,
		"temperature":     0.2,
		"response_format": map[string]string{"type": "json_object"},
		"messages":        []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": userPrompt}},
	})
	return endpoint, headers, payload, err
}

func resolveGoalProviderConfig(
	cryptoSvc *cryptosvc.Service,
	family string,
	persisted *domain.AIConfig,
	eff AIConfigEffective,
) (apiKey, baseURL, model, defaultBaseURL string) {
	switch family {
	case "anthropic":
		defaultBaseURL = "https://api.anthropic.com"
		baseURL = eff.AnthropicBaseURL
		model = eff.AnthropicPrimaryModel
		if persisted != nil && persisted.AnthropicAPIKeyCiphertext != "" && cryptoSvc != nil {
			if pt, err := cryptoSvc.Decrypt(persisted.AnthropicAPIKeyCiphertext); err == nil {
				apiKey = pt
			}
		}
		if apiKey == "" {
			apiKey = os.Getenv("ANTHROPIC_API_KEY")
		}
	case "openai":
		defaultBaseURL = "https://api.openai.com/v1"
		baseURL = eff.OpenAIBaseURL
		model = eff.OpenAIPrimaryModel
		if persisted != nil && persisted.OpenAIAPIKeyCiphertext != "" && cryptoSvc != nil {
			if pt, err := cryptoSvc.Decrypt(persisted.OpenAIAPIKeyCiphertext); err == nil {
				apiKey = pt
			}
		}
		if apiKey == "" {
			apiKey = os.Getenv("OPENAI_API_KEY")
		}
	case "deepseek":
		defaultBaseURL = "https://api.deepseek.com"
		baseURL = eff.DeepseekBaseURL
		model = eff.DeepseekPrimaryModel
		if persisted != nil && persisted.DeepseekAPIKeyCiphertext != "" && cryptoSvc != nil {
			if pt, err := cryptoSvc.Decrypt(persisted.DeepseekAPIKeyCiphertext); err == nil {
				apiKey = pt
			}
		}
		if apiKey == "" {
			apiKey = os.Getenv("DEEPSEEK_API_KEY")
		}
	}
	return apiKey, baseURL, model, defaultBaseURL
}

func defaultGoalHTTPPost(ctx context.Context, endpoint string, headers map[string]string, payload []byte) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	return body, resp.StatusCode, nil
}

func baseOrigin(endpoint string) string {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func newGoalAnalysisID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("goal_%d", time.Now().UnixNano())
	}
	return "goal_" + hex.EncodeToString(b[:])
}
