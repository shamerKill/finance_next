"use client";

// OhlcvChart now delegates the lightweight-charts lifecycle to the shared
// <ChartShell> primitive (Node 2.C.5.c). ChartShell owns dynamic import,
// resize observer, theme awareness, and timeframe tabs; this file only
// shapes the gateway bars into ChartBar shape.
//
// Timeframe is URL-driven via <MarketsControls>; we don't push it through
// ChartShell's `timeframes` here because that would create two parallel
// controls. The control bar above stays authoritative.

import { ChartShell, type ChartBar } from "@/components/chart-shell";
import type { TypeOhlcvBar } from "@/data/api-client";

type Props = {
  bars: TypeOhlcvBar[];
};

export function OhlcvChart({ bars }: Props) {
  const data: ChartBar[] = bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  return <ChartShell type="candle" data={data} />;
}
