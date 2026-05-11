// Wave 2 Phase B — dashboard landing page.
//
// Server component. Calls /api/v1/dashboard/summary once and renders six
// summary cards in a responsive grid. Auto-refresh is driven by the
// <DashboardRefresher> client island, which schedules router.refresh()
// every 30 seconds so the cards repaint with fresh data without a full
// navigation. Errors thrown from getDashboardSummary() bubble up to the
// route group's error.tsx boundary.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardSummary } from "@/data/api-client";
import type { TypeDashboardSummary } from "@/data/type";

import { DashboardRefresher } from "./refresher";

export const dynamic = "force-dynamic";
export const metadata = { title: "仪表盘" };

function formatUsd(v: number, opts: { showSign?: boolean } = {}): string {
  const abs = Math.abs(v).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  if (opts.showSign) {
    if (v > 0) return `+${abs}`;
    if (v < 0) return `-${abs}`;
  }
  return v < 0 ? `-${abs}` : abs;
}

function pnlTextClass(v: number): string {
  if (v > 0) return "text-success-600";
  if (v < 0) return "text-danger-600";
  return "text-default-700";
}

export default async function DashboardPage() {
  const summary: TypeDashboardSummary = await getDashboardSummary();

  return (
    <div className="space-y-6">
      <PageHeader
        title="仪表盘"
        subtitle="单页运营全景：系统状态、近期 PnL、待审推荐与 AI 预算。"
        action={<DashboardRefresher generatedAt={summary.generatedAt} />}
      />

      {summary.system.tradingHalted && (
        <Callout variant="danger" title="交易已暂停">
          <div className="space-y-1">
            {summary.system.haltedReason && (
              <div>原因：{summary.system.haltedReason}</div>
            )}
            {summary.system.haltedBy && (
              <div className="text-xs">由 {summary.system.haltedBy} 操作</div>
            )}
            <div className="pt-1">
              <Link href="/admin" className="underline font-medium">
                前往管理 →
              </Link>
            </div>
          </div>
        </Callout>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SystemCard summary={summary} />
        <PnLCard summary={summary} />
        <PortfolioCard summary={summary} />
        <RecommendationsCard summary={summary} />
        <ActivityCard summary={summary} />
        <AIBudgetCard summary={summary} />
      </div>

      {summary.notes && summary.notes.length > 0 && (
        <section className="text-xs text-default-500">
          <h3 className="font-medium text-default-600 mb-1">备注</h3>
          <ul className="list-disc ml-5 space-y-1">
            {summary.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Card 1: System status ----------

function SystemCard({ summary }: { summary: TypeDashboardSummary }) {
  const halted = summary.system.tradingHalted;
  return (
    <Section
      title="系统状态"
      action={
        <Link href="/admin" className="text-xs text-primary-600 hover:underline">
          管理 →
        </Link>
      }
    >
      <div className="space-y-2">
        <StatusBadge tone={halted ? "danger" : "success"} variant="solid">
          {halted ? "● 已暂停" : "● 运行中"}
        </StatusBadge>
        {halted ? (
          <div className="text-xs text-default-600 space-y-0.5">
            {summary.system.haltedReason && (
              <div>原因：{summary.system.haltedReason}</div>
            )}
            {summary.system.haltedBy && (
              <div>由 {summary.system.haltedBy}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-default-500">
            订单引擎正常处理命令流。
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------- Card 2: 24h realised PnL ----------

function PnLCard({ summary }: { summary: TypeDashboardSummary }) {
  const v24 = summary.pnl.realised24hUsd;
  const v30 = summary.pnl.realised30dUsd;
  return (
    <Section title="24h 已实现 PnL">
      <div className="space-y-1">
        <div className={`text-3xl font-semibold ${pnlTextClass(v24)}`}>
          {formatUsd(v24, { showSign: true })}
        </div>
        <div className="text-xs text-default-500 space-x-2">
          <span>
            30d:{" "}
            <span className={pnlTextClass(v30)}>
              {formatUsd(v30, { showSign: true })}
            </span>
          </span>
          <span>·</span>
          <span>今日成交: {summary.pnl.tradesLast24h} 笔</span>
        </div>
        {summary.pnl.tradesLast24h === 0 && (
          <div className="text-xs text-default-400 pt-1">暂无成交记录</div>
        )}
      </div>
    </Section>
  );
}

// ---------- Card 3: Portfolio total ----------

function PortfolioCard({ summary }: { summary: TypeDashboardSummary }) {
  return (
    <Section
      title="总市值"
      action={
        <Link
          href="/portfolio"
          className="text-xs text-primary-600 hover:underline"
        >
          投资组合 →
        </Link>
      }
    >
      <div className="space-y-1">
        <div className="text-3xl font-semibold">
          {formatUsd(summary.portfolio.totalUsd)}
        </div>
        <div className="text-xs text-default-500">
          {summary.portfolio.accountCount} 账户 ·{" "}
          {summary.portfolio.strategyCount} 策略 ·{" "}
          {summary.portfolio.walletCount} 钱包
        </div>
      </div>
    </Section>
  );
}

// ---------- Card 4: Pending AI recommendations ----------

function RecommendationsCard({ summary }: { summary: TypeDashboardSummary }) {
  const count = summary.recommendations.pendingCount;
  const top = summary.recommendations.topPendingIds;
  return (
    <Section
      title="待审 AI 推荐"
      action={
        <Link
          href="/recommendations"
          className="text-xs text-primary-600 hover:underline"
        >
          全部 →
        </Link>
      }
    >
      {count === 0 ? (
        <EmptyState
          title="暂无待审推荐"
          description="跑一次优化以生成推荐"
          action={
            <Link
              href="/strategies"
              className="text-sm text-primary-600 hover:underline"
            >
              前往策略 →
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-primary-600">
              {count}
            </span>
            <span className="text-xs text-default-500">条待审</span>
          </div>
          <ul className="space-y-1 text-sm">
            {top.map((id) => (
              <li key={id}>
                <Link
                  href={`/recommendations/${id}`}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-default-100"
                >
                  <span className="font-mono text-xs text-default-700">
                    {id.slice(0, 8)}
                  </span>
                  <span className="text-default-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ---------- Card 5: Recent activity ----------

function ActivityCard({ summary }: { summary: TypeDashboardSummary }) {
  const tradeN = summary.pnl.tradesLast24h;
  const openN = summary.openOrders.count;
  return (
    <Section title="最近活动">
      {tradeN === 0 && openN === 0 ? (
        <div className="text-sm text-default-500 py-2">24 小时内无成交</div>
      ) : (
        <div className="space-y-2 text-sm">
          {tradeN > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-default-700">24h 内成交</span>
              <span className="font-mono text-default-700">{tradeN} 笔</span>
            </div>
          )}
          {openN > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-default-700">挂单中</span>
              <span className="font-mono text-default-700">
                {openN} 笔 · {formatUsd(summary.openOrders.openNotionalUsd)}
              </span>
            </div>
          )}
          <div className="pt-1">
            <Link
              href="/strategies"
              className="text-xs text-primary-600 hover:underline"
            >
              查看策略 →
            </Link>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------- Card 6: AI budget ----------

function AIBudgetCard({ summary }: { summary: TypeDashboardSummary }) {
  const spent = summary.aiBudget.usdSpentToday;
  const cap = summary.aiBudget.usdCapPerDay || 0;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  let barColor = "bg-success-500";
  if (pct >= 90) barColor = "bg-danger-500";
  else if (pct >= 50) barColor = "bg-warning-500";

  return (
    <Section
      title="AI 预算 (今日)"
      action={
        <Link href="/admin" className="text-xs text-primary-600 hover:underline">
          管理设置 →
        </Link>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="text-2xl font-semibold">
            {formatUsd(spent)}{" "}
            <span className="text-sm text-default-400">
              / {formatUsd(cap)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="今日 AI 预算用量"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-2 w-full rounded-full bg-default-100 overflow-hidden"
          >
            <div
              className={`h-full ${barColor} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            tone={summary.aiBudget.anthropicConfigured ? "success" : "default"}
          >
            Anthropic{" "}
            {summary.aiBudget.anthropicConfigured ? "已配置" : "未配置"}
          </StatusBadge>
          <StatusBadge
            tone={summary.aiBudget.openaiConfigured ? "success" : "default"}
          >
            OpenAI {summary.aiBudget.openaiConfigured ? "已配置" : "未配置"}
          </StatusBadge>
        </div>
        <div className="text-xs text-default-500 flex items-center gap-2">
          <span>当前:</span>
          <span className="inline-flex items-center rounded bg-default-100 px-2 py-0.5 font-mono text-default-700">
            {summary.aiBudget.currentFamily}
          </span>
        </div>
      </div>
    </Section>
  );
}
