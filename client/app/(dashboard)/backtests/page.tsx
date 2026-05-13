// Backtests list (Phase 3). Server component fetching from the gateway.
//
// Node 2.C.5.c — adopts the design-system primitives: <PageHeader> for the
// title + action slot, <DataTable> with `mobileLayout="card"` for the
// row→card transform, <StatusBadge> for run state, <EmptyState> for the
// no-data case, and <Callout> for fetch errors. The row spec is the only
// place that knows about backtest fields; everything else is a primitive.
//
// We intentionally do not stuff the request snapshot or full trade list
// into the list view — the head doc on the gateway side includes both and
// they're heavy. The detail page reads them.
//
// Column `render` callbacks live in <BacktestsTable> (client) to avoid
// passing functions across the RSC → client boundary.

import Link from "next/link";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listBacktests } from "@/data/api-client";
import type { TypeBacktest } from "@/data/type";

import BacktestsTable from "./backtests-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "回测" };

function NewButton() {
  return (
    <Link
      href="/backtests/new"
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
    >
      新建回测
    </Link>
  );
}

export default async function BacktestsListPage() {
  let runs: TypeBacktest[] = [];
  let error: string | null = null;
  try {
    runs = await listBacktests();
  } catch (e) {
    error = e instanceof Error ? e.message : "失败";
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="回测"
        subtitle="向量化策略运行，持久化到 Mongo + TimescaleDB"
        action={<NewButton />}
      />

      {error ? (
        <Callout variant="warning" title="回测不可用">
          {error}
        </Callout>
      ) : null}

      {runs.length === 0 && !error ? (
        <EmptyState
          title="暂无回测"
          description="点击右上角“新建回测”运行第一次。"
          action={<NewButton />}
        />
      ) : null}

      {runs.length > 0 ? <BacktestsTable rows={runs} /> : null}
    </div>
  );
}
