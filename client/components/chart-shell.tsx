"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import { Select, SelectItem } from "@heroui/react";

import { useTheme } from "@/data/use-theme";
import { useIsDesktop } from "@/data/use-media-query";
import { Tabs } from "@/components/tabs";

// Node 2.C.2 — ChartShell.
// Node 5.D.2 — mobile gestures: dropdown timeframe selector, fixed
// crosshair tooltip at the top of the chart (so it isn't covered by
// fingers), shorter container height, and an aspect-ratio hint for
// responsive layout. See spec §G5 line 399-405.
//
// lightweight-charts container with our design-system chrome:
//   - top segmented control (desktop) or dropdown (mobile) for timeframes
//   - auto theme (reads useTheme + matchMedia for "system")
//   - responsive height: 400px ≥ md, 280px on mobile
//   - crosshair tooltip overlay (OHLC) for candle/area; line shows last price
//
// Crosshair / pan / pinch-zoom are all built-in to lightweight-charts;
// we don't try to override them.
//
// TODO(5.D.2): long-press (~300ms) before crosshair activates on
// mobile. lightweight-charts currently activates the crosshair on
// any touch tap, which competes with vertical scroll. The plumbing
// for this is intrusive (we'd need to disable handleScroll/handleScale
// for the first 300ms of a touch and re-enable on long-press). Left
// as a follow-up — the fixed-position OHLC overlay implemented here
// already addresses the bigger UX problem (finger-occluded tooltip).

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

// Snapshot rendered into the fixed-position top overlay on mobile.
// Kept minimal so the overlay never wraps to two lines on tiny phones.
type CrosshairSnapshot =
  | { kind: "ohlc"; time: number; o: number; h: number; l: number; c: number }
  | { kind: "value"; time: number; v: number }
  | null;

function formatTime(ts: number): string {
  // ts is seconds since epoch (UTCTimestamp).
  const d = new Date(ts * 1000);
  // Locale-free, compact, includes minutes — readable on a phone strip.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
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
  const isMobile = !isDesktop;
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

  // Mobile crosshair overlay state — only populated on mobile to avoid
  // doing extra work on desktop where the built-in tooltip is fine.
  const [crosshair, setCrosshair] = useState<CrosshairSnapshot>(null);

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
  // We also recreate when switching mobile<->desktop because the
  // crosshair subscription wiring differs.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    import("lightweight-charts").then(({ createChart }) => {
      if (disposed) return;
      // On mobile the container's height is aspect-ratio driven, so we
      // read clientHeight (already laid out by the time this resolves)
      // rather than the prop. Falls back to `effectiveHeight` on the
      // first frame if layout hasn't settled.
      const initialHeight = container.clientHeight || effectiveHeight;
      const chart = createChart(container, {
        width: container.clientWidth,
        height: initialHeight,
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

      // Mobile-only: subscribe to crosshair moves and surface the snapshot
      // through React state, which renders into a fixed div at the top of
      // the chart container. We don't run this on desktop because the
      // built-in tooltip placement is fine when the pointer doesn't block
      // the data.
      let crosshairHandler: ((p: MouseEventParams) => void) | null = null;
      if (isMobile) {
        crosshairHandler = (param: MouseEventParams) => {
          if (!param.time || !param.point) {
            setCrosshair(null);
            return;
          }
          const dataPoint = param.seriesData.get(series);
          if (!dataPoint) {
            setCrosshair(null);
            return;
          }
          // `param.time` is the lightweight-charts `Time` union
          // (number | BusinessDay | string). We always feed UTCTimestamp
          // (seconds) via toUTCTimestamp() above, so a number is what
          // we get back here.
          const ts =
            typeof param.time === "number" ? (param.time as number) : NaN;
          if (!Number.isFinite(ts)) {
            setCrosshair(null);
            return;
          }
          // Candle data has o/h/l/c; line/area has `value`.
          // We branch on presence rather than `type` to be robust to
          // future series types.
          const asOhlc = dataPoint as { open?: number; high?: number; low?: number; close?: number };
          const asValue = dataPoint as { value?: number };
          if (
            asOhlc.open !== undefined &&
            asOhlc.high !== undefined &&
            asOhlc.low !== undefined &&
            asOhlc.close !== undefined
          ) {
            setCrosshair({
              kind: "ohlc",
              time: ts,
              o: asOhlc.open,
              h: asOhlc.high,
              l: asOhlc.low,
              c: asOhlc.close,
            });
          } else if (asValue.value !== undefined) {
            setCrosshair({ kind: "value", time: ts, v: asValue.value });
          } else {
            setCrosshair(null);
          }
        };
        chart.subscribeCrosshairMove(crosshairHandler);
      } else {
        // Clear any stale mobile overlay if we crossed the breakpoint.
        setCrosshair(null);
      }

      const onResize = () => {
        if (!containerRef.current || !chartRef.current) return;
        const w = containerRef.current.clientWidth;
        // Use actual rendered height so aspect-ratio-driven mobile
        // layout stays in sync. Falls back to `effectiveHeight` if for
        // some reason clientHeight is 0 (offscreen).
        const h = containerRef.current.clientHeight || effectiveHeight;
        chartRef.current.resize(w, h);
      };
      window.addEventListener("resize", onResize);
      // ResizeObserver picks up size changes that don't fire a window
      // resize event (e.g. parent flex container reflow, orientation
      // change on mobile, or sidebar collapse on desktop).
      const ro =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
      ro?.observe(container);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        ro?.disconnect();
        if (crosshairHandler) {
          try {
            chart.unsubscribeCrosshairMove(crosshairHandler);
          } catch {
            // chart already disposed; ignore.
          }
        }
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
    // Recreate when type / theme / height / mobile-mode change. Data is
    // handled below.
  }, [type, isDark, effectiveHeight, isMobile]);

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

  // Timeframe selector: segmented tabs on desktop, dropdown on mobile.
  // The dropdown saves ~150px of horizontal space and renders the option
  // list as a native-feeling popover instead of a horizontally cramped
  // strip.
  const timeframeSelector =
    tabItems.length === 0 ? null : isMobile ? (
      <div className="flex justify-end">
        <Select
          aria-label="timeframe"
          size="sm"
          className="max-w-[8rem]"
          selectedKeys={selectedTimeframe ? [selectedTimeframe] : []}
          onSelectionChange={(keys) => {
            // HeroUI returns a Set<Key>; we use single-select semantics.
            const first = Array.from(keys as Set<React.Key>)[0];
            if (first !== undefined) onTimeframeChange?.(String(first));
          }}
        >
          {tabItems.map((item) => (
            <SelectItem key={item.key}>{item.label}</SelectItem>
          ))}
        </Select>
      </div>
    ) : (
      <div className="flex justify-end">
        <Tabs
          ariaLabel="timeframe"
          items={tabItems}
          size="sm"
          selectedKey={selectedTimeframe}
          onSelectionChange={(k) => onTimeframeChange?.(k)}
        />
      </div>
    );

  // Mobile crosshair overlay: rendered above the chart at a fixed
  // position. On desktop we leave it null so the built-in tooltip wins.
  const overlay =
    isMobile && crosshair ? (
      <div
        className={
          "pointer-events-none absolute left-2 right-2 top-2 z-10 " +
          "rounded border border-border-default bg-bg-surface/90 " +
          "px-2 py-1 font-mono text-xs text-text-secondary shadow-sm " +
          "backdrop-blur"
        }
      >
        <span className="text-text-primary">{formatTime(crosshair.time)}</span>
        {crosshair.kind === "ohlc" ? (
          <>
            <span className="ml-2">O {formatNum(crosshair.o)}</span>
            <span className="ml-2">H {formatNum(crosshair.h)}</span>
            <span className="ml-2">L {formatNum(crosshair.l)}</span>
            <span className="ml-2">C {formatNum(crosshair.c)}</span>
          </>
        ) : (
          <span className="ml-2">{formatNum(crosshair.v)}</span>
        )}
      </div>
    ) : null;

  // Layout: on mobile the *outer* wrapper carries the 16/9 aspect ratio
  // (spec §G5) with `minHeight: mobileHeight` so very wide phones still
  // get a usable chart strip; the inner chart container then fills 100%
  // of that wrapper. On desktop the wrapper is `aspectRatio: auto` and
  // the chart uses the fixed pixel `effectiveHeight`.
  const wrapperStyle: React.CSSProperties = isMobile
    ? { aspectRatio: "16 / 9", minHeight: mobileHeight }
    : { height: effectiveHeight };
  const chartContainerStyle: React.CSSProperties = isMobile
    ? { height: "100%" }
    : { height: effectiveHeight };

  return (
    <div className="w-full flex flex-col gap-2">
      {timeframeSelector}
      <div className="relative w-full" style={wrapperStyle}>
        {overlay}
        <div
          ref={containerRef}
          className="w-full rounded border border-border-default bg-bg-surface"
          style={chartContainerStyle}
        />
      </div>
    </div>
  );
}
