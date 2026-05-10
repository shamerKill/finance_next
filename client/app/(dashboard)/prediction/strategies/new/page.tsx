"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createPredictionStrategy } from "@/data/api-client";

export default function NewPredictionStrategyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [marketId, setMarketId] = useState("");
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [maxNotionalUsd, setMaxNotionalUsd] = useState("100");
  const [maxOpenMarkets, setMaxOpenMarkets] = useState("3");
  const [maxSlippageBps, setMaxSlippageBps] = useState("200");
  const [dailyLossCapUsd, setDailyLossCapUsd] = useState("50");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          maxNotionalUsd: parseFloat(maxNotionalUsd),
          maxOpenMarkets: parseInt(maxOpenMarkets, 10),
          maxSlippageBps: parseInt(maxSlippageBps, 10),
          dailyLossCapUsd: parseFloat(dailyLossCapUsd),
        },
      });
      router.push(`/prediction/strategies/${s.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">New Prediction Strategy</h1>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="text-sm flex flex-col gap-1">
          <span>Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-default-200 rounded px-2 py-1"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>Market ID (Polymarket condition or slug)</span>
          <input
            required
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="border border-default-200 rounded px-2 py-1 font-mono"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>Outcome</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as "YES" | "NO")}
            className="border border-default-200 rounded px-2 py-1"
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </label>
        <fieldset className="border border-default-200 rounded p-3">
          <legend className="text-sm px-1">Risk caps (all required)</legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span>maxNotionalUsd (per market)</span>
              <input
                type="number" step="0.01" min="0.01"
                value={maxNotionalUsd}
                onChange={(e) => setMaxNotionalUsd(e.target.value)}
                className="border border-default-200 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>maxOpenMarkets</span>
              <input
                type="number" min="1"
                value={maxOpenMarkets}
                onChange={(e) => setMaxOpenMarkets(e.target.value)}
                className="border border-default-200 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>maxSlippageBps</span>
              <input
                type="number" min="1"
                value={maxSlippageBps}
                onChange={(e) => setMaxSlippageBps(e.target.value)}
                className="border border-default-200 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>dailyLossCapUsd</span>
              <input
                type="number" step="0.01" min="0.01"
                value={dailyLossCapUsd}
                onChange={(e) => setDailyLossCapUsd(e.target.value)}
                className="border border-default-200 rounded px-2 py-1"
              />
            </label>
          </div>
        </fieldset>
        {error && (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-primary text-white text-sm disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </form>
    </div>
  );
}
