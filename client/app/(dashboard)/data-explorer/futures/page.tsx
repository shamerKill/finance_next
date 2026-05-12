// Phase 8 futures explorer. Defaults to the SHFE copper front-month
// (cu2412).
//
// Node 2.C.5.d — ChartShell candle + Section wrapper + EmptyState.
// Business logic unchanged.

import { ApiErrorView } from "@/components/api-error";
import { ChartShell, type ChartBar } from "@/components/chart-shell";
import { EmptyState } from "@/components/empty-state";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { getFuturesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "期货数据" };

const DEFAULT_EXCHANGE = "shfe";
const DEFAULT_CONTRACT = "cu2412";
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

export default async function FuturesPage() {
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 24 * 60 * 60 * 1000);
  let bars: TypeOhlcvBar[] = [];
  let error: unknown = null;
  try {
    bars = await getFuturesOhlcv(
      DEFAULT_EXCHANGE,
      DEFAULT_CONTRACT,
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
        title={`期货 — ${DEFAULT_CONTRACT}`}
        subtitle={`${DEFAULT_EXCHANGE.toUpperCase()} · ${DEFAULT_TIMEFRAME} · 近 180 天`}
        action={
          <IngestButton
            path="v1/admin/ingest/futures"
            body={{ exchange: DEFAULT_EXCHANGE, contract: DEFAULT_CONTRACT }}
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
