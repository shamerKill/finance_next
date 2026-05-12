// Strategy detail page — Wave 5 / Node 5.D.3 redesign.
//
// Wave 2 (2.C.5.b) collapsed the page into a single column with 6 tabs.
// Wave 5 spec §G1 calls out OKX / TradingView style 3-column layouts —
// fixed-width left/right rails flanking a fluid main column — so the
// trader can see params, risk, KPIs, equity curve and AI recommendations
// at the same time without paging through tabs.
//
// Responsive strategy:
//   ≥ lg (1024px+):  3 columns      [240px | fluid | 320px]
//   < lg:            single column + tabs (mobile / tablet friendly)
//
// We render *both* trees and swap them with `hidden lg:grid` /
// `lg:hidden` so there's no hydration mismatch or `useMediaQuery` flash.
// All business logic (fetch / WS / handlers) is unchanged — only the
// composition layer is rewritten.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { RiskMeter } from "@/components/risk-meter";
import { Section } from "@/components/section";
import { Stat, type StatDirection } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import {
  getDashboardSummary,
  getStrategy,
  getStrategyPerformance,
  listAccounts,
  listBacktests,
  listRecommendations,
} from "@/data/api-client";
import type {
  TypeAccount,
  TypeBacktest,
  TypeDashboardSummary,
  TypeOption,
  TypeRecommendation,
  TypeStrategyPerformance,
} from "@/data/type";

import { ConfigPanel } from "./config-panel";
import { LiveEquityChart } from "./equity-chart-live";
import { ParamsPanel } from "./params-panel";
import { RecentOrdersTable } from "./recent-orders";
import { StrategyDetailTabs } from "./tabs-shell";
import TuneNowButton from "./tune-now";

export const dynamic = "force-dynamic";

export const metadata = { title: "策略详情" };

type PageProps = { params: Promise<{ id: string }> };

// ---- formatting helpers ----------------------------------------------------

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(n: number, dp = 1): string {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(dp)}%`;
}

function fmtRel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

function dir(n: number): StatDirection {
  if (!Number.isFinite(n) || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}

// ---- status badge for the header ------------------------------------------

function statusPill(isLive: boolean, mode: string) {
  if (!isLive) {
    return <StatusBadge tone="default">已停用</StatusBadge>;
  }
  if (mode === "mainnet") {
    return <StatusBadge tone="danger">⚠ 运行中 · 主网</StatusBadge>;
  }
  return <StatusBadge tone="success">运行中 · 测试网</StatusBadge>;
}

// ---- best-effort fetch -----------------------------------------------------

async function tryFetch<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

// Mirrors quantpb.v1.BacktestState integer codes (see data/type.d.ts
// BacktestState). Inlined rather than imported because the declaration
// file's `export const` produces no JS at runtime under Turbopack's
// strict module resolution.
const BACKTEST_STATE_LABEL: Record<number, string> = {
  1: "等待中",
  2: "运行中",
  3: "已完成",
  4: "失败",
};

export default async function StrategyDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Hard requirement: the strategy itself. If it fails, render a clear
  // error state — the rest of the page has nothing to anchor against.
  let strategy: TypeOption | null = null;
  let strategyErr: string | null = null;
  try {
    strategy = await getStrategy(id);
  } catch (e) {
    strategyErr = e instanceof Error ? e.message : String(e);
  }

  if (strategyErr || !strategy) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumb={
            <Link href="/strategies" className="hover:underline">
              ← 策略
            </Link>
          }
          title="策略详情"
        />
        <Callout variant="danger" title="无法加载策略">
          {strategyErr ?? "未找到策略"}
        </Callout>
      </div>
    );
  }

  // Best-effort sidecar resources. Each section degrades to an empty
  // state when its fetch fails.
  const [perf, accounts, summary, recs, backtests]: [
    TypeStrategyPerformance | null,
    TypeAccount[] | null,
    TypeDashboardSummary | null,
    TypeRecommendation[] | null,
    TypeBacktest[] | null,
  ] = await Promise.all([
    tryFetch(getStrategyPerformance(id)),
    tryFetch(listAccounts()),
    tryFetch(getDashboardSummary()),
    tryFetch(listRecommendations("pending_review", id)),
    tryFetch(listBacktests(id)),
  ]);

  const kpis = perf?.kpis;
  const isLive = perf?.isLive ?? !!strategy.live?.enabled;
  const mode = perf?.mode ?? strategy.live?.mode ?? "testnet";
  const equityCurve = perf?.equityCurve ?? [];
  const recentOrders = perf?.recentOrders ?? [];
  const lastTradeRel = kpis ? fmtRel(kpis.lastTradeAt) : null;
  const pendingRecs = (recs ?? []).slice(0, 3);
  const recentBacktests = (backtests ?? []).slice(0, 3);

  // -- Reusable building blocks (each is rendered in both the desktop
  //    3-column tree and the mobile tabs tree, so the underlying React
  //    elements stay the same — only the wrapping layout differs).

  const kpiCards = (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label="总 PnL"
        value={<span className="tnum">{fmtUsd(kpis?.totalPnlUsd ?? 0)}</span>}
        delta={{
          value: fmtUsd(kpis?.totalPnlUsd ?? 0),
          direction: dir(kpis?.totalPnlUsd ?? 0),
        }}
      />
      <Stat
        label="24h PnL"
        value={
          <span className="tnum">{fmtUsd(kpis?.realised24hUsd ?? 0)}</span>
        }
        delta={{
          value: fmtUsd(kpis?.realised24hUsd ?? 0),
          direction: dir(kpis?.realised24hUsd ?? 0),
        }}
      />
      <Stat
        label="胜率"
        value={<span className="tnum">{fmtPct(kpis?.winRate ?? 0)}</span>}
      />
      <Stat
        label="最大回撤"
        value={
          <span className="tnum">{fmtPct(-(kpis?.maxDrawdownPct ?? 0))}</span>
        }
        delta={{
          value: fmtPct(kpis?.maxDrawdownPct ?? 0),
          direction: (kpis?.maxDrawdownPct ?? 0) > 0 ? "down" : "flat",
        }}
      />
    </div>
  );

  const kpiFootnote = (
    <div className="text-xs text-text-tertiary">
      共 {kpis?.tradesTotal ?? 0} 笔成交 · 24h 内 {kpis?.tradesLast24h ?? 0} 笔
      · 最近成交 {lastTradeRel ?? "无"} · 当前未结名义{" "}
      {fmtUsd(kpis?.currentOpenNotionalUsd ?? 0)}
    </div>
  );

  const equitySection = (
    <Section title="资金曲线">
      {equityCurve.length > 0 ? (
        <LiveEquityChart points={equityCurve} />
      ) : (
        <EmptyState
          title="暂无资金曲线"
          description="策略尚未产生已成交订单——启用并完成至少 1 笔交易后将显示。"
        />
      )}
    </Section>
  );

  const ordersSection = (
    <Section title="最近订单">
      {recentOrders.length > 0 ? (
        <RecentOrdersTable strategyId={id} initial={recentOrders} />
      ) : (
        <EmptyState
          title="暂无订单"
          description="实盘订单填充后将显示在这里。"
        />
      )}
    </Section>
  );

  const basicInfoSection = (
    <Section title="基本信息">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-text-tertiary">名称</dt>
        <dd className="text-right font-mono tnum text-text-primary truncate">
          {strategy.name}
        </dd>
        <dt className="text-text-tertiary">交易对</dt>
        <dd className="text-right font-mono tnum text-text-primary">
          {strategy.execSymbol}
        </dd>
        <dt className="text-text-tertiary">杠杆</dt>
        <dd className="text-right font-mono tnum text-text-primary">
          {strategy.positionLevel}x
        </dd>
        <dt className="text-text-tertiary">订单组保证金</dt>
        <dd className="text-right font-mono tnum text-text-primary">
          ${strategy.orderGroupMargin}
        </dd>
        <dt className="text-text-tertiary">未开仓停止</dt>
        <dd className="text-right font-mono tnum text-text-primary">
          {strategy.openPositionStopTime} 分
        </dd>
        <dt className="text-text-tertiary">分批档位</dt>
        <dd className="text-right font-mono tnum text-text-primary">
          {strategy.createPositions?.length ?? 0}
        </dd>
        {strategy.currentVersion ? (
          <>
            <dt className="text-text-tertiary">参数版本</dt>
            <dd className="text-right font-mono tnum text-text-primary">
              v{strategy.currentVersion}
            </dd>
          </>
        ) : null}
        <dt className="text-text-tertiary">运行状态</dt>
        <dd className="text-right">{statusPill(isLive, String(mode))}</dd>
      </dl>
    </Section>
  );

  const paramsSection = <ParamsPanel strategy={strategy} />;

  // Risk-meter triplet. Caps come from strategy.risk; "value" is the
  // current open-notional / open-leverage / 24h realised loss as best-
  // effort approximations from perf KPIs (negative pnl counts toward
  // daily loss cap). When risk is unset we render zero-value bars to
  // make the "missing cap" state visible.
  const risk = strategy.risk;
  const openNotional = kpis?.currentOpenNotionalUsd ?? 0;
  const realised24 = kpis?.realised24hUsd ?? 0;
  const dailyLoss = Math.max(0, -realised24);

  const riskSummarySection = (
    <Section title="风控上限">
      <div className="space-y-3 text-sm">
        <RiskMeter
          label="最大仓位 (USD)"
          value={openNotional}
          max={risk?.maxPositionUsd ?? 0}
        />
        <RiskMeter
          label="最大杠杆"
          value={strategy.positionLevel}
          max={risk?.maxLeverage ?? 0}
        />
        <RiskMeter
          label="每日亏损上限 (USD)"
          value={dailyLoss}
          max={risk?.dailyLossCapUsd ?? 0}
        />
        {(!risk ||
          !risk.maxPositionUsd ||
          !risk.maxLeverage ||
          !risk.dailyLossCapUsd) && (
          <Callout variant="warning" title="风控未配置">
            任一为 0 或缺失会导致 gateway 拒绝所有订单。请在下方
            「实盘 / 风控」中补齐。
          </Callout>
        )}
      </div>
    </Section>
  );

  const configSection = <ConfigPanel strategy={strategy} accounts={accounts ?? []} />;

  const mainnetCallout =
    isLive && mode === "mainnet" ? (
      <Callout variant="warning" title="主网交易已启用">
        此策略已启用主网交易。真实资金存在风险。服务端闸门（env +
        确认 token）必须开启。
      </Callout>
    ) : null;

  const aiSidebar = (
    <Section title="AI 调优">
      <div className="space-y-3 text-sm">
        <div className="text-text-secondary text-xs">
          立即跑一次 Optuna study；进度与开销实时显示在按钮旁。
        </div>
        <TuneNowButton strategyId={id} />
        <div className="rounded border border-border-default bg-bg-surface-2 p-2 text-xs">
          今日 AI 预算{" "}
          <span className="font-mono tnum">
            ${(summary?.aiBudget?.usdSpentToday ?? 0).toFixed(2)}
          </span>{" "}
          /{" "}
          <span className="font-mono tnum">
            ${(summary?.aiBudget?.usdCapPerDay ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
    </Section>
  );

  const recsSidebar = (
    <Section
      title="待审 AI 推荐"
      action={
        <Link
          href={`/recommendations?strategyId=${id}`}
          className="text-xs text-brand-primary hover:underline"
        >
          全部 →
        </Link>
      }
    >
      {pendingRecs.length === 0 ? (
        <div className="text-xs text-text-tertiary py-2">
          无待审推荐。调优完成且产生改进时会在此显示。
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {pendingRecs.map((r) => {
            const delta = r.expectedDelta?.sharpe ?? 0;
            const sign = delta > 0 ? "+" : "";
            return (
              <li key={r.id}>
                <Link
                  href={`/recommendations/${r.id}`}
                  className="block rounded border border-border-default bg-bg-surface p-2 hover:border-brand-primary hover:bg-bg-surface-2"
                >
                  <div className="text-xs text-text-tertiary">
                    Δ Sharpe{" "}
                    <span
                      className={`font-mono tnum font-semibold ${
                        delta > 0
                          ? "text-accent-up"
                          : delta < 0
                            ? "text-accent-down"
                            : ""
                      }`}
                    >
                      {sign}
                      {delta.toFixed(2)}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-text-tertiary mt-0.5">
                    {r.id.slice(0, 16)}…
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );

  const backtestsSidebar = (
    <Section
      title="回测"
      action={
        <Link
          href={`/backtests/new?strategyId=${id}`}
          className="text-xs text-brand-primary hover:underline"
        >
          + 运行回测
        </Link>
      }
    >
      <div className="space-y-2 text-sm">
        {recentBacktests.length === 0 ? (
          <div className="text-xs text-text-tertiary py-1">
            尚无历史回测。
          </div>
        ) : (
          <ul className="space-y-1.5">
            {recentBacktests.map((b) => {
              const stateLabel = BACKTEST_STATE_LABEL[b.state] ?? "—";
              const sharpe = (b.metrics?.["sharpe"] as number | undefined) ?? 0;
              const totalRet =
                (b.metrics?.["totalReturn"] as number | undefined) ?? 0;
              return (
                <li key={b.runId}>
                  <Link
                    href={`/backtests/${b.runId}`}
                    className="block rounded border border-border-default bg-bg-surface px-2 py-1.5 hover:border-brand-primary hover:bg-bg-surface-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-tertiary">{stateLabel}</span>
                      <span className="font-mono tnum text-text-primary">
                        Sharpe {sharpe.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-text-tertiary mt-0.5">
                      <span className="font-mono">{b.runId.slice(0, 12)}…</span>
                      <span className="font-mono tnum">
                        收益 {fmtPct(totalRet)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href={`/backtests?strategyId=${id}`}
          className="block text-right text-xs text-brand-primary hover:underline"
        >
          查看全部 →
        </Link>
      </div>
    </Section>
  );

  // -- Tab tree (mobile / tablet < lg) ---------------------------------------

  const overviewTab = (
    <div className="space-y-6">
      {kpiCards}
      {kpiFootnote}
      {equitySection}
    </div>
  );

  const paramsTab = paramsSection;
  const riskTab = (
    <div className="space-y-4">
      {riskSummarySection}
      {configSection}
    </div>
  );
  const ordersTab = ordersSection;
  const backtestsTab = (
    <Section title="回测">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/backtests/new?strategyId=${id}`}
            className="inline-flex items-center rounded border border-border-default bg-bg-surface px-3 py-1.5 text-sm hover:bg-bg-surface-2"
          >
            回测当前参数
          </Link>
          <Link
            href={`/backtests?strategyId=${id}`}
            className="inline-flex items-center rounded border border-border-default bg-bg-surface px-3 py-1.5 text-sm hover:bg-bg-surface-2"
          >
            查看历史回测 →
          </Link>
        </div>
        {recentBacktests.length > 0 && (
          <ul className="space-y-1.5">
            {recentBacktests.map((b) => {
              const stateLabel = BACKTEST_STATE_LABEL[b.state] ?? "—";
              const sharpe = (b.metrics?.["sharpe"] as number | undefined) ?? 0;
              return (
                <li key={b.runId}>
                  <Link
                    href={`/backtests/${b.runId}`}
                    className="block rounded border border-border-default bg-bg-surface px-2 py-1.5 hover:bg-bg-surface-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-tertiary">{stateLabel}</span>
                      <span className="font-mono tnum text-text-primary">
                        Sharpe {sharpe.toFixed(2)}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-text-tertiary mt-0.5">
                      {b.runId.slice(0, 16)}…
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
  const aiTab = (
    <div className="space-y-4">
      {aiSidebar}
      {recsSidebar}
    </div>
  );

  // -- Header (shared by both layouts) ---------------------------------------

  const header = (
    <PageHeader
      breadcrumb={
        <Link href="/strategies" className="hover:underline">
          ← 策略
        </Link>
      }
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {strategy.name}
          <StatusBadge tone="default">{strategy.execSymbol}</StatusBadge>
          {statusPill(isLive, String(mode))}
          {strategy.currentVersion ? (
            <span
              className="text-xs font-normal text-text-tertiary"
              title="每次批准 AI 推荐时递增"
            >
              v{strategy.currentVersion}
            </span>
          ) : null}
        </span>
      }
      action={
        <Link
          href={`/backtests/new?strategyId=${id}`}
          className="text-sm px-3 py-1.5 rounded border border-border-default bg-bg-surface hover:bg-bg-surface-2"
        >
          回测当前参数
        </Link>
      }
    />
  );

  // -- Render ---------------------------------------------------------------
  //
  // Both layout trees are rendered together. Tailwind toggles which one is
  // visible via `lg:hidden` / `hidden lg:grid`, so there's no JS-side
  // media-query flash. Server-rendered HTML matches client paint on
  // hydration in either viewport.

  return (
    <div className="space-y-6">
      <RecentTracker
        id={id}
        kind="strategy"
        label={strategy.name}
        path={`/strategies/${id}`}
      />
      {header}
      {mainnetCallout}

      {/* Desktop: 3-column layout (lg+) -------------------------------- */}
      <div className="hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
        <aside className="space-y-4 min-w-0">
          {basicInfoSection}
          {paramsSection}
          {riskSummarySection}
        </aside>
        <main className="space-y-6 min-w-0">
          {kpiCards}
          {kpiFootnote}
          {equitySection}
          {ordersSection}
          {configSection}
        </main>
        <aside className="space-y-4 min-w-0">
          {aiSidebar}
          {recsSidebar}
          {backtestsSidebar}
        </aside>
      </div>

      {/* Mobile / tablet: tabs (< lg) ---------------------------------- */}
      <div className="lg:hidden">
        <StrategyDetailTabs
          overview={overviewTab}
          params={paramsTab}
          risk={riskTab}
          orders={ordersTab}
          backtests={backtestsTab}
          ai={aiTab}
        />
      </div>
    </div>
  );
}
