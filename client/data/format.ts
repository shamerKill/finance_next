// Number formatting helpers shared across the UI. Centralised so that the
// recommendations + dashboard + strategy detail pages display ΔSharpe /
// ΔReturn / raw param values with the same rules — no more
// "0.025637836675816615" leaking into the table.

import type { TypeRecommendationPeriod } from "./type";

// Legacy-fallback default period block. Matches the optimizer's
// historical configuration (90d lookback, 70/30 IS/OOS split, Sharpe
// annualized). Centralised here (not in type.d.ts, which is types-only)
// so list + detail pages stay in sync when a recommendation pre-dates
// the period field.
export const DEFAULT_RECOMMENDATION_PERIOD: TypeRecommendationPeriod = {
  lookbackDays: 90,
  inSampleDays: 63,
  oosDays: 27,
  sharpeAnnualized: true,
};

// fmtPct renders a fractional number as a signed percentage. `0.0352` →
// "+3.52%". Negative values keep their leading minus; non-finite numbers
// render as an em-dash placeholder so the table never breaks layout.
export function fmtPct(n: number | undefined | null, dp = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(dp)}%`;
}

// fmtSharpe is a signed 3-decimal renderer used for Sharpe / Δ Sharpe.
// Positive values get a leading "+" so direction is unambiguous at a
// glance. "—" for non-finite.
export function fmtSharpe(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
}

// fmtRawNum trims a numeric parameter value to `sig` significant figures
// without trailing exponent notation when the value is in a reasonable
// range. 0.025637836675816615 → "0.02564"; 5 → "5"; 1000 → "1000".
// Used for the proposed-params diff table where the underlying values
// are mixed scales (rates, prices, counts).
export function fmtRawNum(n: number | undefined | null, sig = 4): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  // Number(...toPrecision(sig)) collapses "0.025640000000000002"-style
  // trailing noise back to its shortest decimal form.
  return Number(n.toPrecision(sig)).toString();
}

// fmtUsd renders a signed dollar amount with 2 decimal places. The sign
// is split off the absolute value so we emit "-$12.40" rather than
// "$-12.40".
export function fmtUsd(n: number | undefined | null, dp = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(dp)}`;
}

// deltaToneClass picks a tailwind text-* color class for a signed delta.
// Positive → success, negative → danger, zero / non-finite → default
// (the table's normal foreground). Centralised so list + detail render
// the same color for the same value.
export function deltaToneClass(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n) || n === 0) {
    return "text-default-600";
  }
  return n > 0 ? "text-success-600" : "text-danger-600";
}
