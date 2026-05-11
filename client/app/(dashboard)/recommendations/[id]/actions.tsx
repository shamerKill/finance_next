"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  approveRecommendation,
  rejectRecommendation,
} from "@/data/api-client";

interface Props {
  id: string;
  strategyId: string;
  proposedParams: Record<string, unknown>;
  // Symbol comes from the parent strategy (recommendations don't store
  // symbol independently — they apply on top of the strategy's existing
  // execSymbol). Falling back to "" lets the /backtests/new form prompt
  // the user when the parent strategy was deleted.
  execSymbol?: string;
  // When false (rec already approved / rejected / superseded) we hide
  // approve + reject but still keep the "backtest this" path so the
  // operator can dry-run historical proposals.
  actionable: boolean;
}

// Approve / reject / "backtest this" buttons. The backtest action
// navigates to /backtests/new with the proposed params pre-filled via
// URL query string — operators can dry-run the AI's suggestion before
// committing to it.
export default function RecommendationActions({
  id,
  strategyId,
  proposedParams,
  execSymbol,
  actionable,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onApprove = async () => {
    if (!confirm("批准此推荐？策略参数将立即更新。")) {
      return;
    }
    setBusy("approve");
    setError(null);
    try {
      await approveRecommendation(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批准失败");
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    setBusy("reject");
    setError(null);
    try {
      await rejectRecommendation(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "拒绝失败");
    } finally {
      setBusy(null);
    }
  };

  const onBacktest = () => {
    const qs = new URLSearchParams({
      strategyId,
      symbol: execSymbol ?? "",
      // Proposed params are passed as JSON in a single query param —
      // /backtests/new parses them into the form's textarea so the
      // operator can run a dry-run before approving.
      proposed: JSON.stringify(proposedParams ?? {}),
      lookbackDays: "30",
    });
    router.push(`/backtests/new?${qs.toString()}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {actionable && (
          <>
            <button
              onClick={onApprove}
              disabled={busy !== null}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "approve" ? "批准中…" : "批准"}
            </button>
            <button
              onClick={onReject}
              disabled={busy !== null}
              className="rounded-md bg-default-200 px-4 py-2 text-sm font-medium text-default-700 disabled:opacity-50"
            >
              {busy === "reject" ? "拒绝中…" : "拒绝"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onBacktest}
          disabled={busy !== null}
          className="rounded-md border border-primary bg-white px-4 py-2 text-sm font-medium text-primary hover:bg-primary-50 disabled:opacity-50"
        >
          回测此参数
        </button>
      </div>
      {error && (
        <div className="rounded-md bg-danger-50 p-2 text-xs text-danger-700">
          {error}
        </div>
      )}
    </div>
  );
}
