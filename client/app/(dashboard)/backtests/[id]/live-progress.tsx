"use client";

// Renders live backtest progress via the WS hub. Used inside the detail
// page when the run isn't terminal yet (state PENDING or RUNNING).
//
// Node 2.C.5.c — wraps the body in <Section> and switches the bespoke
// 2px progress bar for HeroUI's <Progress>. WS subscription logic is
// untouched.

import { Progress } from "@heroui/react";

import { Callout } from "@/components/callout";
import { Section } from "@/components/section";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { useBacktestStream } from "@/data/ws-client";

const stateInfo = (s: number | null): { label: string; tone: StatusTone } => {
  switch (s) {
    case 1:
      return { label: "等待中", tone: "default" };
    case 2:
      return { label: "运行中", tone: "warning" };
    case 3:
      return { label: "已完成", tone: "success" };
    case 4:
      return { label: "已失败", tone: "danger" };
    default:
      return { label: "—", tone: "default" };
  }
};

export function LiveProgress({ runId }: { runId: string }) {
  const { progress, state, completed, last } = useBacktestStream(runId);

  const pct = Math.round(progress * 100);
  const s = stateInfo(state);

  return (
    <Section
      title="实时进度"
      action={
        <span className="flex items-center gap-2 text-sm text-default-500">
          <StatusBadge tone={s.tone} size="sm">
            {s.label}
          </StatusBadge>
          <span className="font-mono tnum">{pct}%</span>
        </span>
      }
    >
      <Progress
        aria-label="backtest progress"
        value={pct}
        size="md"
        color={s.tone === "danger" ? "danger" : "primary"}
      />
      {completed ? (
        <div className="mt-3">
          <Callout variant="info">回测已完成。刷新页面查看最终指标。</Callout>
        </div>
      ) : null}
      {last && last.type === "backtest.upstream_closed" ? (
        <div className="mt-3">
          <Callout variant="warning">
            进度流已断开——gateway WS 上游已关闭。任务可能仍在运行，请刷新查看。
          </Callout>
        </div>
      ) : null}
    </Section>
  );
}
