// Phase 8 on-chain explorer. Defaults to BTC hash rate.
//
// Node 2.C.5.d — line ChartShell + DataTable wrapped in Sections.
// Business logic unchanged. Column `render` callbacks live in
// <OnchainTable> (client) to keep functions on the client side of the
// RSC boundary.

import { ApiErrorView } from "@/components/api-error";
import { ChartShell, type ChartBar } from "@/components/chart-shell";
import { EmptyState } from "@/components/empty-state";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { getOnchainMetrics } from "@/data/api-client";
import type { TypeOnchainPoint } from "@/data/type";

import OnchainTable from "./onchain-table";

export const metadata = { title: "链上指标" };

export const dynamic = "force-dynamic";

const DEFAULT_CHAIN = "btc";
const DEFAULT_METRIC = "hash_rate";

function toChartBars(points: TypeOnchainPoint[]): ChartBar[] {
  return points.map((p) => ({ time: p.ts, value: p.value }));
}

export default async function OnchainPage() {
  let points: TypeOnchainPoint[] = [];
  let error: unknown = null;
  try {
    points = await getOnchainMetrics(DEFAULT_CHAIN, DEFAULT_METRIC);
  } catch (e) {
    error = e;
  }
  const rows = [...points].reverse().slice(0, 200);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`链上 — ${DEFAULT_CHAIN}:${DEFAULT_METRIC}`}
        subtitle={`显示最近 ${rows.length} 条观测数据。`}
        action={
          <IngestButton
            path="v1/admin/ingest/onchain"
            body={{ chain: DEFAULT_CHAIN, metric: DEFAULT_METRIC }}
          />
        }
      />
      <ApiErrorView error={error} />
      <Section title="走势">
        {points.length > 0 ? (
          <ChartShell type="line" data={toChartBars(points)} />
        ) : (
          <EmptyState
            title="暂无观测数据"
            description="该链上指标尚未入库。点击右上角“立即抓取数据”触发一次采集。"
          />
        )}
      </Section>
      <Section title="最近观测">
        <OnchainTable rows={rows} />
      </Section>
    </div>
  );
}
