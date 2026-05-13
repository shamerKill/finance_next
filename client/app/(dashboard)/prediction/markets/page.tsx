import { ApiErrorView } from "@/components/api-error";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listPredictionMarkets } from "@/data/api-client";
import { TypePredictionMarket } from "@/data/type";

import { IngestWithVerify } from "./ingest-with-verify";
import MarketsTable from "./markets-table";

// Node 2.C.5.e — DataTable + StatusBadge for tags; PageHeader stays.
// Column `render` callbacks live in <MarketsTable> (client) so the
// functions don't cross the RSC → client boundary.

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
        <MarketsTable rows={markets} />
      )}
    </div>
  );
}
