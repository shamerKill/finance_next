import Link from "next/link";
import { listAccounts } from "@/data/api-client";
import { TypeAccount } from "@/data/type";

export const dynamic = "force-dynamic";

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">账户</h1>
        <Link
          href="/accounts/new"
          className="px-3 py-2 rounded bg-primary text-white text-sm"
        >
          + 添加账户
        </Link>
      </div>

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          加载账户失败：{error}
        </div>
      )}

      {accounts.length === 0 && !error && (
        <p className="text-default-500 text-sm">
          暂无账户。请先添加一个 Binance 只读密钥开始使用。
        </p>
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
