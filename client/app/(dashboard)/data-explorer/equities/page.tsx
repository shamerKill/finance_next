// Phase 8 equities explorer. Server component — fetches default
// (AAPL nasdaq, last 90d daily) and hands rows to a client-side chart
// component (reused from /markets) for browser rendering.

import { OhlcvChart } from "@/app/(dashboard)/markets/chart";
import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { getEquitiesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "股票数据" };

const DEFAULT_EXCHANGE = "nasdaq";
const DEFAULT_SYMBOL = "AAPL.nasdaq";
const DEFAULT_TIMEFRAME = "1d";

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
      <OhlcvChart bars={bars} />
    </div>
  );
}
