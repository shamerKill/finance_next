"use client";

// Live equity-curve renderer — a thin shim around lightweight-charts
// that accepts the {ts, equityUsd} shape returned by
// /api/v1/strategies/:id/performance. Mirrors the backtest's
// EquityChart almost verbatim (same area-series styling) — kept
// separate to avoid coupling the backtest's TypeEquityPoint shape to
// the live performance endpoint, which uses different field names.

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import type { TypeStrategyEquityPoint } from "@/data/type";

type Props = {
  points: TypeStrategyEquityPoint[];
};

export function LiveEquityChart({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    import("lightweight-charts").then(({ createChart }) => {
      if (disposed) return;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: 320,
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

      const series = chart.addAreaSeries({
        lineColor: "#2563eb",
        topColor: "rgba(37,99,235,0.4)",
        bottomColor: "rgba(37,99,235,0.05)",
        lineWidth: 2,
      });

      series.setData(
        points.map((p) => ({
          time: (Math.floor(new Date(p.ts).getTime() / 1000) as unknown) as UTCTimestamp,
          value: p.equityUsd,
        })),
      );

      const onResize = () => {
        if (containerRef.current) {
          chart.resize(containerRef.current.clientWidth, 320);
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
  }, [points]);

  return <div ref={containerRef} className="w-full" style={{ height: 320 }} />;
}
