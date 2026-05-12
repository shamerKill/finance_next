// Phase 4 strategies list. Uses the same underlying /option resource as
// the Phase 0 api-list page but adds a Live badge column. The list is
// rendered as an async server component (mirrors api-list/page.tsx) so
// the initial paint happens against the gateway with no client-side
// fetch.
//
// 2.C.5.b refactor — design system: PageHeader / StatusBadge /
// EmptyState / Callout + DataTable; mobile-safe card layout via
// DataTable's built-in card mode.

import Link from "next/link";
import { FC } from "react";

import { Callout } from "@/components/callout";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getStrategies } from "@/data/api-client";
import { TypeOption } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "策略" };

// Live + mode rendered as a single badge — keeps the table cell narrow
// and reads at a glance.
function LiveBadge({ s }: { s: TypeOption }) {
  if (!s.live?.enabled) {
    return <StatusBadge tone="default">关闭</StatusBadge>;
  }
  if (s.live.mode === "mainnet") {
    return <StatusBadge tone="danger">主网</StatusBadge>;
  }
  return <StatusBadge tone="success">测试网</StatusBadge>;
}

function RiskCell({ s }: { s: TypeOption }) {
  if (!s.risk) {
    return (
      <span className="text-xs text-text-tertiary">—（订单将被拒绝）</span>
    );
  }
  return (
    <span className="font-mono tnum text-xs text-text-secondary">
      仓位 ${s.risk.maxPositionUsd} · 杠杆 {s.risk.maxLeverage}× · 日亏 $
      {s.risk.dailyLossCapUsd}
    </span>
  );
}

const PageStrategies: FC = async () => {
  let strategies: TypeOption[] = [];
  let error: string | null = null;
  try {
    strategies = await getStrategies();
  } catch (e: unknown) {
    error = (e as Error).message;
  }

  const newAction = (
    <Link
      href="/option"
      className="inline-flex items-center rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
    >
      新建策略
    </Link>
  );

  const columns: DataTableColumn<TypeOption>[] = [
    {
      key: "name",
      label: "名称",
      render: (s) =>
        s.id ? (
          <Link
            className="font-medium text-brand-primary hover:underline"
            href={`/strategies/${s.id}`}
          >
            {s.name}
          </Link>
        ) : (
          <span className="font-medium">{s.name}</span>
        ),
    },
    {
      key: "execSymbol",
      label: "交易对",
      render: (s) => (
        <span className="font-mono tnum text-sm">{s.execSymbol}</span>
      ),
    },
    {
      key: "live",
      label: "实盘",
      render: (s) => <LiveBadge s={s} />,
    },
    {
      key: "risk",
      label: "风控",
      render: (s) => <RiskCell s={s} />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="策略" action={newAction} />

      {error && (
        <Callout variant="danger" title="加载策略失败">
          {error}
        </Callout>
      )}

      {strategies.length === 0 && !error ? (
        <EmptyState
          title="暂无策略"
          description="点击右上角“新建策略”创建第一个策略配置。"
          action={newAction}
        />
      ) : (
        !error && (
          <DataTable
            ariaLabel="strategies"
            mobileLayout="card"
            columns={columns}
            rows={strategies}
            getRowKey={(s) => s.id ?? s.name}
          />
        )
      )}
    </div>
  );
};

export default PageStrategies;
