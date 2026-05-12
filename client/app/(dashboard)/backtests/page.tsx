// Backtests list (Phase 3). Server component fetching from the gateway.
//
// Node 2.C.5.c — adopts the design-system primitives: <PageHeader> for the
// title + action slot, <DataTable> with `mobileLayout="card"` for the
// row→card transform, <StatusBadge> for run state, <EmptyState> for the
// no-data case, and <Callout> for fetch errors. The row spec is the only
// place that knows about backtest fields; everything else is a primitive.
//
// We intentionally do not stuff the request snapshot or full trade list
// into the list view — the head doc on the gateway side includes both and
// they're heavy. The detail page reads them.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { listBacktests } from "@/data/api-client";
import type { TypeBacktest } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "回测" };

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

const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : (n * 100).toFixed(2) + "%";

function NewButton() {
  return (
    <Link
      href="/backtests/new"
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
    >
      新建回测
    </Link>
  );
}

export default async function BacktestsListPage() {
  let runs: TypeBacktest[] = [];
  let error: string | null = null;
  try {
    runs = await listBacktests();
  } catch (e) {
    error = e instanceof Error ? e.message : "失败";
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="回测"
        subtitle="向量化策略运行，持久化到 Mongo + TimescaleDB"
        action={<NewButton />}
      />

      {error ? (
        <Callout variant="warning" title="回测不可用">
          {error}
        </Callout>
      ) : null}

      {runs.length === 0 && !error ? (
        <EmptyState
          title="暂无回测"
          description="点击右上角“新建回测”运行第一次。"
          action={<NewButton />}
        />
      ) : null}

      {runs.length > 0 ? (
        <DataTable<TypeBacktest>
          ariaLabel="backtest runs"
          rows={runs}
          getRowKey={(r) => r.runId}
          columns={[
            {
              key: "runId",
              label: "运行",
              render: (r) => (
                <Link
                  className="font-mono text-primary hover:underline"
                  href={`/backtests/${r.runId}`}
                >
                  {r.runId.slice(0, 12)}…
                </Link>
              ),
            },
            {
              key: "state",
              label: "状态",
              render: (r) => {
                const s = stateInfo(r.state);
                return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
              },
            },
            {
              key: "strategy",
              label: "策略",
              render: (r) => (
                <Link
                  className="text-primary hover:underline"
                  href={`/strategies/${r.strategyId}`}
                >
                  {r.strategyId}
                </Link>
              ),
            },
            { key: "kind", label: "类型", render: (r) => r.kind },
            {
              key: "totalReturn",
              label: "总收益",
              align: "end",
              render: (r) => fmt(r.metrics?.total_return),
            },
            {
              key: "sharpe",
              label: "夏普比率",
              align: "end",
              render: (r) => r.metrics?.sharpe?.toFixed(2) ?? "—",
            },
            {
              key: "maxDd",
              label: "最大回撤",
              align: "end",
              render: (r) => fmt(r.metrics?.max_dd),
            },
            {
              key: "nTrades",
              label: "交易数",
              align: "end",
              render: (r) => r.metrics?.n_trades ?? 0,
            },
            {
              key: "createdAt",
              label: "创建时间",
              render: (r) => new Date(r.createdAt).toLocaleString(),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
