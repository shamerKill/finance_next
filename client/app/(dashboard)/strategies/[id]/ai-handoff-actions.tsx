"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBacktest, updateAIGoalRunAction } from "@/data/api-client";
import { savedStrategyBacktestRequestFromOption } from "@/data/ai-goal-preset.mjs";
import type { TypeCreateBacktest, TypeOption } from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

type SavedStrategyBacktestActionProps = {
  strategy: TypeOption;
  sourceAiRunId?: string;
  fallbackHref: string;
  label?: string;
};

export function SavedStrategyBacktestAction({
  strategy,
  sourceAiRunId,
  fallbackHref,
  label = "先运行回测",
}: SavedStrategyBacktestActionProps) {
  const router = useRouter();
  const activity = useActivityCenter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildRequest = savedStrategyBacktestRequestFromOption as unknown as (
    strategy: TypeOption,
  ) => TypeCreateBacktest | null;
  const request = buildRequest(strategy);

  if (!request) {
    return (
      <Link
        href={fallbackHref}
        className="shrink-0 rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {label}
      </Link>
    );
  }

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const handle = await withActivity(
        activity,
        {
          kind: "backtest",
          label: `AI 回测 - ${strategy.name || request.strategyId}`,
          detail: `${request.symbol} · 90d · ${request.timeframe}`,
        },
        () => createBacktest(request),
      );
      const href = `/backtests/${encodeURIComponent(handle.runId)}`;
      if (sourceAiRunId) {
        await updateAIGoalRunAction(sourceAiRunId, "backtest", {
          status: "done",
          relatedId: handle.runId,
          href,
          note: "已从保存的 AI 策略发起回测，等待结果后再进入 paper 观察。",
        });
      }
      router.push(href);
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
        disabled={busy}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "发起中..." : label}
      </button>
      <Link
        href={fallbackHref}
        className="rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
      >
        打开表单
      </Link>
      {error && <span className="basis-full text-xs text-danger-600">{error}</span>}
    </div>
  );
}
