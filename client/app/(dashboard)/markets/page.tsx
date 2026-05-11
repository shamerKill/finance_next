// Markets dashboard page (Phase 2). Server component that fetches the
// default symbol/timeframe (BTCUSDT 1h, last 30d) and hands the result to
// a client-side chart. lightweight-charts is browser-only so the chart
// itself is a "use client" component.

import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
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
  let error: unknown = null;
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
    error = e;
  }

  const ingestBody = {
    exchange: DEFAULT_EXCHANGE,
    symbol: DEFAULT_SYMBOL,
    timeframe: DEFAULT_TIMEFRAME,
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">行情</h1>
          <p className="text-sm text-default-500">
            {DEFAULT_EXCHANGE.toUpperCase()} · {DEFAULT_SYMBOL} ·{" "}
            {DEFAULT_TIMEFRAME} · 最近 30 天
          </p>
        </div>
        <IngestButton path="v1/market/ingest" body={ingestBody} />
      </header>

      <ApiErrorView error={error} />

      <OhlcvChart bars={bars} />

      {!error && bars.length === 0 ? (
        <div className="text-sm text-default-500">
          请求时间窗口内暂无 K 线数据。点击右上角“立即抓取数据”触发一次入库。
        </div>
      ) : null}
    </div>
  );
}
