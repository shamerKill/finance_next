import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listPredictionStrategies } from "@/data/api-client";
import { TypePredictionStrategy } from "@/data/type";

import StrategiesTable from "./strategies-table";

// Node 2.C.5.e — DataTable + StatusBadge. Column `render` callbacks
// live in <StrategiesTable> (client) so functions don't cross the RSC
// → client boundary.

export const dynamic = "force-dynamic";

export const metadata = { title: "预测策略" };

export default async function PredictionStrategiesPage() {
  let strategies: TypePredictionStrategy[] = [];
  let error: string | null = null;
  try {
    strategies = await listPredictionStrategies();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const action = (
    <Link
      href="/prediction/strategies/new"
      className="inline-flex items-center rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
    >
      + 新建
    </Link>
  );

  return (
    <div>
      <PageHeader title="预测策略" action={action} />

      {error && (
        <div className="mb-4">
          <Callout variant="danger" title="加载失败">
            {error}
          </Callout>
        </div>
      )}

      {strategies.length === 0 && !error ? (
        <EmptyState
          title="暂无策略"
          description="新建一个预测策略以开始监控 Polymarket 市场。"
          action={action}
        />
      ) : (
        <StrategiesTable rows={strategies} />
      )}
    </div>
  );
}
