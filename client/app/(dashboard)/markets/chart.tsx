"use client";

// OhlcvChart wraps lightweight-charts in a React lifecycle. Client-only
// because the lib touches `window` on import. We re-create the chart on
// `bars` change rather than imperatively diffing — Phase 2 datasets are
// small (≤30 days × 24 hourly bars = 720 bars), so the cost is negligible.

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import type { TypeOhlcvBar } from "@/data/api-client";

type Props = {
  bars: TypeOhlcvBar[];
};

export function OhlcvChart({ bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    // Dynamic import keeps lightweight-charts out of the SSR bundle and
    // ensures we only ever evaluate it in the browser.
    import("lightweight-charts").then(({ createChart }) => {
      if (disposed) return;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: 480,
        layout: {
          background: { color: "transparent" },
          textColor: "#666",
        },
        grid: {
          vertLines: { color: "rgba(0,0,0,0.05)" },
          horzLines: { color: "rgba(0,0,0,0.05)" },
        },
        timeScale: { timeVisible: true },
      });

      const series = chart.addCandlestickSeries({
        upColor: "#16a34a",
        downColor: "#dc2626",
        borderVisible: false,
        wickUpColor: "#16a34a",
        wickDownColor: "#dc2626",
      });

      series.setData(
        bars.map((b) => ({
          // lightweight-charts wants seconds since epoch (UTCTimestamp).
          time: (Math.floor(new Date(b.time).getTime() / 1000) as unknown) as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );

      const onResize = () => {
        if (containerRef.current) {
          chart.resize(containerRef.current.clientWidth, 480);
        }
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        chart.remove();
      };
    });

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [bars]);

  return <div ref={containerRef} className="w-full" style={{ height: 480 }} />;
}
