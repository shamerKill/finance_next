"use client";

import Link from "next/link";

import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { TypeWallet } from "@/data/type";

// Client subcomponent for the wallets DataTable. Column `render`
// callbacks live here so they don't cross the RSC → client boundary
// as raw function props.
export default function WalletsTable({ rows }: { rows: TypeWallet[] }) {
  return (
    <DataTable<TypeWallet>
      ariaLabel="Polygon 钱包列表"
      mobileLayout="card"
      rows={rows}
      getRowKey={(w) => w.id}
      emptyState="暂无钱包"
      columns={[
        {
          key: "label",
          label: "标签",
          render: (w) => (
            <Link
              href={`/wallets/${w.id}`}
              className="font-medium text-brand-primary hover:underline"
            >
              {w.label}
            </Link>
          ),
        },
        {
          key: "address",
          label: "地址",
          render: (w) => (
            <span className="font-mono text-mono-sm break-all">
              {w.address}
            </span>
          ),
        },
        {
          key: "balance",
          label: "USDC 缓存余额",
          align: "end",
          render: (w) =>
            w.usdcBalanceCached != null ? (
              <span className="font-mono tnum">
                ${w.usdcBalanceCached.toFixed(2)}
              </span>
            ) : (
              <span className="text-text-tertiary">—</span>
            ),
        },
        {
          key: "allowance",
          label: "授权额度",
          align: "end",
          render: (w) =>
            w.usdcAllowanceCached != null ? (
              <span className="font-mono tnum">
                ${w.usdcAllowanceCached.toFixed(2)}
              </span>
            ) : (
              <span className="text-text-tertiary">—</span>
            ),
        },
        {
          key: "status",
          label: "状态",
          render: (w) =>
            w.usdcAllowanceCached != null && w.usdcAllowanceCached > 0 ? (
              <StatusBadge tone="success" variant="dot">
                已授权
              </StatusBadge>
            ) : (
              <StatusBadge tone="default" variant="dot">
                未授权
              </StatusBadge>
            ),
        },
      ]}
    />
  );
}
