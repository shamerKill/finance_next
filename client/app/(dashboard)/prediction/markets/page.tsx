import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { EmptyState } from "@/components/empty-state";
import { IngestButton } from "@/components/ingest-button";
import { PageHeader } from "@/components/page-header";
import { listPredictionMarkets } from "@/data/api-client";
import { TypePredictionMarket } from "@/data/type";

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
        action={<IngestButton path="v1/admin/ingest/prediction" />}
      />

      <div className="mb-4">
        <ApiErrorView error={error} />
      </div>

      {markets.length === 0 && !error && (
        <EmptyState
          title="尚未抓取任何市场"
          description="点击右上角“立即抓取数据”触发一次初始化。"
        />
      )}

      <div className="grid gap-2">
        {markets.map((m) => (
          <Link
            key={m.marketId}
            href={`/prediction/markets/${encodeURIComponent(m.marketId)}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="font-medium">{m.question}</div>
            <div className="text-xs text-default-500 mt-1 flex gap-2 flex-wrap">
              {m.category && <span>{m.category}</span>}
              {m.endDate && (
                <span>结束：{new Date(m.endDate).toLocaleDateString()}</span>
              )}
              {(m.tags ?? []).map((t) => (
                <span key={t} className="bg-default-100 px-2 rounded">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
