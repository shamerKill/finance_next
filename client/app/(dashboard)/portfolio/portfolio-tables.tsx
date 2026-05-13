"use client";

import Link from "next/link";

import { DataTable, DataTableColumn } from "@/components/data-table";
import type { TypePortfolioSummary } from "@/data/type";

type ExchangeRow = TypePortfolioSummary["perExchange"][number];
type AssetRow = TypePortfolioSummary["perAsset"][number];

function formatUsd(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

// Client subcomponent housing the two portfolio DataTables (per-exchange
// and per-asset). The `render` callbacks per column cannot cross the RSC
// → client boundary, so column specs and table renders live here.
export function ExchangeTable({ rows }: { rows: ExchangeRow[] }) {
  const columns: DataTableColumn<ExchangeRow>[] = [
    {
      key: "exchange",
      label: "交易所",
      render: (row) => (
        <Link
          href={`/accounts?exchange=${encodeURIComponent(row.exchange)}`}
          className="capitalize text-brand-primary hover:underline"
        >
          {row.exchange}
        </Link>
      ),
    },
    {
      key: "accounts",
      label: "账户数",
      align: "end",
      render: (row) => (
        <span className="font-mono tnum">{row.accountIds.length}</span>
      ),
    },
    {
      key: "totalUsd",
      label: "总计 USD",
      align: "end",
      render: (row) => (
        <span className="font-mono tnum">{formatUsd(row.totalUsd)}</span>
      ),
    },
  ];

  return (
    <DataTable<ExchangeRow>
      ariaLabel="按交易所汇总"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.exchange}
    />
  );
}

export function AssetTable({ rows }: { rows: AssetRow[] }) {
  const columns: DataTableColumn<AssetRow>[] = [
    {
      key: "asset",
      label: "资产",
      render: (a) => <span className="font-mono tnum">{a.asset}</span>,
    },
    {
      key: "qty",
      label: "数量",
      align: "end",
      render: (a) => (
        <span className="font-mono tnum">
          {a.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
        </span>
      ),
    },
    {
      key: "usdValue",
      label: "USD 价值",
      align: "end",
      render: (a) => (
        <span className="font-mono tnum">{formatUsd(a.usdValue)}</span>
      ),
    },
  ];

  return (
    <DataTable<AssetRow>
      ariaLabel="资产明细"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(a) => a.asset}
    />
  );
}
