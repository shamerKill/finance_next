import { ReactNode } from "react";

// Node 2.C.2 — RiskMeter.
//
// Horizontal three-band gauge used for portfolio limits, AI budget
// remaining, leverage usage, etc. Color thresholds match the trading-floor
// convention:
//   0–50%   green   (safe)
//   50–80%  yellow  (warning)
//   80%+    red     (danger)
//
// Pure / server-renderable. Accepts the raw value and the cap so the
// component can format both the bar and the trailing "x.xx / y.yy" label.

export interface RiskMeterProps {
  value: number;
  max: number;
  label?: ReactNode;
  /** Override the right-side numeric readout. Defaults to `<value> / <max>`. */
  readout?: ReactNode;
  /** Override the band thresholds (fraction 0..1). */
  thresholds?: { warning: number; danger: number };
  /** Show the percentage instead of value/max. */
  showPercent?: boolean;
  className?: string;
}

const DEFAULT_THRESHOLDS = { warning: 0.5, danger: 0.8 };

function bandColor(
  ratio: number,
  thresholds: { warning: number; danger: number },
): string {
  if (ratio >= thresholds.danger) return "bg-accent-down";
  if (ratio >= thresholds.warning) return "bg-accent-warning";
  return "bg-accent-up";
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function RiskMeter({
  value,
  max,
  label,
  readout,
  thresholds = DEFAULT_THRESHOLDS,
  showPercent = false,
  className,
}: RiskMeterProps) {
  // Clamp ratio to [0, 1] for the visual bar but report the raw value in
  // the readout so call sites can see e.g. 120% over-budget.
  const safeMax = max <= 0 ? 1 : max;
  const ratio = value / safeMax;
  const clamped = Math.max(0, Math.min(1, ratio));
  const widthPct = clamped * 100;
  const color = bandColor(ratio, thresholds);

  const readoutDefault = showPercent
    ? `${(ratio * 100).toFixed(1)}%`
    : `${formatNumber(value)} / ${formatNumber(max)}`;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      {(label || readout || readoutDefault) && (
        <div className="flex items-center justify-between text-xs">
          {label && <div className="text-text-secondary">{label}</div>}
          <div className="font-mono tnum text-text-primary">
            {readout ?? readoutDefault}
          </div>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 w-full rounded-full bg-bg-surface-2 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
