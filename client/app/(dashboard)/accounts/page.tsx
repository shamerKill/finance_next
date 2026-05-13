import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listAccounts } from "@/data/api-client";
import { TypeAccount } from "@/data/type";

import AccountsTable from "./accounts-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "账户" };

// Accounts list page. Server component fetches from the gateway directly so
// the first paint is filled in. Supports `?exchange=<venue>` for
// cross-page navigation from the portfolio page — when present, the list
// is client-filtered and a chip surface explains the active filter.
//
// Node 2.C.5.a — list rows now render through <DataTable> (auto card
// layout on mobile per spec §G5); palette migrated to semantic tokens;
// errors flow through <ApiErrorView>. Business logic / fetch unchanged.
// Column `render` callbacks live in <AccountsTable> (client) to avoid
// passing functions through the RSC → client boundary.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ exchange?: string }>;
}) {
  const sp = await searchParams;
  const exchangeFilter = sp.exchange?.trim() || null;

  let accounts: TypeAccount[] = [];
  let error: unknown = null;
  try {
    accounts = await listAccounts();
  } catch (e) {
    error = e;
  }

  const filtered = exchangeFilter
    ? accounts.filter(
        (a) => a.exchange?.toLowerCase() === exchangeFilter.toLowerCase(),
      )
    : accounts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="账户"
        subtitle="跨交易所只读 / 交易凭证。带提现权限的密钥将被拒绝。"
        action={
          <Link
            href="/accounts/new"
            className="px-3 py-2 rounded bg-brand-primary text-text-primary text-sm font-medium hover:opacity-90"
          >
            + 添加账户
          </Link>
        }
      />

      {exchangeFilter && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-tertiary">已筛选交易所：</span>
          <span className="rounded-full bg-bg-surface-2 px-3 py-1 text-text-primary font-mono tnum text-xs">
            {exchangeFilter}
          </span>
          <Link
            href="/accounts"
            className="text-xs text-text-tertiary hover:underline"
          >
            清除筛选 ×
          </Link>
        </div>
      )}

      {error != null && <ApiErrorView error={error} />}

      {error == null && filtered.length === 0 ? (
        <EmptyState
          title={exchangeFilter ? "未匹配任何账户" : "暂无账户"}
          description={
            exchangeFilter
              ? `没有 ${exchangeFilter} 的账户。清除筛选查看全部账户。`
              : "请先添加一个只读 / 交易密钥开始使用。"
          }
          action={
            <Link
              href="/accounts/new"
              className="px-3 py-2 rounded bg-brand-primary text-text-primary text-sm font-medium hover:opacity-90"
            >
              + 添加账户
            </Link>
          }
        />
      ) : error == null ? (
        <AccountsTable rows={filtered} />
      ) : null}
    </div>
  );
}
