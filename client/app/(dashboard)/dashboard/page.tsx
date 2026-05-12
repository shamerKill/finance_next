// Wave 2 Phase B — dashboard landing page.
//
// Server component. Calls /api/v1/dashboard/summary once and renders six
// summary cards in a responsive grid. Auto-refresh is driven by the
// <DashboardRefresher> client island, which schedules router.refresh()
// every 30 seconds so the cards repaint with fresh data without a full
// navigation. Errors thrown from getDashboardSummary() bubble up to the
// route group's error.tsx boundary.
//
// Node 2.C.5.a — adopted design system tokens (bg-bg-surface /
// text-text-primary / accent-up / accent-down etc), KPI rows use <Stat>,
// section cards use <Section>. Logic / API surface unchanged.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
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

function pnlDirection(v: number): "up" | "down" | "flat" {
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

function pnlTextClass(v: number): string {
  if (v > 0) return "text-accent-up";
  if (v < 0) return "text-accent-down";
  return "text-text-secondary";
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

      {/* Top KPI row — five quick-read metrics. Stat values are tnum-mono so
          they line up vertically across responsive grids. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat
          label="总市值"
          value={formatUsd(summary.portfolio.totalUsd)}
          hint={`${summary.portfolio.accountCount} 账户`}
        />
        <Stat
          label="24h PnL"
          value={
            <span className={pnlTextClass(summary.pnl.realised24hUsd)}>
              {formatUsd(summary.pnl.realised24hUsd, { showSign: true })}
            </span>
          }
          delta={{
            value: `${summary.pnl.tradesLast24h} 笔`,
            direction: pnlDirection(summary.pnl.realised24hUsd),
          }}
        />
        <Stat
          label="30d PnL"
          value={
            <span className={pnlTextClass(summary.pnl.realised30dUsd)}>
              {formatUsd(summary.pnl.realised30dUsd, { showSign: true })}
            </span>
          }
        />
        <Stat
          label="挂单中"
          value={`${summary.openOrders.count}`}
          hint={formatUsd(summary.openOrders.openNotionalUsd)}
        />
        <Stat
          label="策略 / 钱包"
          value={`${summary.portfolio.strategyCount} · ${summary.portfolio.walletCount}`}
          hint="活跃数量"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SystemCard summary={summary} />
        <RecommendationsCard summary={summary} />
        <AIBudgetCard summary={summary} />
      </div>

      {summary.notes && summary.notes.length > 0 && (
        <section className="text-xs text-text-tertiary">
          <h3 className="font-medium text-text-secondary mb-1">备注</h3>
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
        <Link
          href="/admin"
          className="text-xs text-brand-primary hover:underline"
        >
          管理 →
        </Link>
      }
    >
      <div className="space-y-2">
        <StatusBadge tone={halted ? "danger" : "success"} variant="solid">
          {halted ? "● 已暂停" : "● 运行中"}
        </StatusBadge>
        {halted ? (
          <div className="text-xs text-text-secondary space-y-0.5">
            {summary.system.haltedReason && (
              <div>原因：{summary.system.haltedReason}</div>
            )}
            {summary.system.haltedBy && (
              <div>由 {summary.system.haltedBy}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-text-tertiary">
            订单引擎正常处理命令流。
          </div>
        )}
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
          className="text-xs text-brand-primary hover:underline"
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
              className="text-sm text-brand-primary hover:underline"
            >
              前往策略 →
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono tnum text-mono-lg text-brand-primary">
              {count}
            </span>
            <span className="text-xs text-text-tertiary">条待审</span>
          </div>
          <ul className="space-y-1 text-sm">
            {top.map((id) => (
              <li key={id}>
                <Link
                  href={`/recommendations/${id}`}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-bg-surface-2"
                >
                  <span className="font-mono tnum text-xs text-text-secondary">
                    {id.slice(0, 8)}
                  </span>
                  <span className="text-text-tertiary">›</span>
                </Link>
              </li>
            ))}
          </ul>
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
  let barColor = "bg-accent-up";
  if (pct >= 90) barColor = "bg-accent-down";
  else if (pct >= 50) barColor = "bg-accent-warning";

  return (
    <Section
      title="AI 预算 (今日)"
      action={
        <Link
          href="/admin"
          className="text-xs text-brand-primary hover:underline"
        >
          管理设置 →
        </Link>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="font-mono tnum text-mono-lg text-text-primary">
            {formatUsd(spent)}{" "}
            <span className="text-sm text-text-tertiary">
              / {formatUsd(cap)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="今日 AI 预算用量"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-2 w-full rounded-full bg-bg-surface-2 overflow-hidden"
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
        <div className="text-xs text-text-tertiary flex items-center gap-2">
          <span>当前:</span>
          <span className="inline-flex items-center rounded bg-bg-surface-2 px-2 py-0.5 font-mono tnum text-text-secondary">
            {summary.aiBudget.currentFamily}
          </span>
        </div>
      </div>
    </Section>
  );
}
