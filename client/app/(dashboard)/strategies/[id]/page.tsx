// Strategy detail page — Wave 2 / Phase C redesign.
//
// 2.C.5.b refactor — design system: PageHeader + Tabs split the page
// into 概览 / 参数 / 风控 / 订单 / 回测 / AI 推荐 instead of the previous
// 3-column layout. Mainnet warning uses <Callout variant="warning">.
// Server component fans out to /option/:id, /accounts,
// /strategies/:id/performance, /dashboard/summary, and
// /recommendations?strategyId=...&status=pending_review in parallel.
// Mutations (live toggle / risk caps / account picker / delete) live in
// the <ConfigPanel> client island and use router.refresh() to repaint
// the server-rendered performance cards with fresh data. The WS-driven
// live order stream and the <TuneNow> button are smaller client
// islands kept colocated under this route.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { Section } from "@/components/section";
import { Stat, type StatDirection } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import {
  getDashboardSummary,
  getStrategy,
  getStrategyPerformance,
  listAccounts,
  listRecommendations,
} from "@/data/api-client";
import type {
  TypeAccount,
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

  // The other four resources are best-effort — each section degrades to
  // a friendly empty/zero state when its fetch fails.
  const [perf, accounts, summary, recs]: [
    TypeStrategyPerformance | null,
    TypeAccount[] | null,
    TypeDashboardSummary | null,
    TypeRecommendation[] | null,
  ] = await Promise.all([
    tryFetch(getStrategyPerformance(id)),
    tryFetch(listAccounts()),
    tryFetch(getDashboardSummary()),
    tryFetch(listRecommendations("pending_review", id)),
  ]);

  const kpis = perf?.kpis;
  const isLive = perf?.isLive ?? !!strategy.live?.enabled;
  const mode = perf?.mode ?? strategy.live?.mode ?? "testnet";
  const equityCurve = perf?.equityCurve ?? [];
  const recentOrders = perf?.recentOrders ?? [];
  const lastTradeRel = kpis ? fmtRel(kpis.lastTradeAt) : null;
  const pendingRecs = (recs ?? []).slice(0, 3);

  // --- tab contents ----------------------------------------------------------

  const overviewTab = (
    <div className="space-y-6">
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
            <span className="tnum">
              {fmtPct(-(kpis?.maxDrawdownPct ?? 0))}
            </span>
          }
          delta={{
            value: fmtPct(kpis?.maxDrawdownPct ?? 0),
            direction:
              (kpis?.maxDrawdownPct ?? 0) > 0 ? "down" : "flat",
          }}
        />
      </div>
      <div className="text-xs text-text-tertiary">
        共 {kpis?.tradesTotal ?? 0} 笔成交 · 24h 内{" "}
        {kpis?.tradesLast24h ?? 0} 笔 · 最近成交 {lastTradeRel ?? "无"} ·
        当前未结名义 {fmtUsd(kpis?.currentOpenNotionalUsd ?? 0)}
      </div>

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
    </div>
  );

  const paramsTab = <ParamsPanel strategy={strategy} />;

  const riskTab = <ConfigPanel strategy={strategy} accounts={accounts ?? []} />;

  const ordersTab = (
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

  const backtestsTab = (
    <Section title="回测">
      <div className="space-y-3 text-sm">
        <p className="text-text-secondary">
          针对当前策略参数运行新回测，或查看历史回测。
        </p>
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
      </div>
    </Section>
  );

  const aiTab = (
    <div className="space-y-4">
      <Section title="AI 调优">
        <div className="space-y-3 text-sm">
          <div className="text-text-secondary">
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

      <Section title="待审 AI 推荐">
        {pendingRecs.length === 0 ? (
          <EmptyState
            title="无待审推荐"
            description="调优完成且产生改进时会在此显示。"
          />
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
            <li className="text-xs text-right">
              <Link
                href={`/recommendations?strategyId=${id}`}
                className="text-brand-primary hover:underline"
              >
                全部 →
              </Link>
            </li>
          </ul>
        )}
      </Section>
    </div>
  );

  return (
    <div className="space-y-6">
      <RecentTracker
        id={id}
        kind="strategy"
        label={strategy.name}
        path={`/strategies/${id}`}
      />
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

      {isLive && mode === "mainnet" && (
        <Callout variant="warning" title="主网交易已启用">
          此策略已启用主网交易。真实资金存在风险。服务端闸门（env +
          确认 token）必须开启。
        </Callout>
      )}

      <StrategyDetailTabs
        overview={overviewTab}
        params={paramsTab}
        risk={riskTab}
        orders={ordersTab}
        backtests={backtestsTab}
        ai={aiTab}
      />
    </div>
  );
}
