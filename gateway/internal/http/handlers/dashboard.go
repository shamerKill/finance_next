// dashboard.go — Wave 1B aggregation endpoints feeding the redesigned UX.
//
//	GET /api/v1/dashboard/summary             — six-card home dashboard
//	GET /api/v1/strategies/:id/performance    — KPIs + equity + recent orders
//
// Both endpoints are read-only fan-outs across the existing Mongo + Timescale
// repos. They are intentionally degradation-tolerant: when an individual
// data source errors we record a note in the response and return zero
// values for that field, never 5xx-ing the whole call. The frontend reads
// `notes[]` to surface fan-out failures to operators without breaking
// shell rendering.
//
// User scoping: both endpoints read userId via gwmw.FromEcho(c) and pass
// it into every repo accessor. Strategy lookups respect tenant isolation —
// fetching a strategy that belongs to a different user returns 404, so
// no information leaks via existence.
package handlers

import (
	"context"
	"errors"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
)

// DashboardSummaryAccountRepo is the slice of AccountRepo the dashboard
// reads. Kept as an interface so unit tests can inject fakes without
// touching Mongo.
type DashboardSummaryAccountRepo interface {
	FindAll(ctx context.Context, userID string) ([]domain.Account, error)
}

// DashboardSummaryOptionRepo / WalletRepo / etc. follow the same pattern.
type DashboardSummaryOptionRepo interface {
	FindAll(ctx context.Context, userID string) ([]domain.Option, error)
	FindByID(ctx context.Context, id string) (*domain.Option, error)
}

// DashboardSummaryWalletRepo abstracts the polygon wallet repo for the
// wallet-count card.
type DashboardSummaryWalletRepo interface {
	FindAll(ctx context.Context, userID string) ([]domain.Wallet, error)
}

// DashboardSummaryOrderRepo abstracts OrderRepo for the dashboard.
type DashboardSummaryOrderRepo interface {
	SumOpenNotionalForUser(ctx context.Context, userID string) (notional float64, count int, err error)
	SumRealisedPnlSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error)
	CountFilledSinceForUser(ctx context.Context, userID string, since time.Time) (int, error)
	ListByStrategyAndUser(ctx context.Context, strategyID, userID string, limit int) ([]domain.OrderLog, error)
	AggregateForStrategyAndUser(ctx context.Context, strategyID, userID string, now time.Time) (mongostore.StrategyOrderAggregates, error)
}

// DashboardSummaryRecommendationRepo is the recommendation slice.
type DashboardSummaryRecommendationRepo interface {
	CountByStatus(ctx context.Context, userID, status string) (int64, error)
	ListByStatusForUser(ctx context.Context, userID, status string, limit int) ([]mongostore.RecommendationDoc, error)
}

// DashboardSummaryOptimizationRepo is the optimization-run slice.
type DashboardSummaryOptimizationRepo interface {
	SumSpentSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error)
}

// DashboardSummarySystemRepo is the system_state slice.
type DashboardSummarySystemRepo interface {
	GetSystemState(ctx context.Context) (*domain.SystemState, error)
}

// PortfolioTotaller is the indirection used to grab the cross-account
// USD total without re-implementing the per-account balance fetch. The
// portfolio handler's logic is the source of truth — we delegate to a
// callable here so tests can stub it and avoid spinning up the full
// crypto + exchange-client chain.
type PortfolioTotaller interface {
	TotalUsd(ctx context.Context, userID string) (float64, []string, error)
}

// DashboardHandler wires the two endpoints.
type DashboardHandler struct {
	system     DashboardSummarySystemRepo
	options    DashboardSummaryOptionRepo
	accounts   DashboardSummaryAccountRepo
	wallets    DashboardSummaryWalletRepo
	orders     DashboardSummaryOrderRepo
	recs       DashboardSummaryRecommendationRepo
	optRuns    DashboardSummaryOptimizationRepo
	timescale  *timescale.Store
	portfolio  PortfolioTotaller
	cfg        *config.Config
}

// NewDashboardHandler builds the handler. Any dep may be nil; the
// handler degrades that section of the response rather than 5xx-ing the
// whole call. cfg may be nil too — env vars are then read directly so
// dev environments without a fully wired Config still work.
func NewDashboardHandler(
	sys DashboardSummarySystemRepo,
	opt DashboardSummaryOptionRepo,
	acct DashboardSummaryAccountRepo,
	wallet DashboardSummaryWalletRepo,
	order DashboardSummaryOrderRepo,
	rec DashboardSummaryRecommendationRepo,
	optRun DashboardSummaryOptimizationRepo,
	ts *timescale.Store,
	portfolio PortfolioTotaller,
	cfg *config.Config,
) *DashboardHandler {
	return &DashboardHandler{
		system:    sys,
		options:   opt,
		accounts:  acct,
		wallets:   wallet,
		orders:    order,
		recs:      rec,
		optRuns:   optRun,
		timescale: ts,
		portfolio: portfolio,
		cfg:       cfg,
	}
}

// Register binds /dashboard/summary + /strategies/:id/performance.
func (h *DashboardHandler) Register(g *echo.Group) {
	g.GET("/dashboard/summary", h.summary)
	g.GET("/strategies/:id/performance", h.performance)
}

// ---- /dashboard/summary --------------------------------------------------

// SystemBlock is the system-halt slice of the summary response.
type SystemBlock struct {
	TradingHalted bool       `json:"tradingHalted"`
	HaltedReason  string     `json:"haltedReason"`
	HaltedBy      string     `json:"haltedBy"`
	HaltedSince   *time.Time `json:"haltedSince"`
}

// PortfolioBlock is the portfolio counts slice.
type PortfolioBlock struct {
	TotalUsd       float64 `json:"totalUsd"`
	AccountCount   int     `json:"accountCount"`
	StrategyCount  int     `json:"strategyCount"`
	WalletCount    int     `json:"walletCount"`
}

// PnLBlock is the recent-PnL slice.
type PnLBlock struct {
	Realised24hUsd float64 `json:"realised24hUsd"`
	Realised30dUsd float64 `json:"realised30dUsd"`
	TradesLast24h  int     `json:"tradesLast24h"`
}

// OpenOrdersBlock is the open-orders slice.
type OpenOrdersBlock struct {
	Count            int     `json:"count"`
	OpenNotionalUsd  float64 `json:"openNotionalUsd"`
}

// RecommendationsBlock is the pending-review slice.
type RecommendationsBlock struct {
	PendingCount   int64    `json:"pendingCount"`
	TopPendingIDs  []string `json:"topPendingIds"`
}

// AIBudgetBlock surfaces the daily budget snapshot for the AI-tuning card.
// Keys are never leaked — only the boolean configured flags + the family
// the operator selected via AI_MODEL_FAMILY.
type AIBudgetBlock struct {
	USDSpentToday        float64 `json:"usdSpentToday"`
	USDCapPerDay         float64 `json:"usdCapPerDay"`
	AnthropicConfigured  bool    `json:"anthropicConfigured"`
	OpenAIConfigured     bool    `json:"openaiConfigured"`
	CurrentFamily        string  `json:"currentFamily"`
}

// DashboardSummary is the JSON response body.
type DashboardSummary struct {
	System          SystemBlock          `json:"system"`
	Portfolio       PortfolioBlock       `json:"portfolio"`
	PnL             PnLBlock             `json:"pnl"`
	OpenOrders      OpenOrdersBlock      `json:"openOrders"`
	Recommendations RecommendationsBlock `json:"recommendations"`
	AIBudget        AIBudgetBlock        `json:"aiBudget"`
	GeneratedAt     string               `json:"generatedAt"`
	Notes           []string             `json:"notes,omitempty"`
}

func (h *DashboardHandler) summary(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()
	userID := gwmw.FromEcho(c)

	out := DashboardSummary{
		Recommendations: RecommendationsBlock{TopPendingIDs: []string{}},
		AIBudget: AIBudgetBlock{
			USDCapPerDay:        readBudgetCap(),
			AnthropicConfigured: readBool(h.cfg, anthropicConfiguredEnvKey),
			OpenAIConfigured:    readBool(h.cfg, openAIConfiguredEnvKey),
			CurrentFamily:       readCurrentFamily(),
		},
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:       []string{},
	}

	// system_state — halt flag.
	if h.system != nil {
		s, err := h.system.GetSystemState(ctx)
		if err != nil {
			out.Notes = append(out.Notes, "system_state: "+err.Error())
		} else if s != nil {
			out.System = SystemBlock{
				TradingHalted: s.TradingHalted,
				HaltedReason:  s.HaltedReason,
				HaltedBy:      s.HaltedBy,
				HaltedSince:   s.HaltedAt,
			}
		}
	} else {
		out.Notes = append(out.Notes, "system_state repo not configured")
	}

	// portfolio counts + totalUsd.
	if h.options != nil {
		opts, err := h.options.FindAll(ctx, userID)
		if err != nil {
			out.Notes = append(out.Notes, "strategies: "+err.Error())
		} else {
			out.Portfolio.StrategyCount = len(opts)
		}
	}
	if h.accounts != nil {
		accts, err := h.accounts.FindAll(ctx, userID)
		if err != nil {
			out.Notes = append(out.Notes, "accounts: "+err.Error())
		} else {
			out.Portfolio.AccountCount = len(accts)
		}
	}
	if h.wallets != nil {
		wts, err := h.wallets.FindAll(ctx, userID)
		if err != nil {
			out.Notes = append(out.Notes, "wallets: "+err.Error())
		} else {
			out.Portfolio.WalletCount = len(wts)
		}
	}
	if h.portfolio != nil {
		total, pnotes, err := h.portfolio.TotalUsd(ctx, userID)
		if err != nil {
			out.Notes = append(out.Notes, "portfolio total: "+err.Error())
		} else {
			out.Portfolio.TotalUsd = total
			out.Notes = append(out.Notes, pnotes...)
		}
	}

	// orders → 24h / 30d / open.
	now := time.Now().UTC()
	if h.orders != nil {
		if v, err := h.orders.SumRealisedPnlSinceForUser(ctx, userID, now.Add(-24*time.Hour)); err != nil {
			out.Notes = append(out.Notes, "pnl 24h: "+err.Error())
		} else {
			out.PnL.Realised24hUsd = v
		}
		if v, err := h.orders.SumRealisedPnlSinceForUser(ctx, userID, now.Add(-30*24*time.Hour)); err != nil {
			out.Notes = append(out.Notes, "pnl 30d: "+err.Error())
		} else {
			out.PnL.Realised30dUsd = v
		}
		if n, err := h.orders.CountFilledSinceForUser(ctx, userID, now.Add(-24*time.Hour)); err != nil {
			out.Notes = append(out.Notes, "trades 24h: "+err.Error())
		} else {
			out.PnL.TradesLast24h = n
		}
		if notional, count, err := h.orders.SumOpenNotionalForUser(ctx, userID); err != nil {
			out.Notes = append(out.Notes, "open orders: "+err.Error())
		} else {
			out.OpenOrders.Count = count
			out.OpenOrders.OpenNotionalUsd = notional
		}
	}

	// recommendations.
	if h.recs != nil {
		if n, err := h.recs.CountByStatus(ctx, userID, mongostore.RecommendationStatusPendingReview); err != nil {
			out.Notes = append(out.Notes, "rec count: "+err.Error())
		} else {
			out.Recommendations.PendingCount = n
		}
		if docs, err := h.recs.ListByStatusForUser(ctx, userID, mongostore.RecommendationStatusPendingReview, 3); err != nil {
			out.Notes = append(out.Notes, "rec list: "+err.Error())
		} else {
			ids := make([]string, 0, len(docs))
			for _, d := range docs {
				ids = append(ids, d.ID)
			}
			out.Recommendations.TopPendingIDs = ids
		}
	}

	// ai budget — daily spend (since UTC midnight today).
	if h.optRuns != nil {
		midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		if v, err := h.optRuns.SumSpentSinceForUser(ctx, userID, midnight); err != nil {
			out.Notes = append(out.Notes, "ai budget: "+err.Error())
		} else {
			out.AIBudget.USDSpentToday = v
		}
	}

	if len(out.Notes) == 0 {
		out.Notes = nil
	}
	return c.JSON(http.StatusOK, out)
}

// ---- /strategies/:id/performance -----------------------------------------

// PerformanceKPIs is the KPI block of the response.
type PerformanceKPIs struct {
	TotalPnlUsd            float64    `json:"totalPnlUsd"`
	Realised24hUsd         float64    `json:"realised24hUsd"`
	Realised30dUsd         float64    `json:"realised30dUsd"`
	TradesTotal            int        `json:"tradesTotal"`
	TradesLast24h          int        `json:"tradesLast24h"`
	WinRate                float64    `json:"winRate"`
	MaxDrawdownPct         float64    `json:"maxDrawdownPct"`
	LastTradeAt            *time.Time `json:"lastTradeAt"`
	CurrentOpenNotionalUsd float64    `json:"currentOpenNotionalUsd"`
}

// PerformanceEquityPoint mirrors timescale.EquityPoint but uses a more
// dashboard-friendly JSON shape (ts + equityUsd).
type PerformanceEquityPoint struct {
	Ts        time.Time `json:"ts"`
	EquityUsd float64   `json:"equityUsd"`
}

// StrategyPerformance is the JSON response body.
type StrategyPerformance struct {
	StrategyID   string                   `json:"strategyId"`
	UserID       string                   `json:"userId"`
	IsLive       bool                     `json:"isLive"`
	Mode         string                   `json:"mode"`
	KPIs         PerformanceKPIs          `json:"kpis"`
	EquityCurve  []PerformanceEquityPoint `json:"equityCurve"`
	RecentOrders []domain.OrderLog        `json:"recentOrders"`
	Notes        []string                 `json:"notes,omitempty"`
}

func (h *DashboardHandler) performance(c echo.Context) error {
	if h.options == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "option repo not configured")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()
	userID := gwmw.FromEcho(c)
	id := c.Param("id")

	// Tenant-safe lookup: not-found AND other-tenant collapse to 404 so
	// we never leak existence across tenants.
	opt, err := h.options.FindByID(ctx, id)
	if errors.Is(err, mongostore.ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if opt.UserID != "" && opt.UserID != userID {
		return echo.NewHTTPError(http.StatusNotFound, "strategy not found")
	}

	resp := StrategyPerformance{
		StrategyID:   id,
		UserID:       userID,
		EquityCurve:  []PerformanceEquityPoint{},
		RecentOrders: []domain.OrderLog{},
		Notes:        []string{},
	}
	if opt.Live != nil {
		resp.IsLive = opt.Live.Enabled
		resp.Mode = string(opt.Live.Mode)
	}
	if resp.Mode == "" {
		resp.Mode = string(domain.LiveModeTestnet)
	}

	now := time.Now().UTC()

	// KPI aggregates — single OrderRepo call returns four rollups.
	if h.orders != nil {
		agg, err := h.orders.AggregateForStrategyAndUser(ctx, id, userID, now)
		if err != nil {
			resp.Notes = append(resp.Notes, "kpis: "+err.Error())
		} else {
			resp.KPIs = PerformanceKPIs{
				TotalPnlUsd:            agg.TotalPnlUsd,
				Realised24hUsd:         agg.Realised24hUsd,
				Realised30dUsd:         agg.Realised30dUsd,
				TradesTotal:            agg.TradesTotal,
				TradesLast24h:          agg.TradesLast24h,
				WinRate:                agg.WinRate,
				LastTradeAt:            agg.LastTradeAt,
				CurrentOpenNotionalUsd: agg.CurrentOpenNotionalUsd,
			}
		}
	} else {
		resp.Notes = append(resp.Notes, "order repo not configured")
	}

	// Equity curve — prefer the live Timescale series; fall back to a
	// cumulative pnl computed from order_log if the hypertable has
	// nothing for this strategy yet.
	if h.timescale != nil {
		pts, err := h.timescale.QueryEquityCurveForStrategy(ctx, id, 30)
		if err != nil {
			resp.Notes = append(resp.Notes, "equity ts: "+err.Error())
		} else if len(pts) > 0 {
			for _, p := range pts {
				resp.EquityCurve = append(resp.EquityCurve, PerformanceEquityPoint{
					Ts:        p.Time,
					EquityUsd: p.Equity,
				})
			}
		}
	}

	// Pull recent orders once — we also use them for the fallback
	// equity curve + max-drawdown computation.
	var orders []domain.OrderLog
	if h.orders != nil {
		ord, err := h.orders.ListByStrategyAndUser(ctx, id, userID, 200)
		if err != nil {
			resp.Notes = append(resp.Notes, "orders: "+err.Error())
		} else {
			orders = ord
		}
	}

	// Recent-orders top-10 (orders already sorted desc).
	if n := len(orders); n > 0 {
		take := n
		if take > 10 {
			take = 10
		}
		resp.RecentOrders = append([]domain.OrderLog{}, orders[:take]...)
	}

	// Fallback equity curve: cumulative realised PnL of filled orders
	// bucketed by UTC date, capped to last 200 days.
	if len(resp.EquityCurve) == 0 && len(orders) > 0 {
		resp.EquityCurve = computeFallbackEquityCurve(orders)
	}

	// Max drawdown: derived from whichever equity series we now have.
	resp.KPIs.MaxDrawdownPct = computeMaxDrawdownPct(resp.EquityCurve)

	if len(resp.Notes) == 0 {
		resp.Notes = nil
	}
	return c.JSON(http.StatusOK, resp)
}

// computeFallbackEquityCurve builds a daily cumulative-pnl series from
// filled orders. Orders arrive newest-first from the repo; we re-sort
// ascending by submittedAt before walking. Output has at most 200
// points, matching the live-equity LIMIT.
func computeFallbackEquityCurve(orders []domain.OrderLog) []PerformanceEquityPoint {
	if len(orders) == 0 {
		return nil
	}
	// Bucket by UTC date.
	asc := append([]domain.OrderLog{}, orders...)
	sort.Slice(asc, func(i, j int) bool {
		return asc[i].SubmittedAt.Before(asc[j].SubmittedAt)
	})
	type bucket struct {
		day time.Time
		pnl float64
	}
	buckets := []bucket{}
	for _, o := range asc {
		if o.Status != domain.OrderStatusFilled {
			continue
		}
		day := time.Date(o.SubmittedAt.UTC().Year(), o.SubmittedAt.UTC().Month(), o.SubmittedAt.UTC().Day(), 0, 0, 0, 0, time.UTC)
		if n := len(buckets); n > 0 && buckets[n-1].day.Equal(day) {
			buckets[n-1].pnl += o.RealisedPnlUsd
		} else {
			buckets = append(buckets, bucket{day: day, pnl: o.RealisedPnlUsd})
		}
	}
	if len(buckets) == 0 {
		return nil
	}
	out := make([]PerformanceEquityPoint, 0, len(buckets))
	var running float64
	for _, b := range buckets {
		running += b.pnl
		out = append(out, PerformanceEquityPoint{Ts: b.day, EquityUsd: running})
	}
	if len(out) > 200 {
		out = out[len(out)-200:]
	}
	return out
}

// computeMaxDrawdownPct walks an equity series and returns the largest
// peak-to-trough decline as a positive fraction (e.g. 0.12 = 12%). When
// every peak is ≤0 we can't define a percentage and return 0.
func computeMaxDrawdownPct(curve []PerformanceEquityPoint) float64 {
	if len(curve) < 2 {
		return 0
	}
	var peak, maxDD float64
	peak = math.Inf(-1)
	for _, p := range curve {
		if p.EquityUsd > peak {
			peak = p.EquityUsd
		}
		if peak > 0 {
			dd := (peak - p.EquityUsd) / peak
			if dd > maxDD {
				maxDD = dd
			}
		}
	}
	return maxDD
}

// ---- helper accessors ----------------------------------------------------

const (
	anthropicConfiguredEnvKey = "ANTHROPIC_API_KEY"
	openAIConfiguredEnvKey    = "OPENAI_API_KEY"
)

// ---- nil-safe adapter constructors --------------------------------------
//
// Go's typed-nil trap means passing a nil *mongostore.OrderRepo into an
// interface-typed parameter produces a non-nil interface that panics on
// method calls. These constructors normalise that by returning a nil
// interface when the concrete pointer is nil; the handler's per-section
// nil-checks then degrade cleanly.

func SystemForDashboard(r *mongostore.SystemRepo) DashboardSummarySystemRepo {
	if r == nil {
		return nil
	}
	return r
}
func OptionForDashboard(r *mongostore.OptionRepo) DashboardSummaryOptionRepo {
	if r == nil {
		return nil
	}
	return r
}
func AccountForDashboard(r *mongostore.AccountRepo) DashboardSummaryAccountRepo {
	if r == nil {
		return nil
	}
	return r
}
func WalletForDashboard(r *mongostore.WalletRepo) DashboardSummaryWalletRepo {
	if r == nil {
		return nil
	}
	return r
}
func OrderForDashboard(r *mongostore.OrderRepo) DashboardSummaryOrderRepo {
	if r == nil {
		return nil
	}
	return r
}
func RecForDashboard(r *mongostore.RecommendationRepo) DashboardSummaryRecommendationRepo {
	if r == nil {
		return nil
	}
	return r
}
func OptRunForDashboard(r *mongostore.OptimizationRunRepo) DashboardSummaryOptimizationRepo {
	if r == nil {
		return nil
	}
	return r
}

// portfolioTotallerForDashboard wraps a PortfolioHandler so the
// dashboard can read the cross-account USD total without duplicating
// the per-account balance fetch logic. nil PortfolioHandler → nil
// interface.
func PortfolioTotallerForDashboard(p *PortfolioHandler) PortfolioTotaller {
	if p == nil || p.repo == nil || p.envelope == nil {
		return nil
	}
	return portfolioTotallerAdapter{p: p}
}

// portfolioTotallerAdapter reuses PortfolioHandler.usdValue + the same
// per-account walk to compute just the cross-account total. Errors are
// surfaced verbatim; the caller writes them into the response notes.
type portfolioTotallerAdapter struct {
	p *PortfolioHandler
}

// TotalUsd walks every account for `userID`, sums the per-account USD
// value, and returns the total + any per-account warnings. We intentionally
// do not reuse the full summary endpoint — it builds per-exchange and
// per-asset breakdowns we don't need on the dashboard hot path.
func (a portfolioTotallerAdapter) TotalUsd(ctx context.Context, userID string) (float64, []string, error) {
	accounts, err := a.p.repo.FindAll(ctx, userID)
	if err != nil {
		return 0, nil, err
	}
	notes := []string{}
	total := 0.0
	for _, acct := range accounts {
		cli, err := a.p.clientFor(acct)
		if err != nil {
			notes = append(notes, "skipped account "+acct.ID+": "+err.Error())
			continue
		}
		balances, err := cli.GetBalances(ctx)
		if err != nil {
			notes = append(notes, "balances failed for account "+acct.ID+": "+err.Error())
			continue
		}
		for _, b := range balances {
			qty := parseFloat(b.Free) + parseFloat(b.Locked)
			if qty == 0 {
				continue
			}
			total += a.p.usdValue(ctx, b.Asset, qty)
		}
	}
	return total, notes, nil
}

// readBool reports whether the env var (looked up via cfg first when
// possible, env second) is non-empty. cfg is currently the source of
// truth for the gateway-owned env knobs (TimescaleDSN etc.); the AI keys
// live only in env today, so we read directly. cfg is accepted as a
// parameter so future Config additions stay in one place.
func readBool(cfg *config.Config, key string) bool {
	_ = cfg
	return os.Getenv(key) != ""
}

// readBudgetCap reads AI_MAX_USD_PER_DAY (default 50). The actual cap
// lives in the quant worker; the dashboard surfaces it for the operator
// so the displayed bar matches the enforced cap.
func readBudgetCap() float64 {
	raw := os.Getenv("AI_MAX_USD_PER_DAY")
	if raw == "" {
		return 50
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v < 0 {
		return 50
	}
	return v
}

// readCurrentFamily reads AI_MODEL_FAMILY (default "claude"). Free-form
// string; the frontend uses it to badge the active provider.
func readCurrentFamily() string {
	v := os.Getenv("AI_MODEL_FAMILY")
	if v == "" {
		return "claude"
	}
	return v
}
