import Link from "next/link";

import { Callout } from "@/components/callout";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listPredictionStrategies } from "@/data/api-client";
import { TypePredictionStrategy } from "@/data/type";

// Node 2.C.5.e — DataTable + StatusBadge.

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
        <DataTable<TypePredictionStrategy>
          ariaLabel="预测策略列表"
          mobileLayout="card"
          rows={strategies}
          getRowKey={(s) => s.id}
          columns={[
            {
              key: "name",
              label: "名称",
              render: (s) => (
                <Link
                  href={`/prediction/strategies/${s.id}`}
                  className="font-medium text-brand-primary hover:underline"
                >
                  {s.name}
                </Link>
              ),
            },
            {
              key: "marketId",
              label: "市场",
              render: (s) => (
                <span className="font-mono text-mono-sm break-all">
                  {s.marketId}
                </span>
              ),
            },
            {
              key: "outcome",
              label: "结果",
              render: (s) => (
                <StatusBadge
                  tone={s.outcome === "YES" ? "success" : "danger"}
                  variant="flat"
                  size="sm"
                >
                  {s.outcome}
                </StatusBadge>
              ),
            },
            {
              key: "version",
              label: "版本",
              align: "end",
              render: (s) => (
                <span className="font-mono tnum">v{s.currentVersion}</span>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (s) =>
                s.live.enabled ? (
                  <StatusBadge tone="success" variant="dot">
                    实盘 · {s.live.mode ?? "mainnet"}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="default" variant="dot">
                    未启用
                  </StatusBadge>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
