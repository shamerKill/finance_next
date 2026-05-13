"use client";

import Link from "next/link";

import { DataTable } from "@/components/data-table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import type { TypeBacktest } from "@/data/type";

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

// Client subcomponent for the backtests list DataTable. Column `render`
// callbacks can't cross the RSC → client boundary as raw functions, so
// the column spec lives here.
export default function BacktestsTable({ rows }: { rows: TypeBacktest[] }) {
  return (
    <DataTable<TypeBacktest>
      ariaLabel="backtest runs"
      mobileLayout="card"
      rows={rows}
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
  );
}
