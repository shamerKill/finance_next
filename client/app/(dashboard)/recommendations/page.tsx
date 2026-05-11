// Recommendations list (Phase 6 → Phase D polish).
//
// Server component:
//   1. Fetches recommendations filtered by status (default pending_review).
//   2. Batch-hydrates the parent `strategyId` → strategy doc so the UI
//      shows "name (symbol)" instead of an opaque 24-char ObjectId.
//   3. Groups by `studyId` — optimizer runs spawn 5–8 near-identical
//      recommendations and the cluster collapse keeps the table from
//      looking like noise.
// The interactive table lives in the `RecommendationsList` client
// component (expand / bulk-reject).

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { getStrategy, listRecommendations } from "@/data/api-client";
import type {
  TypeOption,
  TypeRecommendation,
  TypeRecommendationStatus,
} from "@/data/type";

import { RecommendationsList, RecommendationCluster } from "./recommendations-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI 推荐" };

const FILTER_LABELS: Record<TypeRecommendationStatus, string> = {
  pending_review: "待审核",
  approved: "已批准",
  rejected: "已拒绝",
  superseded: "已替代",
};

interface PageProps {
  searchParams: Promise<{ status?: TypeRecommendationStatus }>;
}

// groupByStudy collapses a flat recommendation list into per-study
// clusters. Within a cluster the highest-ΔSharpe rec is the "primary";
// everything else is collapsed behind an expander. Studies are sorted
// by primary createdAt desc so the freshest study floats to the top.
function groupByStudy(recs: TypeRecommendation[]): RecommendationCluster[] {
  const byStudy = new Map<string, TypeRecommendation[]>();
  for (const r of recs) {
    const key = r.studyId || r.id; // fallback: legacy recs without studyId render as singleton clusters
    const arr = byStudy.get(key);
    if (arr) arr.push(r);
    else byStudy.set(key, [r]);
  }
  const clusters: RecommendationCluster[] = [];
  for (const [studyId, group] of byStudy) {
    const sorted = [...group].sort(
      (a, b) =>
        (b.expectedDelta?.sharpe ?? -Infinity) -
        (a.expectedDelta?.sharpe ?? -Infinity),
    );
    clusters.push({
      studyId,
      primary: sorted[0],
      similar: sorted.slice(1),
    });
  }
  clusters.sort(
    (a, b) =>
      new Date(b.primary.createdAt).getTime() -
      new Date(a.primary.createdAt).getTime(),
  );
  return clusters;
}

export default async function RecommendationsListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status: TypeRecommendationStatus = params?.status ?? "pending_review";
  let recs: TypeRecommendation[] = [];
  let error: string | null = null;
  try {
    recs = await listRecommendations(status);
  } catch (e) {
    error = e instanceof Error ? e.message : "失败";
  }

  // Batch-hydrate strategy names. `Promise.allSettled` so a single
  // deleted strategy doesn't 5xx the whole page; the entry stays
  // undefined and the row renders "已删除策略".
  const uniqueStrategyIds = [...new Set(recs.map((r) => r.strategyId))];
  const strategiesById: Record<string, TypeOption | undefined> = {};
  if (uniqueStrategyIds.length) {
    const settled = await Promise.allSettled(
      uniqueStrategyIds.map((id) => getStrategy(id)),
    );
    settled.forEach((res, i) => {
      const id = uniqueStrategyIds[i];
      if (res.status === "fulfilled") {
        strategiesById[id] = res.value;
      } else {
        strategiesById[id] = undefined;
      }
    });
  }

  const clusters = groupByStudy(recs);

  const filters: TypeRecommendationStatus[] = [
    "pending_review",
    "approved",
    "rejected",
    "superseded",
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI 推荐"
        subtitle="AI 生成的策略参数推荐。所有变更均需人工显式批准——不存在自动应用。"
      />

      <nav className="flex gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f}
            href={`/recommendations?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              status === f
                ? "border-primary text-primary"
                : "border-default-200 text-default-600"
            }`}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </nav>

      {error && (
        <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
          加载推荐失败：{error}
        </div>
      )}

      {!error && (
        <RecommendationsList
          clusters={clusters}
          status={status}
          strategiesById={strategiesById}
        />
      )}
    </div>
  );
}
