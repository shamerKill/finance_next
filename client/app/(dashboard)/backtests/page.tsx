// Backtests list (Phase 3). Server component fetching from the gateway.
//
// Rendering note: backtest head docs include the request snapshot which
// can be large; we render only the run id + state badge + headline metric
// here. The detail page reads the full doc + equity curve + trades.

import Link from "next/link";

import { listBacktests } from "@/data/api-client";
import type { TypeBacktest } from "@/data/type";

export const dynamic = "force-dynamic";

const stateLabel = (s: number): { label: string; color: string } => {
  switch (s) {
    case 1:
      return { label: "等待中", color: "bg-default-100 text-default-700" };
    case 2:
      return { label: "运行中", color: "bg-warning-100 text-warning-700" };
    case 3:
      return { label: "已完成", color: "bg-success-100 text-success-700" };
    case 4:
      return { label: "已失败", color: "bg-danger-100 text-danger-700" };
    default:
      return { label: "未知", color: "bg-default-100" };
  }
};

const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : (n * 100).toFixed(2) + "%";

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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">回测</h1>
          <p className="text-sm text-default-500">
            向量化策略运行，持久化到 Mongo + TimescaleDB
          </p>
        </div>
        <Link
          href="/backtests/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          新建回测
        </Link>
      </header>

      {error ? (
        <div className="rounded border border-warning-200 bg-warning-50 p-3 text-sm">
          回测不可用：{error}
        </div>
      ) : null}

      {runs.length === 0 && !error ? (
        <div className="text-sm text-default-500">
          暂无回测。点击 <em>新建回测</em> 运行一次。
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-default-500">
              <th className="px-3 py-2">运行</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">策略</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">总收益</th>
              <th className="px-3 py-2">夏普比率</th>
              <th className="px-3 py-2">最大回撤</th>
              <th className="px-3 py-2">交易数</th>
              <th className="px-3 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const s = stateLabel(r.state);
              return (
                <tr key={r.runId} className="border-t border-default-200">
                  <td className="px-3 py-2 font-mono">
                    <Link className="text-primary hover:underline" href={`/backtests/${r.runId}`}>
                      {r.runId.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${s.color}`}>{s.label}</span>
                  </td>
                  <td className="px-3 py-2">{r.strategyId}</td>
                  <td className="px-3 py-2">{r.kind}</td>
                  <td className="px-3 py-2">{fmt(r.metrics?.total_return)}</td>
                  <td className="px-3 py-2">
                    {r.metrics?.sharpe?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-3 py-2">{fmt(r.metrics?.max_dd)}</td>
                  <td className="px-3 py-2">
                    {r.metrics?.n_trades ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
