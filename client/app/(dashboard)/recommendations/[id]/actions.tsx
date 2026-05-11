"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  approveRecommendation,
  rejectRecommendation,
} from "@/data/api-client";

interface Props {
  id: string;
}

// Approve / reject buttons. Both call the gateway and refresh the page
// — the server component will re-render with the new status, hiding
// these buttons.
export default function RecommendationActions({ id }: Props) {
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
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
      </div>
      {error && (
        <div className="rounded-md bg-danger-50 p-2 text-xs text-danger-700">
          {error}
        </div>
      )}
    </div>
  );
}
