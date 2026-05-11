"use client";

// Client wrapper for the recommendations list. The server component
// fetches + groups recommendations by studyId and hydrates strategy
// metadata; this component handles the interactive bits — expanding
// clusters of near-identical siblings and the "bulk reject similar"
// action. Server-only renderable pieces (badges, formatters) are still
// computed inline since they don't need state.

import { Tooltip } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { rejectRecommendation } from "@/data/api-client";
import {
  DEFAULT_RECOMMENDATION_PERIOD,
  deltaToneClass,
  fmtPct,
  fmtSharpe,
} from "@/data/format";
import type {
  TypeOption,
  TypeRecommendation,
  TypeRecommendationStatus,
} from "@/data/type";

// A cluster groups every recommendation belonging to the same study.
// The first entry (sorted ΔSharpe desc) is the "primary"; the rest are
// near-identical neighbors that get collapsed by default.
export type RecommendationCluster = {
  studyId: string;
  primary: TypeRecommendation;
  similar: TypeRecommendation[];
};

interface Props {
  clusters: RecommendationCluster[];
  status: TypeRecommendationStatus;
  // Strategy lookup keyed by strategyId. Missing entries mean the
  // strategy doc was deleted but the recommendation lingers — we render
  // a muted "已删除策略" placeholder.
  strategiesById: Record<string, TypeOption | undefined>;
}

const toneFor = (s: TypeRecommendationStatus) => {
  switch (s) {
    case "pending_review":
      return { tone: "warning" as const, label: "待审核" };
    case "approved":
      return { tone: "success" as const, label: "已批准" };
    case "rejected":
      return { tone: "default" as const, label: "已拒绝" };
    case "superseded":
      return { tone: "default" as const, label: "已替代" };
  }
};

function StrategyCell({ strategy }: { strategy: TypeOption | undefined }) {
  if (!strategy) {
    return <span className="text-default-400">已删除策略</span>;
  }
  return (
    <span>
      <span className="font-medium">{strategy.name}</span>{" "}
      <span className="ml-1 rounded bg-default-100 px-1.5 py-0.5 text-xs font-mono text-default-600">
        {strategy.execSymbol}
      </span>
    </span>
  );
}

function ClusterRows({
  cluster,
  strategiesById,
  emptyAfter,
}: {
  cluster: RecommendationCluster;
  strategiesById: Record<string, TypeOption | undefined>;
  emptyAfter: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBulkReject = async () => {
    if (
      !confirm(
        `确认批量拒绝该 study 下 ${cluster.similar.length} 个相似推荐？此操作不可撤销。`,
      )
    ) {
      return;
    }
    setRejecting(true);
    setError(null);
    try {
      // Fan-out to the gateway. We don't need fanin ordering — each
      // call independently flips status to rejected. router.refresh()
      // at the end repaints the server-rendered table.
      const results = await Promise.allSettled(
        cluster.similar.map((r) => rejectRecommendation(r.id)),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        setError(`${failed.length} / ${results.length} 个推荐拒绝失败`);
      } else {
        setExpanded(false);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量拒绝失败");
    } finally {
      setRejecting(false);
    }
  };

  const primary = cluster.primary;
  const strategy = strategiesById[primary.strategyId];
  const badge = toneFor(primary.status);

  const rows: React.ReactNode[] = [];

  rows.push(
    <tr
      key={primary.id}
      className="border-b border-default-100 hover:bg-default-50"
    >
      <td className="py-2 pr-4">
        <StrategyCell strategy={strategy} />
      </td>
      <td className="py-2 pr-4">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </td>
      <td
        className={`py-2 pr-4 tabular-nums ${deltaToneClass(primary.expectedDelta?.sharpe)}`}
      >
        {fmtSharpe(primary.expectedDelta?.sharpe)}
      </td>
      <td
        className={`py-2 pr-4 tabular-nums ${deltaToneClass(primary.expectedDelta?.return)}`}
      >
        {fmtPct(primary.expectedDelta?.return)}
      </td>
      <td className="py-2 pr-4 text-default-500">
        {new Date(primary.createdAt).toLocaleString()}
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-default-500">
        {primary.studyId.slice(0, 8)}…
      </td>
      <td className="py-2">
        {cluster.similar.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mr-3 text-xs text-default-600 hover:text-primary"
          >
            {expanded ? "▾" : "▸"} {cluster.similar.length} 个相似
          </button>
        )}
        <Link
          href={`/recommendations/${primary.id}`}
          className="text-primary hover:underline"
        >
          审核 →
        </Link>
      </td>
    </tr>,
  );

  if (expanded) {
    for (const sib of cluster.similar) {
      rows.push(
        <tr
          key={sib.id}
          className="border-b border-default-50 bg-default-50/30"
        >
          <td className="py-1.5 pr-4 pl-6 text-default-500">
            <span className="text-xs text-default-400">↳</span>{" "}
            <StrategyCell strategy={strategiesById[sib.strategyId]} />
          </td>
          <td className="py-1.5 pr-4">
            <StatusBadge tone={toneFor(sib.status).tone}>
              {toneFor(sib.status).label}
            </StatusBadge>
          </td>
          <td
            className={`py-1.5 pr-4 tabular-nums ${deltaToneClass(sib.expectedDelta?.sharpe)}`}
          >
            {fmtSharpe(sib.expectedDelta?.sharpe)}
          </td>
          <td
            className={`py-1.5 pr-4 tabular-nums ${deltaToneClass(sib.expectedDelta?.return)}`}
          >
            {fmtPct(sib.expectedDelta?.return)}
          </td>
          <td className="py-1.5 pr-4 text-xs text-default-500">
            {new Date(sib.createdAt).toLocaleString()}
          </td>
          <td className="py-1.5 pr-4 font-mono text-xs text-default-400">
            —
          </td>
          <td className="py-1.5">
            <Link
              href={`/recommendations/${sib.id}`}
              className="text-xs text-primary hover:underline"
            >
              审核 →
            </Link>
          </td>
        </tr>,
      );
    }
    rows.push(
      <tr key={`${cluster.studyId}-footer`} className="border-b border-default-100 bg-default-50/30">
        <td colSpan={7} className="py-2 pl-6 pr-4">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={onBulkReject}
              disabled={rejecting}
              className="rounded-md border border-danger-200 bg-danger-50 px-3 py-1 text-danger-700 hover:bg-danger-100 disabled:opacity-50"
            >
              {rejecting
                ? "拒绝中…"
                : `批量拒绝相似 (${cluster.similar.length})`}
            </button>
            {error && <span className="text-danger-600">{error}</span>}
            {!error && (
              <span className="text-default-500">
                批量拒绝会保留排名第一的推荐，仅拒绝相似的{" "}
                {cluster.similar.length} 个。
              </span>
            )}
          </div>
        </td>
      </tr>,
    );
  }

  // Visual separator after each cluster, except the last row in the table.
  if (!emptyAfter) {
    rows.push(
      <tr key={`${cluster.studyId}-gap`} aria-hidden>
        <td colSpan={7} className="h-1" />
      </tr>,
    );
  }

  return <>{rows}</>;
}

export function RecommendationsList({
  clusters,
  status,
  strategiesById,
}: Props) {
  if (clusters.length === 0) {
    return (
      <div className="rounded-md border border-default-200 py-10 text-center text-default-400">
        状态为 &quot;{toneFor(status).label}&quot; 的推荐为空。
      </div>
    );
  }

  // Pull OOS-days off the first cluster's primary for the column
  // header; recommendations within the same status set typically share
  // a search window. Falls back to the documented default for legacy
  // recommendations missing `period`.
  const headerPeriod =
    clusters[0]?.primary.period ?? DEFAULT_RECOMMENDATION_PERIOD;
  const headerOosLabel = `OOS ${headerPeriod.oosDays.toFixed(0)}天`;

  return (
    <>
      {/* Desktop: dense table. */}
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-default-200 text-left text-default-500">
          <tr>
            <th className="py-2 pr-4">策略</th>
            <th className="py-2 pr-4">状态</th>
            <th className="py-2 pr-4">
              <Tooltip content="OOS 段年化夏普比率">
                <span className="cursor-help underline decoration-dotted decoration-default-300 underline-offset-2">
                  Δ 夏普 (年化)
                </span>
              </Tooltip>
            </th>
            <th className="py-2 pr-4">Δ 收益 ({headerOosLabel})</th>
            <th className="py-2 pr-4">创建时间</th>
            <th className="py-2 pr-4">Study</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((c, i) => (
            <ClusterRows
              key={c.studyId}
              cluster={c}
              strategiesById={strategiesById}
              emptyAfter={i === clusters.length - 1}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile: card list. */}
      <div className="flex flex-col gap-3 md:hidden">
        {clusters.map((c) => {
          const strategy = strategiesById[c.primary.strategyId];
          const badge = toneFor(c.primary.status);
          return (
            <Link
              key={c.studyId}
              href={`/recommendations/${c.primary.id}`}
              className="block rounded-md border border-default-200 p-3 hover:bg-default-50"
            >
              <div className="flex items-start justify-between gap-2">
                <StrategyCell strategy={strategy} />
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span className={`tabular-nums ${deltaToneClass(c.primary.expectedDelta?.sharpe)}`}>
                  ΔSharpe {fmtSharpe(c.primary.expectedDelta?.sharpe)}
                </span>
                <span className={`tabular-nums ${deltaToneClass(c.primary.expectedDelta?.return)}`}>
                  ΔReturn {fmtPct(c.primary.expectedDelta?.return)}
                </span>
              </div>
              <div className="mt-2 text-xs text-default-500">
                {new Date(c.primary.createdAt).toLocaleString()} · Study{" "}
                <span className="font-mono">{c.studyId.slice(0, 8)}…</span>
                {c.similar.length > 0 && (
                  <span className="ml-2 text-default-600">
                    +{c.similar.length} 个相似
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
