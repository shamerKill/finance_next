// Markets dashboard page. Server component that reads URL-driven
// exchange/symbol/timeframe/range params (F1), computes the time
// window, fetches OHLCV, and renders the chart + a compact stats row.
// The control bar (client) writes new params via router.push so the
// page re-renders.

import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { getOhlcv, type TypeOhlcvBar } from "@/data/api-client";
import type { TypeExchange } from "@/data/type";

import { OhlcvChart } from "./chart";
import { MarketsControls } from "./controls";

export const dynamic = "force-dynamic";

export const metadata = { title: "行情" };

const DEFAULT_EXCHANGE: TypeExchange = "binance";
const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_TIMEFRAME = "1h";
const DEFAULT_RANGE = "30d";

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

const VALID_EXCHANGES: TypeExchange[] = ["binance", "okx", "bybit"];

// Compact stats row below the chart. Uses the last bar for the
// current close, the bar from 24h prior for the change %, and the
// min/max close of the full window for the range.
function computeStats(bars: TypeOhlcvBar[], timeframe: string) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const close = last.close;
  // For 24h change we need to walk back N bars where N depends on tf.
  const barsPerDay: Record<string, number> = {
    "1m": 60 * 24,
    "5m": 12 * 24,
    "1h": 24,
    "1d": 1,
  };
  const n = barsPerDay[timeframe] ?? 24;
  const idx24 = Math.max(0, bars.length - 1 - n);
  const prev24 = bars[idx24]?.close ?? bars[0].close;
  const change24 = prev24 ? (close - prev24) / prev24 : 0;
  const high = bars.reduce((acc, b) => Math.max(acc, b.high), -Infinity);
  const low = bars.reduce((acc, b) => Math.min(acc, b.low), Infinity);
  return { close, change24, high, low };
}

function fmtPrice(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const exchange = (
    sp.ex && VALID_EXCHANGES.includes(sp.ex as TypeExchange)
      ? sp.ex
      : DEFAULT_EXCHANGE
  ) as TypeExchange;
  const symbol = sp.sym || DEFAULT_SYMBOL;
  const timeframe = sp.tf || DEFAULT_TIMEFRAME;
  const range = sp.range && RANGE_DAYS[sp.range] ? sp.range : DEFAULT_RANGE;

  const end = new Date();
  const days = RANGE_DAYS[range];
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  let bars: TypeOhlcvBar[] = [];
  let error: unknown = null;
  try {
    bars = await getOhlcv(exchange, symbol, timeframe, start, end);
  } catch (e) {
    // Backend or Timescale may not be wired in dev; render an empty
    // chart with an inline note instead of failing the page.
    error = e;
  }

  // IngestButton body now follows the active selection rather than a
  // fixed BTCUSDT/1h tuple.
  const ingestBody = {
    exchange,
    symbol,
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  const stats = computeStats(bars, timeframe);

  return (
    <div className="flex flex-col gap-4">
      <RecentTracker
        id={`${exchange}:${symbol}:${timeframe}`}
        kind="market"
        label={`${exchange.toUpperCase()} ${symbol} ${timeframe}`}
        path={`/markets?ex=${exchange}&sym=${symbol}&tf=${timeframe}&range=${range}`}
      />
      <PageHeader
        title="行情"
        subtitle={`${exchange.toUpperCase()} · ${symbol} · ${timeframe} · ${range}`}
        action={<IngestButton path="v1/market/ingest" body={ingestBody} />}
      />

      <MarketsControls
        exchange={exchange}
        symbol={symbol}
        timeframe={timeframe}
        range={range}
      />

      <ApiErrorView error={error} />

      <OhlcvChart bars={bars} />

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm rounded-md border border-default-200 p-3">
          <div>
            <div className="text-xs text-default-500">最新收盘</div>
            <div className="text-lg font-semibold">${fmtPrice(stats.close)}</div>
          </div>
          <div>
            <div className="text-xs text-default-500">24h 涨跌</div>
            <div
              className={`text-lg font-semibold ${
                stats.change24 >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {fmtPct(stats.change24)}
            </div>
          </div>
          <div>
            <div className="text-xs text-default-500">区间最高</div>
            <div className="text-lg font-semibold">${fmtPrice(stats.high)}</div>
          </div>
          <div>
            <div className="text-xs text-default-500">区间最低</div>
            <div className="text-lg font-semibold">${fmtPrice(stats.low)}</div>
          </div>
        </div>
      ) : null}

      {!error && bars.length === 0 ? (
        <div className="text-sm text-default-500">
          请求时间窗口内暂无 K 线数据。点击右上角“立即抓取数据”触发一次入库。
        </div>
      ) : null}
    </div>
  );
}
