"use client";

import { DataTable, DataTableColumn } from "@/components/data-table";
import { TypePosition } from "@/data/type";

// Client subcomponent for the positions DataTable. See balances-table.tsx
// for the rationale.
export default function PositionsTable({ rows }: { rows: TypePosition[] }) {
  const columns: DataTableColumn<TypePosition>[] = [
    { key: "symbol", label: "交易对" },
    { key: "positionSide", label: "方向" },
    {
      key: "positionAmt",
      label: "数量",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.positionAmt}</span>,
    },
    {
      key: "entryPrice",
      label: "开仓价",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.entryPrice}</span>,
    },
    {
      key: "markPrice",
      label: "标记价",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.markPrice}</span>,
    },
    {
      key: "unrealizedProfit",
      label: "盈亏",
      align: "end",
      render: (p) => {
        const v = Number(p.unrealizedProfit);
        const cls =
          Number.isFinite(v) && v > 0
            ? "text-accent-up"
            : Number.isFinite(v) && v < 0
              ? "text-accent-down"
              : "text-text-secondary";
        return (
          <span className={`font-mono tnum ${cls}`}>{p.unrealizedProfit}</span>
        );
      },
    },
    {
      key: "leverage",
      label: "杠杆",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.leverage}x</span>,
    },
  ];

  return (
    <DataTable<TypePosition>
      ariaLabel="账户持仓"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(p) => `${p.symbol}-${p.positionSide}`}
    />
  );
}
