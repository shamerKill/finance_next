import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
import { listPredictionMarkets } from "@/data/api-client";
import { TypePredictionMarket } from "@/data/type";

export const dynamic = "force-dynamic";

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
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">预测市场</h1>
          <div className="text-sm text-default-500">
            Polymarket 条件目录。点击市场查看订单簿和下单表单。
          </div>
        </div>
        <IngestButton path="v1/admin/ingest/prediction" />
      </div>

      <div className="mb-4">
        <ApiErrorView error={error} />
      </div>

      {markets.length === 0 && !error && (
        <p className="text-default-500 text-sm">
          尚未抓取任何市场。点击右上角“立即抓取数据”触发一次初始化。
        </p>
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
