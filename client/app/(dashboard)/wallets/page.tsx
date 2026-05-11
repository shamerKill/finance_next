import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listWallets } from "@/data/api-client";
import { TypeWallet } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "Polygon 钱包" };

export default async function WalletsPage() {
  let wallets: TypeWallet[] = [];
  let error: string | null = null;
  try {
    wallets = await listWallets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader
        title="Polygon 钱包"
        action={
          <Link
            href="/wallets/new"
            className="px-3 py-2 rounded bg-primary text-white text-sm"
          >
            + 添加钱包
          </Link>
        }
      />

      <div className="mb-4">
        <Callout variant="warning" title="Polymarket 安全模型">
          Polygon 钱包私钥使用与交易所 API 密钥相同的信封加密方案加密存储。
          私钥永远不会出现在 API 响应中，并会从审计日志中清除。USDC 授权额度
          为<em>有限额度</em> — 上限由{" "}
          <code>portfolio_limits.maxOpenNotionalUsd</code> 限定；无限额度授权
          在设计上已禁用。Polymarket 没有测试网 — 任何订单都需要通过三道闸验证。
        </Callout>
      </div>

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          加载钱包失败：{error}
        </div>
      )}

      {wallets.length === 0 && !error && (
        <EmptyState
          title="暂无钱包"
          description="添加一个 Polygon 钱包（私钥）以开始 Polymarket 交易。"
          action={
            <Link
              href="/wallets/new"
              className="px-3 py-2 rounded bg-primary text-white text-sm"
            >
              + 添加钱包
            </Link>
          }
        />
      )}

      <div className="grid gap-3">
        {wallets.map((w) => (
          <Link
            key={w.id}
            href={`/wallets/${w.id}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="font-medium">{w.label}</div>
            <div className="text-xs text-default-500 mt-1 font-mono">
              {w.address}
            </div>
            {w.usdcBalanceCached != null && (
              <div className="text-xs text-default-500 mt-1">
                USDC 缓存余额：{w.usdcBalanceCached.toFixed(2)} · 授权额度：{" "}
                {(w.usdcAllowanceCached ?? 0).toFixed(2)}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
