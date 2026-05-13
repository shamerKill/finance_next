"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { TypeMacroPoint } from "@/data/type";

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

// Client subcomponent — keeps the column `render` callbacks on the
// client side of the RSC boundary.
export default function MacroTable({ rows }: { rows: TypeMacroPoint[] }) {
  return (
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
  );
}
