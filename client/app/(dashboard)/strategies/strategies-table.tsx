"use client";

import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { TypeOption } from "@/data/type";

// Live + mode rendered as a single badge — keeps the table cell narrow
// and reads at a glance.
function LiveBadge({ s }: { s: TypeOption }) {
  if (!s.live?.enabled) {
    return <StatusBadge tone="default">关闭</StatusBadge>;
  }
  if (s.live.mode === "mainnet") {
    return <StatusBadge tone="danger">主网</StatusBadge>;
  }
  return <StatusBadge tone="success">测试网</StatusBadge>;
}

function RiskCell({ s }: { s: TypeOption }) {
  if (!s.risk) {
    return (
      <span className="text-xs text-text-tertiary">—（订单将被拒绝）</span>
    );
  }
  return (
    <span className="font-mono tnum text-xs text-text-secondary">
      仓位 ${s.risk.maxPositionUsd} · 杠杆 {s.risk.maxLeverage}× · 日亏 $
      {s.risk.dailyLossCapUsd}
    </span>
  );
}

// Client subcomponent for the strategies DataTable. The column `render`
// callbacks live here so they don't cross the RSC → client boundary as
// raw function props.
export default function StrategiesTable({ rows }: { rows: TypeOption[] }) {
  const columns: DataTableColumn<TypeOption>[] = [
    {
      key: "name",
      label: "名称",
      render: (s) =>
        s.id ? (
          <Link
            className="font-medium text-brand-primary hover:underline"
            href={`/strategies/${s.id}`}
          >
            {s.name}
          </Link>
        ) : (
          <span className="font-medium">{s.name}</span>
        ),
    },
    {
      key: "execSymbol",
      label: "交易对",
      render: (s) => (
        <span className="font-mono tnum text-sm">{s.execSymbol}</span>
      ),
    },
    {
      key: "live",
      label: "实盘",
      render: (s) => <LiveBadge s={s} />,
    },
    {
      key: "risk",
      label: "风控",
      render: (s) => <RiskCell s={s} />,
    },
  ];

  return (
    <DataTable
      ariaLabel="strategies"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(s) => s.id ?? s.name}
    />
  );
}
