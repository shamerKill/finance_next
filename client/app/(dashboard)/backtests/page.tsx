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
      return { label: "PENDING", color: "bg-default-100 text-default-700" };
    case 2:
      return { label: "RUNNING", color: "bg-warning-100 text-warning-700" };
    case 3:
      return { label: "COMPLETED", color: "bg-success-100 text-success-700" };
    case 4:
      return { label: "FAILED", color: "bg-danger-100 text-danger-700" };
    default:
      return { label: "UNKNOWN", color: "bg-default-100" };
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
    error = e instanceof Error ? e.message : "failed";
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Backtests</h1>
          <p className="text-sm text-default-500">
            Vectorised strategy runs persisted in Mongo + TimescaleDB
          </p>
        </div>
        <Link
          href="/backtests/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          New backtest
        </Link>
      </header>

      {error ? (
        <div className="rounded border border-warning-200 bg-warning-50 p-3 text-sm">
          Backtests unavailable: {error}
        </div>
      ) : null}

      {runs.length === 0 && !error ? (
        <div className="text-sm text-default-500">
          No backtests yet. Click <em>New backtest</em> to run one.
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-default-500">
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Strategy</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Total return</th>
              <th className="px-3 py-2">Sharpe</th>
              <th className="px-3 py-2">Max DD</th>
              <th className="px-3 py-2">Trades</th>
              <th className="px-3 py-2">Created</th>
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
