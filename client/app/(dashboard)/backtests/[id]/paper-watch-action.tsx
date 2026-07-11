"use client";

import { useState } from "react";

import { updateAIGoalRunAction } from "@/data/api-client";
import { savedStrategyPaperWatchPatchFromBacktest } from "@/data/ai-goal-preset.mjs";
import type {
  TypeAIGoalRunActionPatch,
  TypeBacktest,
  TypeOption,
} from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

type SavedBacktestPaperWatchActionProps = {
  strategy: TypeOption;
  backtest: TypeBacktest;
  sourceAiRunId: string;
};

export function SavedBacktestPaperWatchAction({
  strategy,
  backtest,
  sourceAiRunId,
}: SavedBacktestPaperWatchActionProps) {
  const activity = useActivityCenter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildPatch = savedStrategyPaperWatchPatchFromBacktest as unknown as (
    strategy: TypeOption,
    backtest: TypeBacktest,
  ) => TypeAIGoalRunActionPatch | null;
  const patch = buildPatch(strategy, backtest);

  if (!patch || !sourceAiRunId) return null;

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await withActivity(
        activity,
        {
          kind: "other",
          label: `AI paper 观察 - ${strategy.name || backtest.strategyId}`,
          detail: backtest.runId,
        },
        () => updateAIGoalRunAction(sourceAiRunId, "paper_watch", patch),
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || done}
        className="rounded border border-border-default px-3 py-2 text-xs font-medium hover:bg-bg-surface-2 disabled:opacity-50"
      >
        {done ? "已写入 AI paper 观察" : busy ? "写入中..." : "采用 paper 观察"}
      </button>
      {error && <span className="basis-full text-xs text-danger-600">{error}</span>}
    </div>
  );
}
