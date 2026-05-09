"use client";

// Renders live backtest progress via the WS hub. Used inside the detail
// page when the run isn't terminal yet (state PENDING or RUNNING).

import { useBacktestStream } from "@/data/ws-client";

const stateLabel = (s: number | null) => {
  switch (s) {
    case 1:
      return "PENDING";
    case 2:
      return "RUNNING";
    case 3:
      return "COMPLETED";
    case 4:
      return "FAILED";
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
        <span className="font-medium">Live progress</span>
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
          Backtest finished. Refresh the page to see final metrics.
        </div>
      ) : null}
      {last && last.type === "backtest.upstream_closed" ? (
        <div className="mt-2 text-warning-700">
          Lost progress stream — gateway WS upstream closed. The job may still
          be running; refresh to check.
        </div>
      ) : null}
    </div>
  );
}
