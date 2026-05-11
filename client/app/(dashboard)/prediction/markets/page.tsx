import Link from "next/link";

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
  let error: string | null = null;
  try {
    markets = await listPredictionMarkets({
      category: sp.category,
      active: sp.active === "true",
      limit: 200,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">预测市场</h1>
      <div className="text-sm text-default-500 mb-4">
        Polymarket 条件目录。点击市场查看订单簿和下单表单。
      </div>

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          {error}
        </div>
      )}

      {markets.length === 0 && !error && (
        <p className="text-default-500 text-sm">
          尚未抓取任何市场。运行{" "}
          <code>POST /api/v1/admin/ingest/prediction</code> 进行初始化。
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
