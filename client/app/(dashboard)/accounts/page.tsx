import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listAccounts } from "@/data/api-client";
import { TypeAccount } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "账户" };

// Accounts list page. Server component fetches from the gateway directly so
// the first paint is filled in. Supports `?exchange=<venue>` for
// cross-page navigation from the portfolio page — when present, the list
// is client-filtered and a chip surface explains the active filter.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ exchange?: string }>;
}) {
  const sp = await searchParams;
  const exchangeFilter = sp.exchange?.trim() || null;

  let accounts: TypeAccount[] = [];
  let error: string | null = null;
  try {
    accounts = await listAccounts();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const filtered = exchangeFilter
    ? accounts.filter(
        (a) => a.exchange?.toLowerCase() === exchangeFilter.toLowerCase(),
      )
    : accounts;

  return (
    <div>
      <PageHeader
        title="账户"
        action={
          <Link
            href="/accounts/new"
            className="px-3 py-2 rounded bg-primary text-white text-sm"
          >
            + 添加账户
          </Link>
        }
      />

      {exchangeFilter && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-default-500">已筛选交易所：</span>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700">
            {exchangeFilter}
          </span>
          <Link
            href="/accounts"
            className="text-xs text-default-500 hover:underline"
          >
            清除筛选 ×
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          加载账户失败：{error}
        </div>
      )}

      {filtered.length === 0 && !error && (
        <EmptyState
          title={exchangeFilter ? "未匹配任何账户" : "暂无账户"}
          description={
            exchangeFilter
              ? `没有 ${exchangeFilter} 的账户。清除筛选查看全部账户。`
              : "请先添加一个 Binance 只读密钥开始使用。"
          }
          action={
            <Link
              href="/accounts/new"
              className="px-3 py-2 rounded bg-primary text-white text-sm"
            >
              + 添加账户
            </Link>
          }
        />
      )}

      <div className="grid gap-3">
        {filtered.map((a) => (
          <Link
            key={a.id}
            href={`/accounts/${a.id}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.label}</div>
                <div className="text-xs text-default-500 mt-1 truncate">
                  {a.exchange} · {a.email}
                </div>
              </div>
              <div className="text-xs flex gap-2 shrink-0">
                {a.permissions.canTrade && (
                  <span className="px-2 py-1 rounded bg-success/20 text-success">
                    交易
                  </span>
                )}
                {a.permissions.canWithdraw && (
                  <span className="px-2 py-1 rounded bg-danger/20 text-danger">
                    提现
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
