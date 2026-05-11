import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listPredictionStrategies } from "@/data/api-client";
import { TypePredictionStrategy } from "@/data/type";

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
  return (
    <div>
      <PageHeader
        title="预测策略"
        action={
          <Link
            href="/prediction/strategies/new"
            className="px-3 py-2 rounded bg-primary text-white text-sm"
          >
            + 新建
          </Link>
        }
      />

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          {error}
        </div>
      )}
      {strategies.length === 0 && !error && (
        <EmptyState
          title="暂无策略"
          description="新建一个预测策略以开始监控 Polymarket 市场。"
          action={
            <Link
              href="/prediction/strategies/new"
              className="px-3 py-2 rounded bg-primary text-white text-sm"
            >
              + 新建
            </Link>
          }
        />
      )}

      <div className="grid gap-3">
        {strategies.map((s) => (
          <Link
            key={s.id}
            href={`/prediction/strategies/${s.id}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-default-500 mt-1">
                  市场：{s.marketId} · 结果：{s.outcome}
                </div>
              </div>
              {s.live.enabled && (
                <span className="px-2 py-1 rounded bg-success/20 text-success text-xs">
                  实盘 · {s.live.mode}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
