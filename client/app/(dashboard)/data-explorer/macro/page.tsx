// Phase 8 macro explorer. Server-component pulls a default FRED series
// (CPIAUCSL) and renders a line chart + DataTable of recent observations.
//
// Node 2.C.5.d — replaced bespoke table with DataTable; added a
// ChartShell line view for the same series. Business logic untouched.

import { ApiErrorView } from "@/components/api-error";
import { ChartShell, type ChartBar } from "@/components/chart-shell";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { getMacroIndicators } from "@/data/api-client";
import type { TypeMacroPoint } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "宏观指标" };

const DEFAULT_SOURCE = "fred";
const DEFAULT_CODE = "CPIAUCSL";

const COLUMNS: DataTableColumn<TypeMacroPoint>[] = [
  {
    key: "ts",
    label: "时间",
    render: (r) => (
      <span className="font-mono text-text-secondary">{r.ts}</span>
    ),
  },
  {
    key: "value",
    label: "数值",
    align: "end",
    render: (r) => (
      <span className="font-mono tnum text-text-primary">{r.value}</span>
    ),
  },
  {
    key: "unit",
    label: "单位",
    render: (r) => r.unit,
  },
];

function toChartBars(points: TypeMacroPoint[]): ChartBar[] {
  return points.map((p) => ({ time: p.ts, value: p.value }));
}

export default async function MacroPage() {
  let points: TypeMacroPoint[] = [];
  let error: unknown = null;
  try {
    points = await getMacroIndicators(DEFAULT_SOURCE, DEFAULT_CODE);
  } catch (e) {
    error = e;
  }
  // Display newest first in the table; chart uses chronological order
  // (oldest → newest) for proper x-axis progression.
  const rows = [...points].reverse().slice(0, 200);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`宏观 — ${DEFAULT_SOURCE}:${DEFAULT_CODE}`}
        subtitle={`显示最近 ${rows.length} 条观测数据。`}
        action={
          <IngestButton
            path="v1/admin/ingest/macro"
            body={{ source: DEFAULT_SOURCE, code: DEFAULT_CODE }}
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
            description="该宏观指标尚未入库。点击右上角“立即抓取数据”触发一次采集。"
          />
        )}
      </Section>
      <Section title="最近观测">
        <DataTable
          ariaLabel="macro indicators"
          mobileLayout="card"
          columns={COLUMNS}
          rows={rows}
          getRowKey={(r) => r.ts}
          emptyState={
            <EmptyState
              title="暂无数据"
              description="尚未抓取或时间窗口内无观测。"
            />
          }
        />
      </Section>
    </div>
  );
}
