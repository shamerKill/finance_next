// Strategy detail page — Wave 2 / Phase C redesign.
//
// Server component that fans out to /option/:id, /accounts,
// /strategies/:id/performance, /dashboard/summary, and
// /recommendations?strategyId=...&status=pending_review in parallel.
// Mutations (live toggle / risk caps / account picker / delete) live in
// the <ConfigPanel> client island and use router.refresh() to repaint
// the server-rendered performance cards with fresh data. The WS-driven
// live order stream and the <TuneNow> button are smaller client
// islands kept colocated under this route.

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
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

// ---- KPI card --------------------------------------------------------------

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "default";
}) {
  const toneCls =
    tone === "success"
      ? "text-success-700"
      : tone === "danger"
        ? "text-danger-700"
        : "text-default-800";
  return (
    <div className="rounded border border-default-200 p-3">
      <div className="text-xs text-default-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneCls}`}>{value}</div>
    </div>
  );
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
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          {strategyErr ?? "未找到策略"}
        </div>
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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link href="/strategies" className="hover:underline">
            ← 策略
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {strategy.name}
            <StatusBadge tone="default">{strategy.execSymbol}</StatusBadge>
            {statusPill(isLive, String(mode))}
            {strategy.currentVersion ? (
              <span
                className="text-xs font-normal text-default-500"
                title="每次批准 AI 推荐时递增"
              >
                v{strategy.currentVersion}
              </span>
            ) : null}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/backtests/new?strategyId=${id}`}
              className="text-sm px-3 py-1.5 rounded border border-default-300 hover:bg-default-50"
            >
              回测当前参数
            </Link>
            <TuneNowButton strategyId={id} />
          </div>
        }
      />

      {isLive && mode === "mainnet" && (
        <div className="rounded border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
          此策略已启用主网交易。真实资金存在风险。服务端闸门（env +
          确认 token）必须开启。
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_320px]">
        {/* ===== Left column — config (sticky on desktop) ===== */}
        <aside className="lg:sticky lg:top-6 self-start">
          <ConfigPanel strategy={strategy} accounts={accounts ?? []} />
        </aside>

        {/* ===== Middle column — performance ===== */}
        <main className="space-y-6 min-w-0">
          <ParamsPanel strategy={strategy} />

          {/* KPI strip */}
          <div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi
                label="总 PnL"
                value={fmtUsd(kpis?.totalPnlUsd ?? 0)}
                tone={
                  (kpis?.totalPnlUsd ?? 0) > 0
                    ? "success"
                    : (kpis?.totalPnlUsd ?? 0) < 0
                      ? "danger"
                      : "default"
                }
              />
              <Kpi
                label="24h PnL"
                value={fmtUsd(kpis?.realised24hUsd ?? 0)}
                tone={
                  (kpis?.realised24hUsd ?? 0) > 0
                    ? "success"
                    : (kpis?.realised24hUsd ?? 0) < 0
                      ? "danger"
                      : "default"
                }
              />
              <Kpi
                label="胜率"
                value={fmtPct(kpis?.winRate ?? 0)}
              />
              <Kpi
                label="最大回撤"
                value={fmtPct(-(kpis?.maxDrawdownPct ?? 0))}
                tone={(kpis?.maxDrawdownPct ?? 0) > 0 ? "danger" : "default"}
              />
            </div>
            <div className="mt-3 text-xs text-default-500">
              共 {kpis?.tradesTotal ?? 0} 笔成交 · 24h 内{" "}
              {kpis?.tradesLast24h ?? 0} 笔 · 最近成交{" "}
              {lastTradeRel ?? "无"} · 当前未结名义{" "}
              {fmtUsd(kpis?.currentOpenNotionalUsd ?? 0)}
            </div>
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
        </main>

        {/* ===== Right column — AI side panel ===== */}
        <aside className="space-y-4">
          <Section title="AI 调优">
            <div className="space-y-3 text-sm">
              <div className="text-xs text-default-500">
                立即跑一次 Optuna study；进度与开销实时显示在顶部按钮旁。
              </div>
              <div className="rounded border border-default-200 bg-default-50 p-2 text-xs">
                今日 AI 预算{" "}
                <span className="font-mono">
                  ${(summary?.aiBudget?.usdSpentToday ?? 0).toFixed(2)}
                </span>{" "}
                /{" "}
                <span className="font-mono">
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
                        className="block rounded border border-default-200 p-2 hover:border-primary-300 hover:bg-primary-50"
                      >
                        <div className="text-xs text-default-500">
                          Δ Sharpe{" "}
                          <span
                            className={
                              delta > 0
                                ? "text-success-700 font-semibold"
                                : delta < 0
                                  ? "text-danger-700 font-semibold"
                                  : ""
                            }
                          >
                            {sign}
                            {delta.toFixed(2)}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-default-400 mt-0.5">
                          {r.id.slice(0, 16)}…
                        </div>
                      </Link>
                    </li>
                  );
                })}
                <li className="text-xs text-right">
                  <Link
                    href={`/recommendations?strategyId=${id}`}
                    className="text-primary hover:underline"
                  >
                    全部 →
                  </Link>
                </li>
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
