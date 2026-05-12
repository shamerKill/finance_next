"use client";

// Markets control bar (F1). Lifts the previously-hardcoded
// exchange/symbol/timeframe/range into URL query string so the server
// component can render any combination. The page-level layout looks
// like:
//
//   ?ex=binance&sym=BTCUSDT&tf=1h&range=30d
//
// All four params are URL-driven; the components below `router.push`
// the next snapshot whenever the user changes a control. We deliberately
// keep state in the URL (not React state) so reloading / sharing a
// link reproduces the same view.

import {
  Autocomplete,
  AutocompleteItem,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getExchangeMeta } from "@/data/api-client";
import type { TypeExchange, TypeExchangeMeta } from "@/data/type";

const EXCHANGES: { key: TypeExchange; label: string }[] = [
  { key: "binance", label: "Binance" },
  { key: "okx", label: "OKX" },
  { key: "bybit", label: "Bybit" },
];

const TIMEFRAMES = ["1m", "5m", "1h", "1d"] as const;
const RANGES = ["7d", "30d", "90d", "180d", "365d"] as const;

const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  "7d": "最近 7 天",
  "30d": "最近 30 天",
  "90d": "最近 90 天",
  "180d": "最近 180 天",
  "365d": "最近 1 年",
};

// HeroUI's <Autocomplete> with allowsCustomValue puts the displayed label
// into the input field when the user picks a suggestion. If we just read
// e.target.value verbatim we end up posting "BTCUSDT  (BTC/USDT:USDT)" to
// ccxt and get BadSymbol back. Resolve the displayed text back to a key
// (the key IS the bare symbol like "BTCUSDT") by matching against the
// candidate list; strip whitespace + trailing parens for safety so a
// hand-typed "BTCUSDT  (BTC/USDT)" still resolves cleanly.
function resolveSymbolInput(
  e: { target: EventTarget | null },
  items: { key: string; label: string }[],
  current: string,
): string {
  const raw = ((e.target as HTMLInputElement | null)?.value ?? "").trim();
  if (!raw) return current;
  // Exact label match → use its key
  const byLabel = items.find((i) => i.label === raw);
  if (byLabel) return byLabel.key;
  // Strip the trailing parenthesised hint that our own label generator adds.
  let cleaned = raw;
  const lparen = cleaned.indexOf("(");
  if (lparen > 0) cleaned = cleaned.slice(0, lparen).trim();
  cleaned = cleaned.replace(/\s+/g, "");
  return cleaned || current;
}

export type MarketsControlsProps = {
  exchange: TypeExchange;
  symbol: string;
  timeframe: string;
  range: string;
};

export function MarketsControls({
  exchange,
  symbol,
  timeframe,
  range,
}: MarketsControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Symbol suggestion list — fetched per-exchange from /exchange/meta.
  // The endpoint may return [] when no meta has been ingested yet; in
  // that case the Autocomplete still allows free-text entry.
  const [suggestions, setSuggestions] = useState<TypeExchangeMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    getExchangeMeta(exchange)
      .then((res) => {
        if (cancelled) return;
        // The endpoint returns an array when symbol is omitted.
        setSuggestions(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        // exchange_meta may not be wired in dev — silently fall back.
      });
    return () => {
      cancelled = true;
    };
  }, [exchange]);

  // Map suggestions to a stable Autocomplete key list. We dedupe on
  // nativeSymbol since that's what the chart query consumes.
  const symbolItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { key: string; label: string }[] = [];
    for (const m of suggestions) {
      if (seen.has(m.nativeSymbol)) continue;
      seen.add(m.nativeSymbol);
      items.push({
        key: m.nativeSymbol,
        label: `${m.nativeSymbol}  (${m.canonicalSymbol})`,
      });
    }
    return items;
  }, [suggestions]);

  // Push the next URL snapshot, preserving the un-touched params.
  const push = (patch: Partial<MarketsControlsProps>) => {
    const next = new URLSearchParams(searchParams.toString());
    if (patch.exchange !== undefined) next.set("ex", patch.exchange);
    if (patch.symbol !== undefined) next.set("sym", patch.symbol);
    if (patch.timeframe !== undefined) next.set("tf", patch.timeframe);
    if (patch.range !== undefined) next.set("range", patch.range);
    router.push(`?${next.toString()}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto_180px] gap-3 items-end">
      <Select
        label="交易所"
        size="sm"
        selectedKeys={[exchange]}
        onSelectionChange={(keys) => {
          const k = Array.from(keys)[0] as TypeExchange | undefined;
          if (k) push({ exchange: k });
        }}
      >
        {EXCHANGES.map((e) => (
          <SelectItem key={e.key}>{e.label}</SelectItem>
        ))}
      </Select>

      <Autocomplete
        label="交易对"
        size="sm"
        allowsCustomValue
        defaultInputValue={symbol}
        onSelectionChange={(key) => {
          if (key) push({ symbol: String(key) });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            push({ symbol: resolveSymbolInput(e, symbolItems, symbol) });
          }
        }}
        onBlur={(e) => {
          push({ symbol: resolveSymbolInput(e, symbolItems, symbol) });
        }}
        description={
          symbolItems.length
            ? `${symbolItems.length} 个候选 — 输入并回车以应用`
            : "暂无 exchange_meta 数据，可自由输入"
        }
      >
        {symbolItems.map((m) => (
          <AutocompleteItem key={m.key}>{m.label}</AutocompleteItem>
        ))}
      </Autocomplete>

      <RadioGroup
        label="周期"
        orientation="horizontal"
        size="sm"
        value={timeframe}
        onValueChange={(v) => push({ timeframe: v })}
      >
        {TIMEFRAMES.map((tf) => (
          <Radio key={tf} value={tf}>
            {tf}
          </Radio>
        ))}
      </RadioGroup>

      <Select
        label="范围"
        size="sm"
        selectedKeys={[range]}
        onSelectionChange={(keys) => {
          const k = Array.from(keys)[0];
          if (k) push({ range: String(k) });
        }}
      >
        {RANGES.map((r) => (
          <SelectItem key={r}>{RANGE_LABEL[r]}</SelectItem>
        ))}
      </Select>
    </div>
  );
}
