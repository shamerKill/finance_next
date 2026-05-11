// Parent-strategy performance widget — sits above the diff table on the
// recommendation detail page. Shows the strategy's current 30d PnL plus
// live/mode status so the operator can compare "what's running now" vs.
// "what the AI proposes" without context-switching. Renders nothing if
// performance fetch failed (strategy deleted, repo unavailable) —
// recommendation review is still useful without the comparison panel.

import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { fmtPct, fmtUsd, deltaToneClass } from "@/data/format";
import type { TypeOption, TypeStrategyPerformance } from "@/data/type";

interface Props {
  strategy: TypeOption | null;
  performance: TypeStrategyPerformance | null;
}

export function ParentStrategyPanel({ strategy, performance }: Props) {
  if (!strategy) {
    return null;
  }
  const live = strategy.live?.enabled ?? false;
  const mode = strategy.live?.mode ?? "testnet";

  // 30d return ratio: PnL / open notional. The gateway doesn't compute
  // a clean "% of capital" so we approximate from notional. When notional
  // is zero (no open positions) we just hide the percentage rather than
  // emit a misleading +Infinity.
  const pnl30d = performance?.kpis.realised30dUsd ?? 0;
  const notional = performance?.kpis.currentOpenNotionalUsd ?? 0;
  const pctOfNotional = notional > 0 ? pnl30d / notional : null;

  return (
    <section className="rounded-md border border-default-200 bg-default-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-default-500">父策略</div>
          <div className="mt-0.5 text-base font-semibold">
            {strategy.name}{" "}
            <span className="ml-1 rounded bg-default-100 px-1.5 py-0.5 font-mono text-xs text-default-600">
              {strategy.execSymbol}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <StatusBadge tone={live ? "success" : "default"}>
            {live ? `● 运行中 · ${mode === "mainnet" ? "主网" : "测试网"}` : "未运行"}
          </StatusBadge>
          <Link
            href={`/strategies/${strategy.id ?? ""}`}
            className="text-primary hover:underline"
          >
            打开策略 →
          </Link>
        </div>
      </div>

      {performance && (
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-xs text-default-500">30d 已实现 PnL</div>
            <div
              className={`mt-0.5 text-lg font-semibold tabular-nums ${deltaToneClass(pnl30d)}`}
            >
              {fmtUsd(pnl30d)}
              {pctOfNotional !== null && (
                <span className="ml-2 text-sm font-normal">
                  ({fmtPct(pctOfNotional)})
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-default-500">24h 已实现 PnL</div>
            <div
              className={`mt-0.5 text-lg font-semibold tabular-nums ${deltaToneClass(performance.kpis.realised24hUsd)}`}
            >
              {fmtUsd(performance.kpis.realised24hUsd)}
            </div>
          </div>
          <div>
            <div className="text-xs text-default-500">总交易数</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-default-700">
              {performance.kpis.tradesTotal}
            </div>
          </div>
          <div>
            <div className="text-xs text-default-500">当前持仓名义</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-default-700">
              {fmtUsd(performance.kpis.currentOpenNotionalUsd)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
