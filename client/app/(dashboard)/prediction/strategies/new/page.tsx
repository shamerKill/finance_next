"use client";

import {
  Button,
  Input,
  NumberInput,
  Radio,
  RadioGroup,
} from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RiskMeter } from "@/components/risk-meter";
import { Section } from "@/components/section";
import { createPredictionStrategy } from "@/data/api-client";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

// Node 2.C.5.e — FormField + RiskMeter visualisation. Backend still owns
// every validation rule; the meters are purely informational so users see
// where their cap sits relative to a recommended ceiling.

// Recommended ceilings used by the RiskMeter visualisation. These are
// presentation hints only — backend enforces the hard cap.
const HINT_MAX_NOTIONAL = 1000; // $1k per market
const HINT_MAX_MARKETS = 10;
const HINT_MAX_SLIPPAGE_BPS = 1000; // 10%
const HINT_DAILY_LOSS = 500;

export default function NewPredictionStrategyPage() {
  const router = useRouter();
  const activity = useActivityCenter();
  const sp = useSearchParams();
  const prefillMarketId = sp?.get("marketId") ?? "";

  const [name, setName] = useState("");
  const [marketId, setMarketId] = useState(prefillMarketId);
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [maxNotionalUsd, setMaxNotionalUsd] = useState(100);
  const [maxOpenMarkets, setMaxOpenMarkets] = useState(3);
  const [maxSlippageBps, setMaxSlippageBps] = useState(200);
  const [dailyLossCapUsd, setDailyLossCapUsd] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const s = await withActivity(
        activity,
        {
          kind: "other",
          label: `新建预测策略 - ${name || "未命名"}`,
          detail: `${outcome} · ${marketId}`,
        },
        () =>
          createPredictionStrategy({
            name,
            marketId,
            outcome,
            risk: {
              maxNotionalUsd,
              maxOpenMarkets,
              maxSlippageBps,
              dailyLossCapUsd,
            },
          }),
      );
      router.push(`/prediction/strategies/${s.id}`);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumb={
          <Link href="/prediction/strategies" className="hover:underline">
            ← 预测策略
          </Link>
        }
        title="新建预测策略"
      />

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Section title="基本信息">
          <div className="flex flex-col gap-4">
            <FormField label="名称" required htmlFor="strat-name">
              <Input
                id="strat-name"
                value={name}
                onValueChange={setName}
              />
            </FormField>

            <FormField
              label="Market ID"
              required
              htmlFor="strat-market"
              hint="Polymarket condition id 或 slug"
            >
              <Input
                id="strat-market"
                value={marketId}
                onValueChange={setMarketId}
                className="font-mono"
              />
            </FormField>

            <FormField label="结果" required>
              <RadioGroup
                orientation="horizontal"
                value={outcome}
                onValueChange={(v) => setOutcome(v === "NO" ? "NO" : "YES")}
              >
                <Radio value="YES">YES</Radio>
                <Radio value="NO">NO</Radio>
              </RadioGroup>
            </FormField>
          </div>
        </Section>

        <Section title="风控上限（全部必填）">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <FormField
                label="maxNotionalUsd"
                required
                htmlFor="risk-notional"
                hint="单一市场最大名义美元"
              >
                <NumberInput
                  id="risk-notional"
                  minValue={0.01}
                  step={1}
                  value={maxNotionalUsd}
                  onValueChange={(v) => setMaxNotionalUsd(Number(v))}
                  classNames={{ input: "font-mono tnum" }}
                />
              </FormField>
              <RiskMeter
                value={maxNotionalUsd}
                max={HINT_MAX_NOTIONAL}
                label={
                  <span>
                    相对建议上限 ${HINT_MAX_NOTIONAL}
                  </span>
                }
                readout={`$${maxNotionalUsd.toLocaleString()}`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <FormField
                label="maxOpenMarkets"
                required
                htmlFor="risk-markets"
                hint="同时持有的最大市场数"
              >
                <NumberInput
                  id="risk-markets"
                  minValue={1}
                  step={1}
                  value={maxOpenMarkets}
                  onValueChange={(v) => setMaxOpenMarkets(Number(v))}
                  classNames={{ input: "font-mono tnum" }}
                />
              </FormField>
              <RiskMeter
                value={maxOpenMarkets}
                max={HINT_MAX_MARKETS}
                label={
                  <span>
                    相对建议上限 {HINT_MAX_MARKETS}
                  </span>
                }
                readout={`${maxOpenMarkets} / ${HINT_MAX_MARKETS}`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <FormField
                label="maxSlippageBps"
                required
                htmlFor="risk-slip"
                hint="相对 mid 的最大可接受滑点（bps）"
              >
                <NumberInput
                  id="risk-slip"
                  minValue={1}
                  step={1}
                  value={maxSlippageBps}
                  onValueChange={(v) => setMaxSlippageBps(Number(v))}
                  classNames={{ input: "font-mono tnum" }}
                />
              </FormField>
              <RiskMeter
                value={maxSlippageBps}
                max={HINT_MAX_SLIPPAGE_BPS}
                label={
                  <span>
                    相对建议上限 {HINT_MAX_SLIPPAGE_BPS} bps
                  </span>
                }
                readout={`${maxSlippageBps} bps`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <FormField
                label="dailyLossCapUsd"
                required
                htmlFor="risk-daily"
                hint="单日最大累计亏损（USD）"
              >
                <NumberInput
                  id="risk-daily"
                  minValue={0.01}
                  step={1}
                  value={dailyLossCapUsd}
                  onValueChange={(v) => setDailyLossCapUsd(Number(v))}
                  classNames={{ input: "font-mono tnum" }}
                />
              </FormField>
              <RiskMeter
                value={dailyLossCapUsd}
                max={HINT_DAILY_LOSS}
                label={
                  <span>
                    相对建议上限 ${HINT_DAILY_LOSS}
                  </span>
                }
                readout={`$${dailyLossCapUsd.toLocaleString()}`}
              />
            </div>
          </div>
        </Section>

        <ApiErrorView error={error} />

        <Button type="submit" color="primary" isLoading={submitting}>
          创建
        </Button>
      </form>
    </div>
  );
}
