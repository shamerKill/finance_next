// Phase 8 futures explorer. Defaults to the SHFE copper front-month
// (cu2412); the chart component is reused from /markets.

import { OhlcvChart } from "@/app/(dashboard)/markets/chart";
import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { getFuturesOhlcv, type TypeOhlcvBar } from "@/data/api-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "期货数据" };

const DEFAULT_EXCHANGE = "shfe";
const DEFAULT_CONTRACT = "cu2412";
const DEFAULT_TIMEFRAME = "1d";

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
      <OhlcvChart bars={bars} />
    </div>
  );
}
