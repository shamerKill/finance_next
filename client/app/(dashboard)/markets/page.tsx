// Markets dashboard page (Phase 2). Server component that fetches the
// default symbol/timeframe (BTCUSDT 1h, last 30d) and hands the result to
// a client-side chart. lightweight-charts is browser-only so the chart
// itself is a "use client" component.

import { getOhlcv, type TypeOhlcvBar } from "@/data/api-client";
import { OhlcvChart } from "./chart";

export const dynamic = "force-dynamic";

const DEFAULT_EXCHANGE = "binance";
const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_TIMEFRAME = "1h";

export default async function MarketsPage() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  let bars: TypeOhlcvBar[] = [];
  let error: string | null = null;
  try {
    bars = await getOhlcv(
      DEFAULT_EXCHANGE,
      DEFAULT_SYMBOL,
      DEFAULT_TIMEFRAME,
      start,
      end,
    );
  } catch (e) {
    // Backend or Timescale may not be wired in dev; render an empty chart
    // with an inline note instead of failing the page.
    error = e instanceof Error ? e.message : "Failed to load market data";
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-default-500">
          {DEFAULT_EXCHANGE.toUpperCase()} · {DEFAULT_SYMBOL} · {DEFAULT_TIMEFRAME} ·
          last 30 days
        </p>
      </header>

      {error ? (
        <div className="rounded border border-warning-200 bg-warning-50 p-3 text-sm">
          Market data unavailable: {error}
          <div className="mt-1 text-xs text-default-500">
            Configure <code>TIMESCALE_DSN</code> on the gateway and run an
            ingest via <code>POST /api/v1/market/ingest</code>.
          </div>
        </div>
      ) : null}

      <OhlcvChart bars={bars} />

      {!error && bars.length === 0 ? (
        <div className="text-sm text-default-500">
          No bars in the requested window. Trigger an ingest with{" "}
          <code>POST /api/v1/market/ingest</code>.
        </div>
      ) : null}
    </div>
  );
}
