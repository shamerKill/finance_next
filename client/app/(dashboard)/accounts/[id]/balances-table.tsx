"use client";

import { DataTable, DataTableColumn } from "@/components/data-table";
import { TypeBalance } from "@/data/type";

// Client subcomponent for the balances DataTable. The `render` callbacks
// for each column cannot be passed across the RSC → client boundary, so
// the entire column spec lives in this client island.
export default function BalancesTable({ rows }: { rows: TypeBalance[] }) {
  const columns: DataTableColumn<TypeBalance>[] = [
    { key: "asset", label: "资产", render: (b) => <span>{b.asset}</span> },
    {
      key: "free",
      label: "可用",
      align: "end",
      render: (b) => <span className="font-mono tnum">{b.free}</span>,
    },
    {
      key: "locked",
      label: "冻结",
      align: "end",
      render: (b) => <span className="font-mono tnum">{b.locked}</span>,
    },
    {
      key: "wallet",
      label: "钱包",
      render: (b) => <span className="text-text-tertiary">{b.wallet}</span>,
    },
  ];

  return (
    <DataTable<TypeBalance>
      ariaLabel="账户余额"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(b) => `${b.wallet}-${b.asset}`}
    />
  );
}
