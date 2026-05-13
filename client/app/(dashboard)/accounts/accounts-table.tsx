"use client";

import Link from "next/link";

import { DataTable, DataTableColumn } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { TypeAccount } from "@/data/type";

// Client subcomponent. Server page fetches accounts; column definitions
// (with `render` functions) live here so they don't cross the RSC →
// client boundary as raw function props (which Next.js rejects).
export default function AccountsTable({ rows }: { rows: TypeAccount[] }) {
  const columns: DataTableColumn<TypeAccount>[] = [
    {
      key: "label",
      label: "标签",
      render: (a) => (
        <Link
          href={`/accounts/${a.id}`}
          className="font-medium text-text-primary hover:text-brand-primary hover:underline"
        >
          {a.label}
        </Link>
      ),
    },
    {
      key: "exchange",
      label: "交易所",
      render: (a) => (
        <span className="capitalize text-text-secondary">{a.exchange}</span>
      ),
    },
    {
      key: "email",
      label: "邮箱",
      render: (a) => (
        <span className="text-text-secondary truncate">{a.email}</span>
      ),
    },
    {
      key: "permissions",
      label: "权限",
      align: "end",
      render: (a) => (
        <div className="flex gap-1 justify-end flex-wrap">
          {a.permissions.canTrade && (
            <StatusBadge tone="success" variant="flat" size="sm">
              交易
            </StatusBadge>
          )}
          {a.permissions.canWithdraw && (
            <StatusBadge tone="danger" variant="flat" size="sm">
              提现
            </StatusBadge>
          )}
          {!a.permissions.canTrade && !a.permissions.canWithdraw && (
            <StatusBadge tone="default" variant="flat" size="sm">
              只读
            </StatusBadge>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable<TypeAccount>
      ariaLabel="账户列表"
      mobileLayout="card"
      columns={columns}
      rows={rows}
      getRowKey={(a) => a.id}
    />
  );
}
