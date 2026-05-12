import Link from "next/link";

import { Callout } from "@/components/callout";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listWallets } from "@/data/api-client";
import { TypeWallet } from "@/data/type";

// Node 2.C.5.e — adopt design system primitives (DataTable + StatusBadge +
// PageHeader). The danger banner from §G5 stays — private-key safety
// model is a security contract surface we always reiterate to the user.

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

  const action = (
    <Link
      href="/wallets/new"
      className="inline-flex items-center rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
    >
      + 添加钱包
    </Link>
  );

  return (
    <div>
      <PageHeader title="Polygon 钱包" action={action} />

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
        <div className="mb-4">
          <Callout variant="danger" title="加载钱包失败">
            {error}
          </Callout>
        </div>
      )}

      {wallets.length === 0 && !error ? (
        <EmptyState
          title="暂无钱包"
          description="添加一个 Polygon 钱包（私钥）以开始 Polymarket 交易。"
          action={action}
        />
      ) : (
        <DataTable<TypeWallet>
          ariaLabel="Polygon 钱包列表"
          rows={wallets}
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
      )}
    </div>
  );
}
