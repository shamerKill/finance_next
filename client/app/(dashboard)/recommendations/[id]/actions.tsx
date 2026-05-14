"use client";

// Approve / reject / "backtest this" buttons.
//
// 2.C.5.b refactor — destructive / state-changing actions go through
// <ConfirmDialog>; success/failure surfaces via the design-system toast
// API. The backtest action still navigates straight to /backtests/new
// with the proposed params pre-filled via URL query string — operators
// can dry-run the AI's suggestion before committing to it.

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import {
  approveRecommendation,
  rejectRecommendation,
} from "@/data/api-client";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

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

export default function RecommendationActions({
  id,
  strategyId,
  proposedParams,
  execSymbol,
  actionable,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const activity = useActivityCenter();
  const [error, setError] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const doApprove = async () => {
    setError(null);
    try {
      await withActivity(
        activity,
        {
          kind: "optimization",
          label: `批准推荐 #${id.slice(0, 8)}`,
          detail: strategyId.slice(0, 12),
        },
        () => approveRecommendation(id),
      );
      toast.success("已通过");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "批准失败";
      setError(msg);
      toast.error("批准失败", { description: msg });
      throw e;
    }
  };

  const doReject = async () => {
    setError(null);
    try {
      await withActivity(
        activity,
        {
          kind: "optimization",
          label: `拒绝推荐 #${id.slice(0, 8)}`,
          detail: strategyId.slice(0, 12),
        },
        () => rejectRecommendation(id),
      );
      toast.success("已拒绝");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "拒绝失败";
      setError(msg);
      toast.error("拒绝失败", { description: msg });
      throw e;
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {actionable && (
          <>
            <Button
              color="success"
              onPress={() => setApproveOpen(true)}
            >
              批准
            </Button>
            <Button
              variant="flat"
              onPress={() => setRejectOpen(true)}
            >
              拒绝
            </Button>
          </>
        )}
        <Button
          variant="bordered"
          color="primary"
          onPress={onBacktest}
        >
          回测此参数
        </Button>
      </div>
      {error && (
        <Callout variant="danger" title="操作失败">
          {error}
        </Callout>
      )}

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="批准此推荐？"
        message="策略参数将立即更新，currentVersion 自增 1；同策略其他 pending 推荐将被替代。"
        confirmLabel="批准"
        confirmColor="primary"
        onConfirm={doApprove}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="拒绝此推荐？"
        message="状态将变为已拒绝；策略保持不变。"
        confirmLabel="拒绝"
        confirmColor="danger"
        onConfirm={doReject}
      />
    </div>
  );
}
