"use client";

// Client wrapper for the recommendations list. The server component
// fetches + groups recommendations by studyId and hydrates strategy
// metadata; this component handles the interactive bits — expanding
// clusters of near-identical siblings and the "bulk reject similar"
// action. Server-only renderable pieces (badges, formatters) are still
// computed inline since they don't need state.
//
// 2.C.5.b refactor — ConfirmDialog replaces window.confirm; toast for
// completion; design-system StatusBadge + EmptyState + tokens. The
// custom table layout is preserved because rows are not uniform
// (primary row + collapsed children + footer span) — DataTable would
// flatten the relationship.

import { Tooltip } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { rejectRecommendation } from "@/data/api-client";
import { useActivityCenter } from "@/data/use-activity-center";
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
    return <span className="text-text-tertiary">已删除策略</span>;
  }
  return (
    <span>
      <span className="font-medium">{strategy.name}</span>{" "}
      <span className="ml-1 rounded bg-bg-surface-2 px-1.5 py-0.5 text-xs font-mono tnum text-text-secondary">
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
  const toast = useToast();
  const activity = useActivityCenter();
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBulkReject = async () => {
    setError(null);
    // Fan-out to the gateway. We don't need fanin ordering — each
    // call independently flips status to rejected. router.refresh()
    // at the end repaints the server-rendered table. We wrap the whole
    // fan-out in a single activity entry so the activity center shows
    // "批量拒绝 N 条" rather than N separate rows.
    const activityId = activity.push({
      kind: "optimization",
      label: `批量拒绝相似推荐 (${cluster.similar.length})`,
      detail: `study ${cluster.studyId.slice(0, 8)}…`,
    });
    const results = await Promise.allSettled(
      cluster.similar.map((r) => rejectRecommendation(r.id)),
    );
    const failedCount = results.filter((r) => r.status === "rejected").length;
    activity.update(activityId, {
      status: failedCount === 0 ? "success" : "failed",
      detail:
        failedCount === 0
          ? `${results.length} 条已拒绝`
          : `${failedCount}/${results.length} 失败`,
    });
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      const msg = `${failed.length} / ${results.length} 个推荐拒绝失败`;
      setError(msg);
      toast.error(msg);
      throw new Error(msg);
    } else {
      setExpanded(false);
      toast.success(`已拒绝 ${results.length} 个相似推荐`);
      router.refresh();
    }
  };

  const primary = cluster.primary;
  const strategy = strategiesById[primary.strategyId];
  const badge = toneFor(primary.status);

  const rows: React.ReactNode[] = [];

  rows.push(
    <tr
      key={primary.id}
      className="border-b border-border-default hover:bg-bg-surface-2"
    >
      <td className="py-2 pr-4">
        <StrategyCell strategy={strategy} />
      </td>
      <td className="py-2 pr-4">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </td>
      <td
        className={`py-2 pr-4 font-mono tnum ${deltaToneClass(primary.expectedDelta?.sharpe)}`}
      >
        {fmtSharpe(primary.expectedDelta?.sharpe)}
      </td>
      <td
        className={`py-2 pr-4 font-mono tnum ${deltaToneClass(primary.expectedDelta?.return)}`}
      >
        {fmtPct(primary.expectedDelta?.return)}
      </td>
      <td className="py-2 pr-4 text-text-secondary">
        {new Date(primary.createdAt).toLocaleString()}
      </td>
      <td className="py-2 pr-4 font-mono tnum text-xs text-text-tertiary">
        {primary.studyId.slice(0, 8)}…
      </td>
      <td className="py-2">
        {cluster.similar.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mr-3 text-xs text-text-secondary hover:text-brand-primary"
          >
            {expanded ? "▾" : "▸"} {cluster.similar.length} 个相似
          </button>
        )}
        <Link
          href={`/recommendations/${primary.id}`}
          className="text-brand-primary hover:underline"
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
          className="border-b border-border-default/60 bg-bg-surface-2/40"
        >
          <td className="py-1.5 pr-4 pl-6 text-text-secondary">
            <span className="text-xs text-text-tertiary">↳</span>{" "}
            <StrategyCell strategy={strategiesById[sib.strategyId]} />
          </td>
          <td className="py-1.5 pr-4">
            <StatusBadge tone={toneFor(sib.status).tone}>
              {toneFor(sib.status).label}
            </StatusBadge>
          </td>
          <td
            className={`py-1.5 pr-4 font-mono tnum ${deltaToneClass(sib.expectedDelta?.sharpe)}`}
          >
            {fmtSharpe(sib.expectedDelta?.sharpe)}
          </td>
          <td
            className={`py-1.5 pr-4 font-mono tnum ${deltaToneClass(sib.expectedDelta?.return)}`}
          >
            {fmtPct(sib.expectedDelta?.return)}
          </td>
          <td className="py-1.5 pr-4 text-xs text-text-tertiary">
            {new Date(sib.createdAt).toLocaleString()}
          </td>
          <td className="py-1.5 pr-4 font-mono text-xs text-text-tertiary">
            —
          </td>
          <td className="py-1.5">
            <Link
              href={`/recommendations/${sib.id}`}
              className="text-xs text-brand-primary hover:underline"
            >
              审核 →
            </Link>
          </td>
        </tr>,
      );
    }
    rows.push(
      <tr
        key={`${cluster.studyId}-footer`}
        className="border-b border-border-default bg-bg-surface-2/40"
      >
        <td colSpan={7} className="py-2 pl-6 pr-4">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-md border border-accent-down/40 bg-accent-down/10 px-3 py-1 text-accent-down hover:bg-accent-down/20"
            >
              批量拒绝相似 ({cluster.similar.length})
            </button>
            {error ? (
              <span className="text-accent-down">{error}</span>
            ) : (
              <span className="text-text-tertiary">
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

  return (
    <>
      {rows}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="批量拒绝相似推荐"
        message={
          <span>
            确认批量拒绝该 study 下 {cluster.similar.length}{" "}
            个相似推荐？此操作不可撤销。
          </span>
        }
        confirmLabel="确认拒绝"
        confirmColor="danger"
        onConfirm={onBulkReject}
      />
    </>
  );
}

export function RecommendationsList({
  clusters,
  status,
  strategiesById,
}: Props) {
  if (clusters.length === 0) {
    return (
      <EmptyState
        title="暂无推荐"
        description={`状态为 “${toneFor(status).label}” 的推荐为空。`}
      />
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
        <thead className="border-b border-border-default text-left text-text-tertiary">
          <tr>
            <th className="py-2 pr-4 font-medium">策略</th>
            <th className="py-2 pr-4 font-medium">状态</th>
            <th className="py-2 pr-4 font-medium">
              <Tooltip content="OOS 段年化夏普比率">
                <span className="cursor-help underline decoration-dotted decoration-border-default underline-offset-2">
                  Δ 夏普 (年化)
                </span>
              </Tooltip>
            </th>
            <th className="py-2 pr-4 font-medium">
              Δ 收益 ({headerOosLabel})
            </th>
            <th className="py-2 pr-4 font-medium">创建时间</th>
            <th className="py-2 pr-4 font-medium">Study</th>
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
              className="block rounded-md border border-border-default bg-bg-surface p-3 hover:bg-bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <StrategyCell strategy={strategy} />
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span
                  className={`font-mono tnum ${deltaToneClass(c.primary.expectedDelta?.sharpe)}`}
                >
                  ΔSharpe {fmtSharpe(c.primary.expectedDelta?.sharpe)}
                </span>
                <span
                  className={`font-mono tnum ${deltaToneClass(c.primary.expectedDelta?.return)}`}
                >
                  ΔReturn {fmtPct(c.primary.expectedDelta?.return)}
                </span>
              </div>
              <div className="mt-2 text-xs text-text-tertiary">
                {new Date(c.primary.createdAt).toLocaleString()} · Study{" "}
                <span className="font-mono tnum">
                  {c.studyId.slice(0, 8)}…
                </span>
                {c.similar.length > 0 && (
                  <span className="ml-2 text-text-secondary">
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
