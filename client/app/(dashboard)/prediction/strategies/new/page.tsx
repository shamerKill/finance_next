"use client";

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { createPredictionStrategy } from "@/data/api-client";

// F2.1 — HeroUI conversion. The form structure mirrors the original
// raw-input version; only the controls themselves change so we get the
// same look-and-feel as /accounts/new.
export default function NewPredictionStrategyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [marketId, setMarketId] = useState("");
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
      const s = await createPredictionStrategy({
        name,
        marketId,
        outcome,
        risk: {
          maxNotionalUsd,
          maxOpenMarkets,
          maxSlippageBps,
          dailyLossCapUsd,
        },
      });
      router.push(`/prediction/strategies/${s.id}`);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">新建预测策略</h1>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="名称"
          isRequired
          value={name}
          onValueChange={setName}
        />
        <Input
          label="Market ID"
          description="Polymarket condition id 或 slug"
          isRequired
          value={marketId}
          onValueChange={setMarketId}
          className="font-mono"
        />
        <Select
          label="结果"
          selectedKeys={[outcome]}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0];
            if (k === "YES" || k === "NO") setOutcome(k);
          }}
        >
          <SelectItem key="YES">YES</SelectItem>
          <SelectItem key="NO">NO</SelectItem>
        </Select>

        <fieldset className="rounded border border-default-200 p-3">
          <legend className="text-sm px-1 text-default-600">
            风控上限（全部必填）
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="maxNotionalUsd"
              description="单一市场最大名义美元"
              minValue={0.01}
              step={1}
              value={maxNotionalUsd}
              onValueChange={(v) => setMaxNotionalUsd(Number(v))}
              isRequired
            />
            <NumberInput
              label="maxOpenMarkets"
              description="同时持有的最大市场数"
              minValue={1}
              step={1}
              value={maxOpenMarkets}
              onValueChange={(v) => setMaxOpenMarkets(Number(v))}
              isRequired
            />
            <NumberInput
              label="maxSlippageBps"
              description="相对 mid 的最大可接受滑点（bps）"
              minValue={1}
              step={1}
              value={maxSlippageBps}
              onValueChange={(v) => setMaxSlippageBps(Number(v))}
              isRequired
            />
            <NumberInput
              label="dailyLossCapUsd"
              description="单日最大累计亏损（USD）"
              minValue={0.01}
              step={1}
              value={dailyLossCapUsd}
              onValueChange={(v) => setDailyLossCapUsd(Number(v))}
              isRequired
            />
          </div>
        </fieldset>

        <ApiErrorView error={error} />

        <Button type="submit" color="primary" isLoading={submitting}>
          创建
        </Button>
      </form>
    </div>
  );
}
