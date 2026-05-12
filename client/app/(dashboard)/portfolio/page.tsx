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
// unchanged.

import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { DataTable, DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { getPortfolioSummary } from "@/data/api-client";
import type { TypePortfolioSummary } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "投资组合" };

type ExchangeRow = TypePortfolioSummary["perExchange"][number];
type AssetRow = TypePortfolioSummary["perAsset"][number];

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

  const exchangeColumns: DataTableColumn<ExchangeRow>[] = [
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

  const assetColumns: DataTableColumn<AssetRow>[] = [
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
              <DataTable<ExchangeRow>
                ariaLabel="按交易所汇总"
                mobileLayout="card"
                columns={exchangeColumns}
                rows={summary.perExchange}
                getRowKey={(row) => row.exchange}
              />
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
              <DataTable<AssetRow>
                ariaLabel="资产明细"
                mobileLayout="card"
                columns={assetColumns}
                rows={summary.perAsset}
                getRowKey={(a) => a.asset}
              />
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
