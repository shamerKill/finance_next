"use client";

import {
  Button,
  Input,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Textarea,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { createBacktest, getOptions } from "@/data/api-client";
import { TypeOption } from "@/data/type";

// New backtest form. The strategy selector is populated from existing
// Options (the legacy strategy resource) since Phase 3 does not yet
// introduce a separate `strategies` collection. Phase 6 will reconcile.
//
// The params textarea defaults to a JSON snapshot of the selected Option
// so users can run a backtest of their existing config in one click.
//
// Node 2.C.5.c — every input is wrapped in <FormField> so the label is
// always above the control (mobile-friendly per spec §G5). The HeroUI
// `label` prop is dropped from the inputs to avoid double-labelling
// (FormField owns the label).

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
  // Query-string presets: when the operator clicks "回测此参数" on the
  // recommendation detail page, we arrive here with ?strategyId=...&
  // symbol=...&proposed=<json>&lookbackDays=30 so the form lands fully
  // pre-filled and a single click runs the dry-run.
  const searchParams = useSearchParams();
  const presetStrategyId = searchParams.get("strategyId") ?? "";
  const presetSymbol = searchParams.get("symbol") ?? "";
  const presetProposedRaw = searchParams.get("proposed");
  const presetLookbackDaysRaw = searchParams.get("lookbackDays");

  // Initialise paramsText from the recommendation's proposed params when
  // present; otherwise fall back to the default scaffold so first-time
  // users still see something useful.
  const initialParamsText = (() => {
    if (presetProposedRaw) {
      try {
        return JSON.stringify(JSON.parse(presetProposedRaw), null, 2);
      } catch {
        // Bad JSON in the query string — silently fall back so the
        // page still renders. The operator can paste manually.
      }
    }
    return defaultParamsFromOption(null);
  })();

  const [strategies, setStrategies] = useState<TypeOption[]>([]);
  const [strategyId, setStrategyId] = useState<string>(presetStrategyId);
  const [paramsText, setParamsText] = useState<string>(initialParamsText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decimal inputs kept as strings so we don't surface float-drift like
  // 0.0004 → 0.00039999998989515007 from the browser number-input
  // step-button arithmetic. Parsed at submit time.
  const [initialCapital, setInitialCapital] = useState("10000");
  const [commissionRate, setCommissionRate] = useState("0.0004");
  const [slippageBps, setSlippageBps] = useState("1");

  // datetime-local wants "YYYY-MM-DDTHH:mm" without timezone — slice the
  // ISO string accordingly.
  const fmtDtLocal = (d: Date) => d.toISOString().slice(0, 16);

  // Resolve initial date window. Priority:
  //   1. ?lookbackDays=N (from the "回测此参数" jump) wins.
  //   2. Otherwise default to 30 days.
  const initialPreset = (() => {
    const ld = presetLookbackDaysRaw ? Number(presetLookbackDaysRaw) : null;
    if (ld && Number.isFinite(ld)) {
      if (ld === 7) return "7d";
      if (ld === 30) return "30d";
      if (ld === 90) return "90d";
    }
    return "30d";
  })();
  const computeRange = (
    preset: string,
  ): { start: string; end: string } | null => {
    const end = new Date();
    let days: number | null = null;
    let start: Date | null = null;
    if (preset === "7d") days = 7;
    else if (preset === "30d") days = 30;
    else if (preset === "90d") days = 90;
    else if (preset === "ytd") {
      start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    }
    if (days !== null) {
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (!start) return null;
    return { start: fmtDtLocal(start), end: fmtDtLocal(end) };
  };
  const initialRange = computeRange(initialPreset) ?? {
    start: "",
    end: "",
  };
  const [datePreset, setDatePreset] = useState<string>(initialPreset);
  const [startTs, setStartTs] = useState<string>(initialRange.start);
  const [endTs, setEndTs] = useState<string>(initialRange.end);

  // Selecting a preset overwrites both date inputs; "custom" leaves
  // them alone so the user can type freely.
  const onPresetChange = (next: string) => {
    setDatePreset(next);
    if (next === "custom") return;
    const r = computeRange(next);
    if (r) {
      setStartTs(r.start);
      setEndTs(r.end);
    }
  };
  // When the user manually edits either date input, flip the preset
  // back to "custom" so the active pill matches reality.
  const onManualDateEdit = (which: "start" | "end", v: string) => {
    if (which === "start") setStartTs(v);
    else setEndTs(v);
    if (datePreset !== "custom") setDatePreset("custom");
  };

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
        start: new Date(startTs).toISOString(),
        end: new Date(endTs).toISOString(),
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

  // Banner shown when the form arrived pre-filled from a recommendation
  // — gives the operator context about why the inputs are populated.
  const fromRecommendation = !!presetProposedRaw;

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <PageHeader title="新建回测" subtitle="向量化 dry-run，结果落 Mongo + Timescale" />

      {fromRecommendation && (
        <Callout variant="info" title="已从 AI 推荐预填参数">
          检查交易对 / 时间窗口后点击「运行回测」即可以这些建议参数做样本外验证。
        </Callout>
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {strategies.length > 0 ? (
          <FormField label="策略" required>
            <Select
              aria-label="策略"
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
          </FormField>
        ) : (
          <FormField
            label="策略 ID"
            required
            hint="数据库中暂无策略——输入任意标识符为本次运行打标签。"
          >
            <Input
              aria-label="策略 ID"
              name="strategyId"
              value={strategyId}
              onValueChange={setStrategyId}
            />
          </FormField>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="交易所">
            <Select
              aria-label="交易所"
              name="exchange"
              defaultSelectedKeys={["binance"]}
            >
              {EXCHANGES.map((x) => (
                <SelectItem key={x}>{x}</SelectItem>
              ))}
            </Select>
          </FormField>
          <FormField label="交易对" required>
            <Input
              aria-label="交易对"
              name="symbol"
              defaultValue={presetSymbol || "BTCUSDT"}
            />
          </FormField>
          <FormField label="周期">
            <Select
              aria-label="周期"
              name="timeframe"
              defaultSelectedKeys={["1h"]}
            >
              {TIMEFRAMES.map((tf) => (
                <SelectItem key={tf}>{tf}</SelectItem>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="时间范围">
          <div className="flex flex-col gap-2">
            <RadioGroup
              aria-label="时间范围"
              orientation="horizontal"
              size="sm"
              value={datePreset}
              onValueChange={onPresetChange}
            >
              <Radio value="7d">7 天</Radio>
              <Radio value="30d">30 天</Radio>
              <Radio value="90d">90 天</Radio>
              <Radio value="ytd">本年</Radio>
              <Radio value="custom">自定义</Radio>
            </RadioGroup>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                aria-label="开始时间"
                name="start"
                type="datetime-local"
                label="开始时间"
                value={startTs}
                onValueChange={(v) => onManualDateEdit("start", v)}
                required
              />
              <Input
                aria-label="结束时间"
                name="end"
                type="datetime-local"
                label="结束时间"
                value={endTs}
                onValueChange={(v) => onManualDateEdit("end", v)}
                required
              />
            </div>
          </div>
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="初始资金">
            <Input
              aria-label="初始资金"
              name="initialCapital"
              type="text"
              inputMode="decimal"
              value={initialCapital}
              onValueChange={setInitialCapital}
            />
          </FormField>
          <FormField label="手续费率">
            <Input
              aria-label="手续费率"
              name="commissionRate"
              type="text"
              inputMode="decimal"
              value={commissionRate}
              onValueChange={setCommissionRate}
            />
          </FormField>
          <FormField label="滑点（bps）">
            <Input
              aria-label="滑点 bps"
              name="slippageBps"
              type="text"
              inputMode="decimal"
              value={slippageBps}
              onValueChange={setSlippageBps}
            />
          </FormField>
        </div>

        <FormField
          label="参数 JSON"
          hint="grid_dca 参数：createPositions[], stopProfitRate, stopLossRate, profitRateAfterAtAddPosition"
        >
          <Textarea
            aria-label="参数 JSON"
            value={paramsText}
            onValueChange={setParamsText}
            minRows={8}
          />
        </FormField>

        {error ? (
          <Callout variant="danger" title="提交失败">
            {error}
          </Callout>
        ) : null}

        <Button type="submit" color="primary" isLoading={submitting}>
          运行回测
        </Button>
      </form>
    </div>
  );
}
