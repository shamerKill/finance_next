"use client";

import { Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { createBacktest, getOptions } from "@/data/api-client";
import { TypeOption } from "@/data/type";

// New backtest form. The strategy selector is populated from existing
// Options (the legacy strategy resource) since Phase 3 does not yet
// introduce a separate `strategies` collection. Phase 6 will reconcile.
//
// The params textarea defaults to a JSON snapshot of the selected Option
// so users can run a backtest of their existing config in one click.

const TIMEFRAMES = ["1m", "5m", "1h", "1d"] as const;
const EXCHANGES = ["binance", "okx", "bybit"];

function defaultParamsFromOption(opt: TypeOption | null): string {
  if (!opt) {
    return JSON.stringify(
      {
        createPositions: [
          { marginRate: 0.5, lossAddRate: 0.0 },
          { marginRate: 0.5, lossAddRate: 0.05 },
        ],
        stopProfitRate: 0.03,
        stopLossRate: 0.1,
        profitRateAfterAtAddPosition: 0.0,
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      createPositions: opt.createPositions ?? [],
      stopProfitRate: opt.stopProfitRate,
      stopLossRate: opt.stopLossRate,
      profitRateAfterAtAddPosition: opt.profitRateAfterAtAddPosition,
    },
    null,
    2,
  );
}

export default function NewBacktestPage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<TypeOption[]>([]);
  const [strategyId, setStrategyId] = useState<string>("");
  const [paramsText, setParamsText] = useState<string>(defaultParamsFromOption(null));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decimal inputs kept as strings so we don't surface float-drift like
  // 0.0004 → 0.00039999998989515007 from the browser number-input
  // step-button arithmetic. Parsed at submit time.
  const [initialCapital, setInitialCapital] = useState("10000");
  const [commissionRate, setCommissionRate] = useState("0.0004");
  const [slippageBps, setSlippageBps] = useState("1");

  useEffect(() => {
    let cancelled = false;
    getOptions()
      .then((opts: TypeOption[]) => {
        if (cancelled) return;
        setStrategies(opts ?? []);
      })
      .catch(() => {
        // Strategies are optional; fall back to manual id entry.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onStrategyChange(name: string) {
    const opt = strategies.find((s) => s.name === name) ?? null;
    setStrategyId(name);
    setParamsText(defaultParamsFromOption(opt));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const params = paramsText.trim() ? JSON.parse(paramsText) : {};
      const handle = await createBacktest({
        strategyId: strategyId || String(fd.get("strategyId") ?? ""),
        kind: "grid_dca",
        params,
        symbol: String(fd.get("symbol") ?? ""),
        exchange: String(fd.get("exchange") ?? "binance"),
        timeframe: String(fd.get("timeframe") ?? "1h") as
          | "1m"
          | "5m"
          | "1h"
          | "1d",
        start: new Date(String(fd.get("start"))).toISOString(),
        end: new Date(String(fd.get("end"))).toISOString(),
        initialCapital: Number(initialCapital || "10000"),
        commissionRate: Number(commissionRate || "0.0004"),
        slippageBps: Number(slippageBps || "1"),
      });
      router.push(`/backtests/${handle.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">新建回测</h1>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {strategies.length > 0 ? (
          <Select
            label="策略"
            selectedKeys={strategyId ? [strategyId] : []}
            onSelectionChange={(keys) => {
              const k = Array.from(keys)[0];
              if (k) onStrategyChange(String(k));
            }}
          >
            {strategies.map((s) => (
              <SelectItem key={s.name}>{s.name}</SelectItem>
            ))}
          </Select>
        ) : (
          <Input
            name="strategyId"
            label="策略 ID"
            required
            value={strategyId}
            onValueChange={setStrategyId}
            description="数据库中暂无策略——输入任意标识符为本次运行打标签。"
          />
        )}

        <div className="grid grid-cols-3 gap-3">
          <Select label="交易所" name="exchange" defaultSelectedKeys={["binance"]}>
            {EXCHANGES.map((x) => (
              <SelectItem key={x}>{x}</SelectItem>
            ))}
          </Select>
          <Input name="symbol" label="交易对" defaultValue="BTCUSDT" required />
          <Select label="周期" name="timeframe" defaultSelectedKeys={["1h"]}>
            {TIMEFRAMES.map((tf) => (
              <SelectItem key={tf}>{tf}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input name="start" type="datetime-local" label="开始时间" required />
          <Input name="end" type="datetime-local" label="结束时间" required />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            name="initialCapital"
            type="text"
            inputMode="decimal"
            label="初始资金"
            value={initialCapital}
            onValueChange={setInitialCapital}
          />
          <Input
            name="commissionRate"
            type="text"
            inputMode="decimal"
            label="手续费率"
            value={commissionRate}
            onValueChange={setCommissionRate}
          />
          <Input
            name="slippageBps"
            type="text"
            inputMode="decimal"
            label="滑点（bps）"
            value={slippageBps}
            onValueChange={setSlippageBps}
          />
        </div>

        <Textarea
          label="参数 JSON"
          value={paramsText}
          onValueChange={setParamsText}
          minRows={8}
          description="grid_dca 参数：createPositions[], stopProfitRate, stopLossRate, profitRateAfterAtAddPosition"
        />

        {error ? (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <Button type="submit" color="primary" isLoading={submitting}>
          运行回测
        </Button>
      </form>
    </div>
  );
}
