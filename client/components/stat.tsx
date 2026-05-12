import { ReactNode } from "react";

// Node 2.C.2 — KPI 卡 (Stat).
//
// Trading-platform style "metric" card: small grey label on top, large
// mono number, optional delta-with-arrow on the right, optional sparkline
// underneath. Server-renderable; if you need an animated sparkline pass
// in a client component as the `sparkline` slot.
//
// Color rules per spec §G1 — up = green (#0ECB81), down = red (#F6465D),
// neutral = secondary text. Numbers use `tnum` for tabular alignment.

export type StatDirection = "up" | "down" | "flat";

interface StatDelta {
  value: ReactNode;
  direction?: StatDirection;
}

export function Stat({
  label,
  value,
  delta,
  sparkline,
  hint,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: StatDelta;
  sparkline?: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  const valueClass =
    size === "lg"
      ? "font-mono text-mono-xl tnum text-text-primary"
      : "font-mono text-mono-lg tnum text-text-primary";

  return (
    <div
      className={`rounded-lg border border-border-default bg-bg-surface p-4 flex flex-col gap-2 ${className ?? ""}`}
    >
      <div className="text-xs text-text-secondary uppercase tracking-wide">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className={valueClass}>{value}</div>
        {delta && <StatDeltaChip {...delta} />}
      </div>
      {sparkline && <div className="mt-1 -mx-1">{sparkline}</div>}
      {hint && <div className="text-xs text-text-tertiary">{hint}</div>}
    </div>
  );
}

function StatDeltaChip({ value, direction = "flat" }: StatDelta) {
  const color =
    direction === "up"
      ? "text-accent-up"
      : direction === "down"
        ? "text-accent-down"
        : "text-text-secondary";
  const arrow =
    direction === "up" ? "▲" : direction === "down" ? "▼" : "·";
  return (
    <div className={`text-sm font-mono tnum flex items-center gap-1 ${color}`}>
      <span aria-hidden>{arrow}</span>
      <span>{value}</span>
    </div>
  );
}
