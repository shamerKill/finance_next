// dashboard_test.go — table-driven coverage for the Wave 1B aggregation
// endpoints. We avoid spinning up Mongo / Timescale by stubbing every
// repo via the interfaces declared in dashboard.go; the goal is to lock
// in the JSON shape and verify the graceful-degrade behaviour
// (nil dep → zeroed section + note, never 5xx).
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
)

// fakeSystemRepo / fakeOptionRepo / etc. implement the dashboard's
// repo-slice interfaces. Each captures call args so tests can assert
// userId propagation.

type fakeSystemRepo struct {
	state *domain.SystemState
	err   error
}

func (f *fakeSystemRepo) GetSystemState(ctx context.Context) (*domain.SystemState, error) {
	return f.state, f.err
}

type fakeDashOptionRepo struct {
	all     []domain.Option
	byID    map[string]*domain.Option
	errAll  error
}

func (f *fakeDashOptionRepo) FindAll(ctx context.Context, userID string) ([]domain.Option, error) {
	return f.all, f.errAll
}
func (f *fakeDashOptionRepo) FindByID(ctx context.Context, id string) (*domain.Option, error) {
	if o, ok := f.byID[id]; ok {
		return o, nil
	}
	return nil, mongostore.ErrNotFound
}

type fakeDashAccountRepo struct{ all []domain.Account }

func (f *fakeDashAccountRepo) FindAll(ctx context.Context, userID string) ([]domain.Account, error) {
	return f.all, nil
}

type fakeDashWalletRepo struct{ all []domain.Wallet }

func (f *fakeDashWalletRepo) FindAll(ctx context.Context, userID string) ([]domain.Wallet, error) {
	return f.all, nil
}

type fakeDashOrderRepo struct {
	openNotional float64
	openCount    int
	pnl24h       float64
	pnl30d       float64
	trades24h    int
	listByStrat  []domain.OrderLog
	agg          mongostore.StrategyOrderAggregates
	gotStrategy  string
	gotUser      string
}

func (f *fakeDashOrderRepo) SumOpenNotionalForUser(ctx context.Context, userID string) (float64, int, error) {
	return f.openNotional, f.openCount, nil
}
func (f *fakeDashOrderRepo) SumRealisedPnlSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error) {
	// Heuristic: ≥ 25h-ago since → 30d window; otherwise 24h. Tests
	// rarely care about the distinction but we need both knobs.
	if time.Since(since) > 25*time.Hour {
		return f.pnl30d, nil
	}
	return f.pnl24h, nil
}
func (f *fakeDashOrderRepo) CountFilledSinceForUser(ctx context.Context, userID string, since time.Time) (int, error) {
	return f.trades24h, nil
}
func (f *fakeDashOrderRepo) ListByStrategyAndUser(ctx context.Context, strategyID, userID string, limit int) ([]domain.OrderLog, error) {
	f.gotStrategy = strategyID
	f.gotUser = userID
	return f.listByStrat, nil
}
func (f *fakeDashOrderRepo) AggregateForStrategyAndUser(ctx context.Context, strategyID, userID string, now time.Time) (mongostore.StrategyOrderAggregates, error) {
	return f.agg, nil
}

type fakeDashRecRepo struct {
	count    int64
	listIDs  []string
	errCount error
}

func (f *fakeDashRecRepo) CountByStatus(ctx context.Context, userID, status string) (int64, error) {
	return f.count, f.errCount
}
func (f *fakeDashRecRepo) ListByStatusForUser(ctx context.Context, userID, status string, limit int) ([]mongostore.RecommendationDoc, error) {
	out := make([]mongostore.RecommendationDoc, 0, len(f.listIDs))
	for _, id := range f.listIDs {
		out = append(out, mongostore.RecommendationDoc{ID: id})
	}
	return out, nil
}

type fakeDashOptRunRepo struct{ spent float64 }

func (f *fakeDashOptRunRepo) SumSpentSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error) {
	return f.spent, nil
}

type fakeDashPortfolioTotaller struct {
	total float64
	notes []string
	err   error
}

func (f *fakeDashPortfolioTotaller) TotalUsd(ctx context.Context, userID string) (float64, []string, error) {
	return f.total, f.notes, f.err
}

// newDashboardEcho wires the handler into an Echo instance with the
// userId middleware applied (handler panics if it's missing).
func newDashboardEcho(h *DashboardHandler) *echo.Echo {
	e := echo.New()
	g := e.Group("/api/v1")
	g.Use(gwmw.WithUserID(false))
	h.Register(g)
	return e
}

// TestDashboardSummary_HappyPath threads every fake and asserts the
// JSON shape + every block carries the injected value.
func TestDashboardSummary_HappyPath(t *testing.T) {
	halted := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	sys := &fakeSystemRepo{state: &domain.SystemState{
		TradingHalted: true,
		HaltedAt:      &halted,
		HaltedReason:  "drill",
		HaltedBy:      "ops",
	}}
	opt := &fakeDashOptionRepo{all: []domain.Option{{}, {}, {}}} // 3 strats
	acct := &fakeDashAccountRepo{all: []domain.Account{{}}}      // 1 account
	wallet := &fakeDashWalletRepo{all: []domain.Wallet{{}, {}}}
	order := &fakeDashOrderRepo{
		openNotional: 100,
		openCount:    2,
		pnl24h:       12.4,
		pnl30d:       210,
		trades24h:    7,
	}
	rec := &fakeDashRecRepo{count: 15, listIDs: []string{"r1", "r2", "r3"}}
	optRun := &fakeDashOptRunRepo{spent: 0.42}
	port := &fakeDashPortfolioTotaller{total: 4231.20}

	h := NewDashboardHandler(sys, opt, acct, wallet, order, rec, optRun, nil, port, nil)
	e := newDashboardEcho(h)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/summary", nil)
	rec0 := httptest.NewRecorder()
	e.ServeHTTP(rec0, req)
	if rec0.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec0.Code, rec0.Body.String())
	}
	var got DashboardSummary
	if err := json.Unmarshal(rec0.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.System.TradingHalted || got.System.HaltedReason != "drill" || got.System.HaltedBy != "ops" {
		t.Errorf("system block wrong: %+v", got.System)
	}
	if got.Portfolio.TotalUsd != 4231.20 || got.Portfolio.AccountCount != 1 || got.Portfolio.StrategyCount != 3 || got.Portfolio.WalletCount != 2 {
		t.Errorf("portfolio block wrong: %+v", got.Portfolio)
	}
	if got.PnL.Realised24hUsd != 12.4 || got.PnL.Realised30dUsd != 210 || got.PnL.TradesLast24h != 7 {
		t.Errorf("pnl block wrong: %+v", got.PnL)
	}
	if got.OpenOrders.Count != 2 || got.OpenOrders.OpenNotionalUsd != 100 {
		t.Errorf("open orders block wrong: %+v", got.OpenOrders)
	}
	if got.Recommendations.PendingCount != 15 || len(got.Recommendations.TopPendingIDs) != 3 || got.Recommendations.TopPendingIDs[0] != "r1" {
		t.Errorf("recs block wrong: %+v", got.Recommendations)
	}
	if got.AIBudget.USDSpentToday != 0.42 || got.AIBudget.USDCapPerDay <= 0 {
		t.Errorf("ai budget wrong: %+v", got.AIBudget)
	}
	if got.GeneratedAt == "" {
		t.Errorf("generatedAt missing")
	}
}

// TestDashboardSummary_NilDeps_DegradesNot5xx confirms a nil-everything
// handler still returns 200 with sensible zero values. This is the
// hardest contract — any future "must-have" dep should fail loudly here.
func TestDashboardSummary_NilDeps_DegradesNot5xx(t *testing.T) {
	h := NewDashboardHandler(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	e := newDashboardEcho(h)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/summary", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with nil deps, got %d: %s", rec.Code, rec.Body.String())
	}
	var got DashboardSummary
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Portfolio.TotalUsd != 0 || got.PnL.Realised24hUsd != 0 {
		t.Errorf("expected zero portfolio/pnl with nil repos, got: %+v / %+v", got.Portfolio, got.PnL)
	}
	if got.Recommendations.TopPendingIDs == nil {
		t.Errorf("topPendingIds must be empty array not null")
	}
}

// TestDashboardSummary_SystemErrorIsNoteNot5xx confirms a single source
// failing only annotates the response — the rest still renders.
func TestDashboardSummary_SystemErrorIsNoteNot5xx(t *testing.T) {
	sys := &fakeSystemRepo{err: errors.New("mongo down")}
	h := NewDashboardHandler(sys, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	e := newDashboardEcho(h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/summary", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on system error, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "system_state") {
		t.Errorf("expected note mentioning system_state in body: %s", rec.Body.String())
	}
}

// TestStrategyPerformance_HappyPath threads a full set of fakes and
// checks both the KPI block and the recent-orders payload.
func TestStrategyPerformance_HappyPath(t *testing.T) {
	stratID := "strat-1"
	lastTrade := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	live := &domain.LiveConfig{Enabled: true, Mode: domain.LiveModeTestnet}
	opt := &fakeDashOptionRepo{
		byID: map[string]*domain.Option{
			stratID: {ID: stratID, UserID: "default", Live: live},
		},
	}
	order := &fakeDashOrderRepo{
		agg: mongostore.StrategyOrderAggregates{
			TotalPnlUsd:            12.4,
			Realised24hUsd:         3.1,
			Realised30dUsd:         12.4,
			TradesTotal:            47,
			TradesLast24h:          2,
			WinRate:                0.62,
			LastTradeAt:            &lastTrade,
			CurrentOpenNotionalUsd: 25.5,
		},
		listByStrat: []domain.OrderLog{
			{ClientOrderID: "c1", Symbol: "BTCUSDT", Side: domain.OrderSideBuy, Qty: 0.001, Price: 82345.6, Status: domain.OrderStatusFilled, SubmittedAt: lastTrade},
		},
	}
	h := NewDashboardHandler(nil, opt, nil, nil, order, nil, nil, nil, nil, nil)
	e := newDashboardEcho(h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/strategies/"+stratID+"/performance", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got StrategyPerformance
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.StrategyID != stratID || got.UserID != "default" {
		t.Errorf("wrong ids: %+v", got)
	}
	if !got.IsLive || got.Mode != "testnet" {
		t.Errorf("expected live testnet, got isLive=%v mode=%q", got.IsLive, got.Mode)
	}
	if got.KPIs.TotalPnlUsd != 12.4 || got.KPIs.TradesTotal != 47 || got.KPIs.WinRate != 0.62 {
		t.Errorf("kpi block wrong: %+v", got.KPIs)
	}
	if len(got.RecentOrders) != 1 || got.RecentOrders[0].Symbol != "BTCUSDT" {
		t.Errorf("recent orders wrong: %+v", got.RecentOrders)
	}
	if order.gotStrategy != stratID || order.gotUser != "default" {
		t.Errorf("repo did not receive correct (strategyId, userId): got %q / %q", order.gotStrategy, order.gotUser)
	}
}

// TestStrategyPerformance_CrossTenantReturns404 confirms a strategy
// belonging to a different user looks like "not found" — never leak
// existence.
func TestStrategyPerformance_CrossTenantReturns404(t *testing.T) {
	stratID := "strat-xyz"
	opt := &fakeDashOptionRepo{
		byID: map[string]*domain.Option{
			stratID: {ID: stratID, UserID: "other-tenant"},
		},
	}
	h := NewDashboardHandler(nil, opt, nil, nil, nil, nil, nil, nil, nil, nil)
	e := newDashboardEcho(h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/strategies/"+stratID+"/performance", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 cross-tenant, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStrategyPerformance_FallbackEquityFromOrders confirms that when
// Timescale has no live-equity rows the handler synthesises an equity
// series from filled orders' cumulative pnl.
func TestStrategyPerformance_FallbackEquityFromOrders(t *testing.T) {
	stratID := "strat-2"
	opt := &fakeDashOptionRepo{
		byID: map[string]*domain.Option{stratID: {ID: stratID, UserID: "default"}},
	}
	d1 := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 5, 10, 14, 0, 0, 0, time.UTC)
	d3 := time.Date(2026, 5, 11, 9, 0, 0, 0, time.UTC)
	order := &fakeDashOrderRepo{
		// Newest first, as the repo would return.
		listByStrat: []domain.OrderLog{
			{Status: domain.OrderStatusFilled, RealisedPnlUsd: 4, SubmittedAt: d3},
			{Status: domain.OrderStatusFilled, RealisedPnlUsd: -1, SubmittedAt: d2},
			{Status: domain.OrderStatusFilled, RealisedPnlUsd: 3, SubmittedAt: d1},
		},
	}
	h := NewDashboardHandler(nil, opt, nil, nil, order, nil, nil, nil, nil, nil)
	e := newDashboardEcho(h)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/strategies/"+stratID+"/performance", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got StrategyPerformance
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.EquityCurve) != 3 {
		t.Fatalf("expected 3 equity points (one per UTC day), got %d: %+v", len(got.EquityCurve), got.EquityCurve)
	}
	// Cumulative sequence: 3, 2, 6.
	if got.EquityCurve[0].EquityUsd != 3 || got.EquityCurve[1].EquityUsd != 2 || got.EquityCurve[2].EquityUsd != 6 {
		t.Errorf("unexpected cumulative pnl: %+v", got.EquityCurve)
	}
	// Drawdown from peak 3 → 2 = (3-2)/3 = 0.3333...
	if got.KPIs.MaxDrawdownPct < 0.33 || got.KPIs.MaxDrawdownPct > 0.34 {
		t.Errorf("expected ~0.333 drawdown, got %v", got.KPIs.MaxDrawdownPct)
	}
}
