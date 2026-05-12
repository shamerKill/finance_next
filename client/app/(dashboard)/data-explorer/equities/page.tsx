// Phase 8 equities explorer. Server component — fetches default
// (AAPL nasdaq, last 90d daily) and renders a candlestick chart.
//
// Node 2.C.5.d — replaced bespoke chart wrapper with ChartShell (type=
// candle) wrapped in Section. Empty state uses EmptyState. No business
// logic touched; IngestButton still drives the original ingest path.

import { ApiErrorView } from "@/components/api-error";
import { ChartShell, type ChartBar } from "@/components/chart-shell";
import { EmptyState } from "@/components/empty-state";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { getEquitiesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "股票数据" };

const DEFAULT_EXCHANGE = "nasdaq";
const DEFAULT_SYMBOL = "AAPL.nasdaq";
const DEFAULT_TIMEFRAME = "1d";

function toChartBars(bars: TypeOhlcvBar[]): ChartBar[] {
  return bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

export default async function EquitiesPage() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  let bars: TypeOhlcvBar[] = [];
  let error: unknown = null;
  try {
    bars = await getEquitiesOhlcv(
      DEFAULT_EXCHANGE,
      DEFAULT_SYMBOL,
      DEFAULT_TIMEFRAME,
      start,
      end,
    );
  } catch (e) {
    error = e;
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`股票 — ${DEFAULT_SYMBOL}`}
        subtitle={`${DEFAULT_EXCHANGE.toUpperCase()} · ${DEFAULT_TIMEFRAME} · 近 90 天`}
        action={
          <IngestButton
            path="v1/admin/ingest/equities"
            body={{ exchange: DEFAULT_EXCHANGE, symbol: DEFAULT_SYMBOL }}
          />
        }
      />
      <ApiErrorView error={error} />
      <Section title="K 线图">
        {bars.length > 0 ? (
          <ChartShell type="candle" data={toChartBars(bars)} />
        ) : (
          <EmptyState
            title="暂无 K 线数据"
            description="该时间窗口内未找到数据。点击右上角“立即抓取数据”触发一次入库。"
          />
        )}
      </Section>
    </div>
  );
}
