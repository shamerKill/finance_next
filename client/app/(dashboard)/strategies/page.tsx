// Phase 4 strategies list. Uses the same underlying /option resource as
// the Phase 0 api-list page but adds a Live badge column. The list is
// rendered as an async server component (mirrors api-list/page.tsx) so
// the initial paint happens against the gateway with no client-side
// fetch.
//
// 2.C.5.b refactor — design system: PageHeader / StatusBadge /
// EmptyState / Callout + DataTable; mobile-safe card layout via
// DataTable's built-in card mode. Column `render` callbacks live in
// <StrategiesTable> (client) so functions don't cross the RSC → client
// boundary.

import Link from "next/link";
import { FC } from "react";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getStrategies } from "@/data/api-client";
import { TypeOption } from "@/data/type";

import StrategiesTable from "./strategies-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "策略" };

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
        !error && <StrategiesTable rows={strategies} />
      )}
    </div>
  );
};

export default PageStrategies;
