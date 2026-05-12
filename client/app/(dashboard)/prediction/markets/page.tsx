import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listPredictionMarkets } from "@/data/api-client";
import { TypePredictionMarket } from "@/data/type";

import { IngestWithVerify } from "./ingest-with-verify";

// Node 2.C.5.e — DataTable + StatusBadge for tags; PageHeader stays.

export const dynamic = "force-dynamic";

export const metadata = { title: "预测市场" };

export default async function PredictionMarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; active?: string }>;
}) {
  const sp = await searchParams;
  let markets: TypePredictionMarket[] = [];
  let error: unknown = null;
  try {
    markets = await listPredictionMarkets({
      category: sp.category,
      active: sp.active === "true",
      limit: 200,
    });
  } catch (e) {
    error = e;
  }

  return (
    <div>
      <PageHeader
        title="预测市场"
        subtitle="Polymarket 条件目录。点击市场查看订单簿和下单表单。"
        action={<IngestWithVerify />}
      />

      <div className="mb-4">
        <ApiErrorView error={error} />
      </div>

      {markets.length === 0 && !error ? (
        <EmptyState
          title="尚未抓取任何市场"
          description="点击右上角“立即抓取数据”触发一次初始化。"
        />
      ) : (
        <DataTable<TypePredictionMarket>
          ariaLabel="预测市场列表"
          mobileLayout="card"
          rows={markets}
          getRowKey={(m) => m.marketId}
          columns={[
            {
              key: "question",
              label: "市场",
              render: (m) => (
                <Link
                  href={`/prediction/markets/${encodeURIComponent(m.marketId)}`}
                  className="font-medium text-brand-primary hover:underline"
                >
                  {m.question}
                </Link>
              ),
            },
            {
              key: "category",
              label: "分类",
              render: (m) =>
                m.category ? (
                  <StatusBadge tone="default" variant="flat" size="sm">
                    {m.category}
                  </StatusBadge>
                ) : (
                  <span className="text-text-tertiary">—</span>
                ),
            },
            {
              key: "endDate",
              label: "结束时间",
              render: (m) =>
                m.endDate ? (
                  <span className="font-mono text-mono-sm tnum">
                    {new Date(m.endDate).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-text-tertiary">—</span>
                ),
            },
            {
              key: "tags",
              label: "标签",
              hideOnCard: true,
              render: (m) => (
                <div className="flex flex-wrap gap-1">
                  {(m.tags ?? []).map((t) => (
                    <StatusBadge
                      key={t}
                      tone="default"
                      variant="flat"
                      size="sm"
                    >
                      {t}
                    </StatusBadge>
                  ))}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
