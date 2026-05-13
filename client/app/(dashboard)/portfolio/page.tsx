// Phase 5: cross-exchange portfolio summary.
//
// Server component. Calls /api/v1/portfolio/summary at request time and
// renders three blocks: total / per-exchange / top-10 assets. The USD
// price provider on the gateway is best-effort (Timescale latest close
// of `<asset>USDT` on binance) — anything missing surfaces in `notes`.
//
// Node 2.C.5.a — moved per-exchange / per-asset tables to <DataTable>
// (auto card layout on mobile), promoted total to <Stat size="lg">,
// palette migrated to semantic tokens. Fetch / aggregation logic
// unchanged. Column `render` callbacks live in <portfolio-tables>
// (client) to avoid passing functions through the RSC → client boundary.

import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { getPortfolioSummary } from "@/data/api-client";
import type { TypePortfolioSummary } from "@/data/type";

import { AssetTable, ExchangeTable } from "./portfolio-tables";

export const dynamic = "force-dynamic";

export const metadata = { title: "投资组合" };

function formatUsd(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function PortfolioPage() {
  let summary: TypePortfolioSummary | null = null;
  let error: unknown = null;
  try {
    summary = await getPortfolioSummary();
  } catch (e) {
    error = e;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="投资组合"
        subtitle={
          <>
            跨交易所资产快照。USD 估值取自 Timescale 中{" "}
            <code className="font-mono tnum">&lt;asset&gt;USDT</code>{" "}
            的最新收盘价；缺失行情按 0 计入总值。
          </>
        }
      />

      {error != null && <ApiErrorView error={error} />}

      {summary && (
        <>
          <Stat
            label="总计"
            value={formatUsd(summary.totalUsd)}
            size="lg"
            hint={`生成时间 ${summary.generatedAt}`}
          />

          <section className="space-y-3">
            <h2 className="text-xl font-medium text-text-primary">按交易所</h2>
            {summary.perExchange.length === 0 ? (
              <EmptyState
                title="尚未配置任何账户"
                description="添加一个交易所账户后将出现在这里。"
                action={
                  <Link
                    href="/accounts/new"
                    className="px-3 py-2 rounded bg-brand-primary text-text-primary text-sm font-medium hover:opacity-90"
                  >
                    + 添加账户
                  </Link>
                }
              />
            ) : (
              <ExchangeTable rows={summary.perExchange} />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-medium text-text-primary">主要资产</h2>
            {summary.perAsset.length === 0 ? (
              <EmptyState
                title="暂无余额"
                description="账户已绑定，但所有资产为零。等待充值或下单后将出现明细。"
              />
            ) : (
              <AssetTable rows={summary.perAsset} />
            )}
          </section>

          {summary.notes && summary.notes.length > 0 && (
            <section className="text-xs text-text-tertiary">
              <h3 className="font-medium text-text-secondary mb-1">备注</h3>
              <ul className="list-disc ml-5 space-y-1">
                {summary.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
