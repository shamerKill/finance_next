import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listAccounts } from "@/data/api-client";
import { TypeAccount } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "账户" };

// Accounts list page. Server component fetches from the gateway directly so
// the first paint is filled in.
export default async function AccountsPage() {
  let accounts: TypeAccount[] = [];
  let error: string | null = null;
  try {
    accounts = await listAccounts();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

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

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          加载账户失败：{error}
        </div>
      )}

      {accounts.length === 0 && !error && (
        <EmptyState
          title="暂无账户"
          description="请先添加一个 Binance 只读密钥开始使用。"
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
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/accounts/${a.id}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{a.label}</div>
                <div className="text-xs text-default-500 mt-1">
                  {a.exchange} · {a.email}
                </div>
              </div>
              <div className="text-xs flex gap-2">
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
