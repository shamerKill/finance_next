// Backtest detail (Phase 3). Server component that pulls head doc + equity
// curve + trades from the gateway, then composes:
//
//   - status banner + headline metrics (Stat cards)
//   - live progress widget (only for non-terminal states)
//   - segmented tabs: 曲线 / 交易 / 参数 / 元数据
//
// Node 2.C.5.c — primitives swap:
//   * PageHeader gains a tabs slot is intentionally NOT used here because
//     the tabs are *content* tabs (sub-panels of this page), not navigation
//     between sibling pages. The shared <DetailTabs> client island below
//     renders them in-flow under the metrics row.
//   * Equity chart goes through <ChartShell type="line"> (see equity-chart.tsx).
//   * Trades table uses <DataTable> with mobile card layout.
//   * Live progress wraps in <Section> + HeroUI <Progress>.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import {
  getBacktest,
  getEquityCurve,
  getStrategy,
  getTrades,
} from "@/data/api-client";
import type {
  TypeBacktest,
  TypeBacktestTrade,
  TypeEquityPoint,
  TypeOption,
} from "@/data/type";

import { DetailTabs } from "./detail-tabs";
import { EquityChart } from "./equity-chart";
import { LiveProgress } from "./live-progress";

export const dynamic = "force-dynamic";

export const metadata = { title: "回测详情" };

const stateInfo = (s: number): { label: string; tone: StatusTone } => {
  switch (s) {
    case 1:
      return { label: "等待中", tone: "default" };
    case 2:
      return { label: "运行中", tone: "warning" };
    case 3:
      return { label: "已完成", tone: "success" };
    case 4:
      return { label: "已失败", tone: "danger" };
    default:
      return { label: "未知", tone: "default" };
  }
};

const fmtPct = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : (n * 100).toFixed(2) + "%";
const fmtNum = (n: number | undefined, digits = 2) =>
  n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);

type Params = { params: Promise<{ id: string }> };

export default async function BacktestDetailPage({ params }: Params) {
  const { id } = await params;
  let head: TypeBacktest | null = null;
  let equity: TypeEquityPoint[] = [];
  let trades: TypeBacktestTrade[] = [];
  let strategy: TypeOption | null = null;
  let loadError: string | null = null;

  try {
    head = await getBacktest(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (head) {
    try {
      equity = await getEquityCurve(id);
    } catch {
      // Equity curve is optional — if Timescale isn't wired up the chart
      // simply renders an empty state. Don't surface the error here.
    }
    try {
      trades = await getTrades(id);
    } catch {
      // Trades subset is part of head doc; this is a fallback fetch.
    }
    try {
      strategy = await getStrategy(head.strategyId);
    } catch {
      // A deleted strategy is OK — show the raw id in the breadcrumb.
      strategy = null;
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          breadcrumb={
            <Link href="/backtests" className="hover:underline">
              ← 回测
            </Link>
          }
          title="回测详情"
        />
        <Callout variant="danger" title="加载回测失败">
          {loadError}
        </Callout>
      </div>
    );
  }
  if (!head) return null;

  const s = stateInfo(head.state);
  const m = head.metrics ?? {};
  const isTerminal = head.state === 3 || head.state === 4;
  const strategyLabel = strategy
    ? `${strategy.name} (${strategy.execSymbol})`
    : head.strategyId;

  // Tab panels — composed server-side as React nodes and handed to the
  // client <DetailTabs> wrapper.
  const equityPanel = (
    <Section title="资金曲线">
      <EquityChart points={equity} />
    </Section>
  );

  const tradesPanel = (
    <Section title="交易">
      <DataTable<TypeBacktestTrade>
        ariaLabel="backtest trades"
        mobileLayout="card"
        rows={trades.slice(0, 200)}
        getRowKey={(t) => `${t.entryTs}-${t.exitTs}-${t.entryPrice}`}
        emptyState="暂无交易记录。"
        columns={[
          {
            key: "entryTs",
            label: "入场时间",
            render: (t) => new Date(t.entryTs).toLocaleString(),
          },
          {
            key: "exitTs",
            label: "出场时间",
            render: (t) => new Date(t.exitTs).toLocaleString(),
          },
          {
            key: "entryPrice",
            label: "入场均价",
            align: "end",
            render: (t) => fmtNum(t.entryPrice, 4),
          },
          {
            key: "exitPrice",
            label: "出场价格",
            align: "end",
            render: (t) => fmtNum(t.exitPrice, 4),
          },
          {
            key: "size",
            label: "数量",
            align: "end",
            render: (t) => fmtNum(t.size, 2),
          },
          {
            key: "pnl",
            label: "盈亏",
            align: "end",
            render: (t) => (
              <span
                className={
                  t.pnl >= 0 ? "text-accent-up" : "text-accent-down"
                }
              >
                {fmtNum(t.pnl, 2)}
              </span>
            ),
          },
          {
            key: "returnPct",
            label: "收益率",
            align: "end",
            render: (t) => fmtPct(t.returnPct),
          },
          {
            key: "nAdds",
            label: "加仓次数",
            align: "end",
            render: (t) => t.nAdds,
            hideOnCard: true,
          },
          {
            key: "exitReason",
            label: "原因",
            render: (t) => t.exitReason,
          },
        ]}
      />
      {trades.length > 200 ? (
        <div className="mt-2 text-xs text-text-tertiary">
          显示 {trades.length} 条中的 200 条。
        </div>
      ) : null}
    </Section>
  );

  const paramsPanel = (
    <Section title="参数">
      <pre className="text-xs overflow-x-auto font-mono leading-relaxed">
        {JSON.stringify(head.params, null, 2)}
      </pre>
    </Section>
  );

  const metaPanel = (
    <Section title="元数据">
      <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-2 text-sm">
        <dt className="text-text-tertiary">运行 ID</dt>
        <dd className="font-mono break-all">{head.runId}</dd>
        <dt className="text-text-tertiary">策略 ID</dt>
        <dd className="font-mono break-all">{head.strategyId}</dd>
        <dt className="text-text-tertiary">类型</dt>
        <dd>{head.kind}</dd>
        <dt className="text-text-tertiary">创建时间</dt>
        <dd>{new Date(head.createdAt).toLocaleString()}</dd>
        <dt className="text-text-tertiary">开始时间</dt>
        <dd>
          {head.startedAt ? new Date(head.startedAt).toLocaleString() : "—"}
        </dd>
        <dt className="text-text-tertiary">结束时间</dt>
        <dd>
          {head.finishedAt
            ? new Date(head.finishedAt).toLocaleString()
            : "—"}
        </dd>
        <dt className="text-text-tertiary">请求快照</dt>
        <dd>
          <pre className="text-xs overflow-x-auto font-mono leading-relaxed">
            {JSON.stringify(head.request, null, 2)}
          </pre>
        </dd>
      </dl>
    </Section>
  );

  return (
    <div className="flex flex-col gap-6">
      <RecentTracker
        id={head.runId}
        kind="backtest"
        label={strategyLabel}
        path={`/backtests/${head.runId}`}
      />
      <PageHeader
        breadcrumb={
          <span className="flex items-center gap-2">
            <Link href="/backtests" className="hover:underline">
              ← 回测
            </Link>
            <span className="text-default-300">/</span>
            <span className="font-mono">{head.runId.slice(0, 8)}…</span>
          </span>
        }
        title={
          <span className="font-mono text-2xl">
            {head.runId.slice(0, 16)}…
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-text-tertiary">策略</span>
            <Link
              href={`/strategies/${head.strategyId}`}
              className="text-primary hover:underline"
            >
              {strategyLabel}
            </Link>
            <span className="text-default-300">·</span>
            <span className="text-text-tertiary">类型 {head.kind}</span>
            <span className="text-default-300">·</span>
            <span className="text-text-tertiary">
              {new Date(head.createdAt).toLocaleString()}
            </span>
          </span>
        }
        action={<StatusBadge tone={s.tone}>{s.label}</StatusBadge>}
      />

      {head.state === 4 && head.error ? (
        <Callout variant="danger" title="运行失败">
          {head.error}
        </Callout>
      ) : null}

      {!isTerminal ? <LiveProgress runId={head.runId} /> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <Stat label="总收益" value={fmtPct(m.total_return)} />
        <Stat label="夏普比率" value={fmtNum(m.sharpe)} />
        <Stat label="索提诺比率" value={fmtNum(m.sortino)} />
        <Stat label="最大回撤" value={fmtPct(m.max_dd)} />
        <Stat label="年化收益" value={fmtPct(m.cagr)} />
        <Stat
          label="交易数 / 胜率"
          value={`${m.n_trades ?? 0} / ${fmtPct(m.win_rate)}`}
        />
      </section>

      <DetailTabs
        items={[
          { key: "equity", label: "曲线", content: equityPanel },
          { key: "trades", label: "交易", content: tradesPanel },
          { key: "params", label: "参数", content: paramsPanel },
          { key: "meta", label: "元数据", content: metaPanel },
        ]}
      />
    </div>
  );
}
