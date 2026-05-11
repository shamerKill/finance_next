// Backtest detail (Phase 3). Server component that pulls head doc + equity
// curve + trades from the gateway, then composes:
//
//   - status banner + headline metrics
//   - live progress widget (only for non-terminal states)
//   - equity curve chart
//   - paginated trades table
//
// We pass the data into client subcomponents for the WS hook + chart.

import { getBacktest, getEquityCurve, getTrades } from "@/data/api-client";
import type { TypeBacktest, TypeBacktestTrade, TypeEquityPoint } from "@/data/type";

import { EquityChart } from "./equity-chart";
import { LiveProgress } from "./live-progress";

export const dynamic = "force-dynamic";

export const metadata = { title: "回测详情" };

const stateLabel = (s: number) => {
  switch (s) {
    case 1: return { label: "等待中", color: "bg-default-100 text-default-700" };
    case 2: return { label: "运行中", color: "bg-warning-100 text-warning-700" };
    case 3: return { label: "已完成", color: "bg-success-100 text-success-700" };
    case 4: return { label: "已失败", color: "bg-danger-100 text-danger-700" };
    default: return { label: "未知", color: "bg-default-100" };
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
  }

  if (loadError) {
    return (
      <div className="rounded border border-danger p-3 text-sm text-danger">
        加载回测失败：{loadError}
      </div>
    );
  }
  if (!head) return null;

  const s = stateLabel(head.state);
  const m = head.metrics ?? {};
  const isTerminal = head.state === 3 || head.state === 4;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-mono">
            {head.runId.slice(0, 16)}…
          </h1>
          <p className="text-sm text-default-500">
            策略：<span className="font-medium">{head.strategyId}</span> ·
            类型：{head.kind} · 创建时间：{" "}
            {new Date(head.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={`rounded px-3 py-1 text-sm ${s.color}`}>{s.label}</span>
      </header>

      {head.state === 4 && head.error ? (
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm">
          <div className="font-medium text-danger">运行失败</div>
          <div className="mt-1 text-danger-700">{head.error}</div>
        </div>
      ) : null}

      {!isTerminal ? <LiveProgress runId={head.runId} /> : null}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        <Card label="总收益" value={fmtPct(m.total_return)} />
        <Card label="夏普比率" value={fmtNum(m.sharpe)} />
        <Card label="索提诺比率" value={fmtNum(m.sortino)} />
        <Card label="最大回撤" value={fmtPct(m.max_dd)} />
        <Card label="年化收益" value={fmtPct(m.cagr)} />
        <Card
          label="交易数 / 胜率"
          value={`${m.n_trades ?? 0} / ${fmtPct(m.win_rate)}`}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">资金曲线</h2>
        <EquityChart points={equity} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">交易</h2>
        {trades.length === 0 ? (
          <div className="text-sm text-default-500">暂无交易记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-default-500">
                  <th className="px-3 py-2">入场时间</th>
                  <th className="px-3 py-2">出场时间</th>
                  <th className="px-3 py-2">均价入场</th>
                  <th className="px-3 py-2">出场价格</th>
                  <th className="px-3 py-2">数量</th>
                  <th className="px-3 py-2">盈亏</th>
                  <th className="px-3 py-2">收益率</th>
                  <th className="px-3 py-2">加仓次数</th>
                  <th className="px-3 py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 200).map((t, i) => (
                  <tr key={i} className="border-t border-default-200">
                    <td className="px-3 py-2">
                      {new Date(t.entryTs).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {new Date(t.exitTs).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{fmtNum(t.entryPrice, 4)}</td>
                    <td className="px-3 py-2">{fmtNum(t.exitPrice, 4)}</td>
                    <td className="px-3 py-2">{fmtNum(t.size, 2)}</td>
                    <td
                      className={`px-3 py-2 ${
                        t.pnl >= 0 ? "text-success-700" : "text-danger-700"
                      }`}
                    >
                      {fmtNum(t.pnl, 2)}
                    </td>
                    <td className="px-3 py-2">{fmtPct(t.returnPct)}</td>
                    <td className="px-3 py-2">{t.nAdds}</td>
                    <td className="px-3 py-2">{t.exitReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trades.length > 200 ? (
              <div className="mt-2 text-xs text-default-500">
                显示 {trades.length} 条中的 200 条。
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-default-200 p-3">
      <div className="text-xs text-default-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
