// Phase 8 futures explorer. Defaults to the SHFE copper front-month
// (cu2412); the chart component is reused from /markets.

import { OhlcvChart } from "@/app/(dashboard)/markets/chart";
import { getFuturesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

const DEFAULT_EXCHANGE = "shfe";
const DEFAULT_CONTRACT = "cu2412";
const DEFAULT_TIMEFRAME = "1d";

export default async function FuturesPage() {
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);
  let bars: TypeOhlcvBar[] = [];
  let error: string | null = null;
  try {
    bars = await getFuturesOhlcv(
      DEFAULT_EXCHANGE,
      DEFAULT_CONTRACT,
      DEFAULT_TIMEFRAME,
      start,
      end,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load futures";
  }
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Futures — {DEFAULT_CONTRACT}</h1>
        <p className="text-sm text-default-500">
          {DEFAULT_EXCHANGE.toUpperCase()} · {DEFAULT_TIMEFRAME} · last 180 days
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
