// Parent-strategy performance widget — sits above the diff table on the
// recommendation detail page. Shows the strategy's current 30d PnL plus
// live/mode status so the operator can compare "what's running now" vs.
// "what the AI proposes" without context-switching. Renders nothing if
// performance fetch failed (strategy deleted, repo unavailable) —
// recommendation review is still useful without the comparison panel.
//
// 2.C.5.b refactor — Section wrap + StatusBadge + Stat tokens.

import Link from "next/link";

import { Section } from "@/components/section";
import { Stat, type StatDirection } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import { fmtPct, fmtUsd, deltaToneClass } from "@/data/format";
import type { TypeOption, TypeStrategyPerformance } from "@/data/type";

interface Props {
  strategy: TypeOption | null;
  performance: TypeStrategyPerformance | null;
}

function dir(n: number | undefined | null): StatDirection {
  if (n === undefined || n === null || !Number.isFinite(n) || n === 0)
    return "flat";
  return n > 0 ? "up" : "down";
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
    <Section title="父策略">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-text-primary">
            {strategy.name}
          </span>
          <span className="rounded bg-bg-surface-2 px-1.5 py-0.5 font-mono tnum text-xs text-text-secondary">
            {strategy.execSymbol}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <StatusBadge tone={live ? "success" : "default"}>
            {live
              ? `● 运行中 · ${mode === "mainnet" ? "主网" : "测试网"}`
              : "未运行"}
          </StatusBadge>
          <Link
            href={`/strategies/${strategy.id ?? ""}`}
            className="text-brand-primary hover:underline"
          >
            打开策略 →
          </Link>
        </div>
      </div>

      {performance && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="30d 已实现 PnL"
            value={
              <span className={`tnum ${deltaToneClass(pnl30d)}`}>
                {fmtUsd(pnl30d)}
                {pctOfNotional !== null && (
                  <span className="ml-2 text-sm font-normal">
                    ({fmtPct(pctOfNotional)})
                  </span>
                )}
              </span>
            }
            delta={{ value: fmtUsd(pnl30d), direction: dir(pnl30d) }}
          />
          <Stat
            label="24h 已实现 PnL"
            value={
              <span
                className={`tnum ${deltaToneClass(performance.kpis.realised24hUsd)}`}
              >
                {fmtUsd(performance.kpis.realised24hUsd)}
              </span>
            }
            delta={{
              value: fmtUsd(performance.kpis.realised24hUsd),
              direction: dir(performance.kpis.realised24hUsd),
            }}
          />
          <Stat
            label="总交易数"
            value={
              <span className="tnum text-text-primary">
                {performance.kpis.tradesTotal}
              </span>
            }
          />
          <Stat
            label="当前持仓名义"
            value={
              <span className="tnum text-text-primary">
                {fmtUsd(performance.kpis.currentOpenNotionalUsd)}
              </span>
            }
          />
        </div>
      )}
    </Section>
  );
}
