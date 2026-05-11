"use client";

// Renders live backtest progress via the WS hub. Used inside the detail
// page when the run isn't terminal yet (state PENDING or RUNNING).

import { useBacktestStream } from "@/data/ws-client";

const stateLabel = (s: number | null) => {
  switch (s) {
    case 1:
      return "等待中";
    case 2:
      return "运行中";
    case 3:
      return "已完成";
    case 4:
      return "已失败";
    default:
      return "—";
  }
};

export function LiveProgress({ runId }: { runId: string }) {
  const { progress, state, completed, last } = useBacktestStream(runId);

  const pct = Math.round(progress * 100);
  return (
    <div className="rounded border border-default-200 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">实时进度</span>
        <span className="text-default-500">
          {stateLabel(state)} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded bg-default-100">
        <div
          className="h-2 rounded bg-primary transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      {completed ? (
        <div className="mt-2 text-success-700">
          回测已完成。刷新页面查看最终指标。
        </div>
      ) : null}
      {last && last.type === "backtest.upstream_closed" ? (
        <div className="mt-2 text-warning-700">
          进度流已断开——gateway WS 上游已关闭。任务可能仍在运行，请刷新查看。
        </div>
      ) : null}
    </div>
  );
}
