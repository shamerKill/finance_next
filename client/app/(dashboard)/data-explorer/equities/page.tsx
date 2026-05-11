// Phase 8 equities explorer. Server component — fetches default
// (AAPL nasdaq, last 90d daily) and hands rows to a client-side chart
// component (reused from /markets) for browser rendering.

import { OhlcvChart } from "@/app/(dashboard)/markets/chart";
import { getEquitiesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

const DEFAULT_EXCHANGE = "nasdaq";
const DEFAULT_SYMBOL = "AAPL.nasdaq";
const DEFAULT_TIMEFRAME = "1d";

export default async function EquitiesPage() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  let bars: TypeOhlcvBar[] = [];
  let error: string | null = null;
  try {
    bars = await getEquitiesOhlcv(
      DEFAULT_EXCHANGE,
      DEFAULT_SYMBOL,
      DEFAULT_TIMEFRAME,
      start,
      end,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "加载股票数据失败";
  }
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">股票 — {DEFAULT_SYMBOL}</h1>
        <p className="text-sm text-default-500">
          {DEFAULT_EXCHANGE.toUpperCase()} · {DEFAULT_TIMEFRAME} · 近 90 天
        </p>
      </header>
      {error && (
        <div className="text-sm text-warning border border-warning rounded p-2">
          {error}
        </div>
      )}
      <OhlcvChart bars={bars} />
    </div>
  );
}
