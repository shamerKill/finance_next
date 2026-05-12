"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "@/data/use-theme";
import { useIsDesktop } from "@/data/use-media-query";
import { Tabs } from "@/components/tabs";

// Node 2.C.2 — ChartShell.
//
// lightweight-charts container with our design-system chrome:
//   - top segmented control for timeframes
//   - auto theme (reads useTheme + matchMedia for "system")
//   - responsive height: 400px ≥ md, 280px on mobile
//   - crosshair tooltip overlay (OHLC) for candle/area; line shows last price
//
// Crosshair / pan / pinch-zoom are all built-in to lightweight-charts;
// we don't try to override them. Mobile cursor tooltip placement
// (top-fixed vs follow-cursor) is left to a follow-up Node (2.C.5.c chart
// migration); for now we use the default which is the same as `/markets`.

export type ChartBar = {
  time: number | string; // unix-seconds, ms, or ISO string
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number; // for line / area
};

export type ChartType = "line" | "candle" | "area";

export interface ChartShellProps {
  data: ChartBar[];
  type: ChartType;
  timeframes?: string[];
  selectedTimeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  height?: number;
  /** Override mobile height. Defaults to 280. */
  mobileHeight?: number;
}

// Normalize a chart bar's time to lightweight-charts' UTCTimestamp
// (seconds since epoch). Accepts ISO strings or millisecond/second
// numbers.
function toUTCTimestamp(t: number | string): UTCTimestamp {
  if (typeof t === "string") {
    return Math.floor(new Date(t).getTime() / 1000) as UTCTimestamp;
  }
  // Heuristic: > 10^12 means ms, otherwise seconds.
  const v = t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
  return v as UTCTimestamp;
}

function isDarkActive(theme: "light" | "dark" | "system"): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ChartShell({
  data,
  type,
  timeframes,
  selectedTimeframe,
  onTimeframeChange,
  height,
  mobileHeight = 280,
}: ChartShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const isDesktop = useIsDesktop();
  const { theme } = useTheme();
  // Track dark-mode at the *resolved* level. When `theme` is "system" we
  // also need to react to OS-level changes. The state below is mirrored
  // in the chart layout options on every theme transition.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    // Hydrating React state from a non-React source (matchMedia +
    // current theme) is the legitimate use of synchronous setState in
    // an effect. Same pattern as `use-theme.ts`; switching to
    // useSyncExternalStore would buy us nothing and require duplicating
    // the subscription logic below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(isDarkActive(theme));
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setIsDark(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const effectiveHeight = height ?? (isDesktop ? 400 : mobileHeight);

  const tabItems = useMemo(
    () =>
      (timeframes ?? []).map((tf) => ({
        key: tf,
        label: tf,
      })),
    [timeframes],
  );

  // Init / teardown — we recreate the chart on `type` change (the lib's
  // series API differs per type) but reuse it for data and theme tweaks.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    import("lightweight-charts").then(({ createChart }) => {
      if (disposed) return;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: effectiveHeight,
        layout: {
          background: { color: "transparent" },
          textColor: isDark ? "#848E9C" : "#5E6673",
        },
        grid: {
          vertLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
          horzLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
        },
        timeScale: { timeVisible: true, secondsVisible: false },
        crosshair: { mode: 1 }, // Normal — follows cursor on desktop, touch on mobile
      });
      chartRef.current = chart;

      let series: ISeriesApi<SeriesType>;
      if (type === "candle") {
        series = chart.addCandlestickSeries({
          upColor: "#0ECB81",
          downColor: "#F6465D",
          borderVisible: false,
          wickUpColor: "#0ECB81",
          wickDownColor: "#F6465D",
        });
      } else if (type === "area") {
        series = chart.addAreaSeries({
          lineColor: "#1FC7D4",
          topColor: "rgba(31, 199, 212, 0.4)",
          bottomColor: "rgba(31, 199, 212, 0)",
        });
      } else {
        series = chart.addLineSeries({
          color: "#1FC7D4",
          lineWidth: 2,
        });
      }
      seriesRef.current = series;

      const onResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.resize(containerRef.current.clientWidth, effectiveHeight);
        }
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
    // Recreate when type / theme / height change. Data is handled below.
  }, [type, isDark, effectiveHeight]);

  // Push data on data change without recreating the chart.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (type === "candle") {
      const candleData = data
        .filter(
          (b) =>
            b.open !== undefined &&
            b.high !== undefined &&
            b.low !== undefined &&
            b.close !== undefined,
        )
        .map((b) => ({
          time: toUTCTimestamp(b.time),
          open: b.open!,
          high: b.high!,
          low: b.low!,
          close: b.close!,
        }));
      (series as ISeriesApi<"Candlestick">).setData(candleData);
    } else {
      const lineData = data.map((b) => ({
        time: toUTCTimestamp(b.time),
        value: b.value ?? b.close ?? 0,
      }));
      (series as ISeriesApi<"Line" | "Area">).setData(lineData);
    }
    chartRef.current?.timeScale().fitContent();
  }, [data, type]);

  return (
    <div className="w-full flex flex-col gap-2">
      {tabItems.length > 0 && (
        <div className="flex justify-end">
          <Tabs
            ariaLabel="timeframe"
            items={tabItems}
            size="sm"
            selectedKey={selectedTimeframe}
            onSelectionChange={(k) => onTimeframeChange?.(k)}
          />
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full rounded border border-border-default bg-bg-surface"
        style={{ height: effectiveHeight }}
      />
    </div>
  );
}
