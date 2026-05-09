"use client";

import Link from "next/link";
import { useState } from "react";

import { startOptimization } from "@/data/api-client";
import { useOptimizationStream } from "@/data/ws-client";

interface Props {
  strategyId: string;
}

const stateLabel = (s: number | null): string => {
  switch (s) {
    case 1:
      return "pending";
    case 2:
      return "running";
    case 3:
      return "completed";
    case 4:
      return "failed";
    case 5:
      return "budget exceeded";
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

  const { progress, trialsCompleted, trialsTotal, costUsd, state, recommendationId } =
    useOptimizationStream(studyId);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const handle = await startOptimization(strategyId);
      setStudyId(handle.studyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
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
        {busy ? "Starting…" : studyId ? `Study ${studyId.slice(0, 8)}…` : "Tune now"}
      </button>
      {studyId && (
        <div className="flex items-center gap-3 text-default-500">
          <span>
            {trialsCompleted}/{trialsTotal || "?"} trials
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
              Review →
            </Link>
          )}
        </div>
      )}
      {error && <span className="text-danger-700">{error}</span>}
    </div>
  );
}
