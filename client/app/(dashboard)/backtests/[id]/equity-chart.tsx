"use client";

// Renders an equity curve via lightweight-charts area series. Mirrors the
// pattern used by the markets page's OhlcvChart — the lib touches `window`
// on import so we keep it strictly client-side and dynamic-import.

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import type { TypeEquityPoint } from "@/data/type";

type Props = {
  points: TypeEquityPoint[];
};

export function EquityChart({ points }: Props) {
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
        height: 360,
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
          time: (Math.floor(new Date(p.time).getTime() / 1000) as unknown) as UTCTimestamp,
          value: p.equity,
        })),
      );

      const onResize = () => {
        if (containerRef.current) {
          chart.resize(containerRef.current.clientWidth, 360);
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

  if (points.length === 0) {
    return (
      <div className="text-sm text-default-500">
        暂无资金曲线数据——回测仍在运行或所选区间无 K 线数据。
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" style={{ height: 360 }} />;
}
