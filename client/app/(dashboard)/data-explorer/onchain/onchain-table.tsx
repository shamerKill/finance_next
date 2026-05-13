"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { TypeOnchainPoint } from "@/data/type";

const COLUMNS: DataTableColumn<TypeOnchainPoint>[] = [
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
    key: "source",
    label: "来源",
    render: (r) => r.source,
  },
];

// Client subcomponent — keeps the column `render` callbacks on the
// client side of the RSC boundary.
export default function OnchainTable({ rows }: { rows: TypeOnchainPoint[] }) {
  return (
    <DataTable
      ariaLabel="onchain metrics"
      mobileLayout="card"
      columns={COLUMNS}
      rows={rows}
      getRowKey={(r) => `${r.source}-${r.ts}`}
      emptyState={
        <EmptyState
          title="暂无数据"
          description="尚未抓取或时间窗口内无观测。"
        />
      }
    />
  );
}
