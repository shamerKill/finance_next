"use client";

import { DataTable } from "@/components/data-table";
import type { TypeBacktestTrade } from "@/data/type";

const fmtPct = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : (n * 100).toFixed(2) + "%";
const fmtNum = (n: number | undefined, digits = 2) =>
  n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);

// Client subcomponent for the backtest trades DataTable. The column
// `render` callbacks live here so they don't cross the RSC → client
// boundary as raw function props.
export default function TradesTable({ rows }: { rows: TypeBacktestTrade[] }) {
  return (
    <DataTable<TypeBacktestTrade>
      ariaLabel="backtest trades"
      mobileLayout="card"
      rows={rows.slice(0, 200)}
      getRowKey={(t) => `${t.entryTs}-${t.exitTs}-${t.entryPrice}`}
      emptyState="暂无交易记录。"
      columns={[
        {
          key: "entryTs",
          label: "入场时间",
          render: (t) => new Date(t.entryTs).toLocaleString(),
        },
        {
          key: "exitTs",
          label: "出场时间",
          render: (t) => new Date(t.exitTs).toLocaleString(),
        },
        {
          key: "entryPrice",
          label: "入场均价",
          align: "end",
          render: (t) => fmtNum(t.entryPrice, 4),
        },
        {
          key: "exitPrice",
          label: "出场价格",
          align: "end",
          render: (t) => fmtNum(t.exitPrice, 4),
        },
        {
          key: "size",
          label: "数量",
          align: "end",
          render: (t) => fmtNum(t.size, 2),
        },
        {
          key: "pnl",
          label: "盈亏",
          align: "end",
          render: (t) => (
            <span
              className={
                t.pnl >= 0 ? "text-accent-up" : "text-accent-down"
              }
            >
              {fmtNum(t.pnl, 2)}
            </span>
          ),
        },
        {
          key: "returnPct",
          label: "收益率",
          align: "end",
          render: (t) => fmtPct(t.returnPct),
        },
        {
          key: "nAdds",
          label: "加仓次数",
          align: "end",
          render: (t) => t.nAdds,
          hideOnCard: true,
        },
        {
          key: "exitReason",
          label: "原因",
          render: (t) => t.exitReason,
        },
      ]}
    />
  );
}
