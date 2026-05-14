"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { startOptimization } from "@/data/api-client";
import { useActivityCenter } from "@/data/use-activity-center";
import { useOptimizationStream } from "@/data/ws-client";

interface Props {
  strategyId: string;
}

const stateLabel = (s: number | null): string => {
  switch (s) {
    case 1:
      return "等待中";
    case 2:
      return "运行中";
    case 3:
      return "已完成";
    case 4:
      return "已失败";
    case 5:
      return "预算超限";
    default:
      return "—";
  }
};

// Phase 6 "Tune now" button. Calls POST /api/v1/strategies/:id/optimize
// and subscribes to the optimization WS topic so the user sees live
// trial progress + cost. When the study terminates and produces a
// recommendation, we surface a link to the review page.
export default function TuneNowButton({ strategyId }: Props) {
  const [studyId, setStudyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activity = useActivityCenter();
  const activityIdRef = useRef<string | null>(null);

  const { progress, trialsCompleted, trialsTotal, costUsd, state, recommendationId } =
    useOptimizationStream(studyId);

  // Mirror optimization WS terminal states (3=completed, 4=failed,
  // 5=budget_exceeded) into the activity-center entry.
  useEffect(() => {
    if (activityIdRef.current == null) return;
    if (state == null) return;
    if (state >= 3) {
      const label =
        state === 3 ? "success" : state === 4 ? "failed" : "canceled";
      const detail =
        state === 3
          ? `${trialsCompleted}/${trialsTotal || "?"} 试验 · $${costUsd.toFixed(4)}`
          : state === 4
            ? "study failed"
            : "预算耗尽";
      activity.update(activityIdRef.current, {
        status: label as "success" | "failed" | "canceled",
        detail,
        href: recommendationId ? `/recommendations/${recommendationId}` : undefined,
      });
      activityIdRef.current = null;
    }
  }, [state, trialsCompleted, trialsTotal, costUsd, recommendationId, activity]);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const handle = await startOptimization(strategyId);
      setStudyId(handle.studyId);
      activityIdRef.current = activity.push({
        kind: "optimization",
        label: `AI 优化 · ${strategyId.slice(0, 8)}`,
        detail: `study ${handle.studyId.slice(0, 8)}…`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失败";
      setError(msg);
      activity.push({
        kind: "optimization",
        label: `AI 优化 · ${strategyId.slice(0, 8)}`,
        status: "failed",
        detail: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      <button
        onClick={onClick}
        disabled={busy || (studyId !== null && state !== null && state < 3)}
        className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1 font-medium text-primary-700 disabled:opacity-50"
      >
        {busy ? "启动中…" : studyId ? `Study ${studyId.slice(0, 8)}…` : "立即调优"}
      </button>
      {studyId && (
        <div className="flex items-center gap-3 text-default-500">
          <span>
            {trialsCompleted}/{trialsTotal || "?"} 试验
          </span>
          <span className="h-2 w-24 rounded-full bg-default-100">
            <span
              className="block h-full rounded-full bg-primary-500"
              style={{ width: `${Math.min(100, progress * 100).toFixed(0)}%` }}
            />
          </span>
          <span>${costUsd.toFixed(4)}</span>
          <span>{stateLabel(state)}</span>
          {recommendationId && (
            <Link
              href={`/recommendations/${recommendationId}`}
              className="font-medium text-primary hover:underline"
            >
              审核 →
            </Link>
          )}
        </div>
      )}
      {error && <span className="text-danger-700">{error}</span>}
    </div>
  );
}
