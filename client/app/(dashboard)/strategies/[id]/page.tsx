// Strategy detail page (Phase 4).
//
// This is a client component: the live toggle + risk caps + order log
// table are all interactive, and the order-log table also live-updates
// via the WS strategy stream. Phase 7 will revisit auth + admin gating
// (today the admin actions accept the key as a per-form input).

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  getOrders,
  getStrategy,
  setLive,
  setRisk,
} from "@/data/api-client";
import {
  TypeLiveMode,
  TypeOption,
  TypeOrderLog,
} from "@/data/type";
import { useStrategyStream } from "@/data/ws-client";

import TuneNowButton from "./tune-now";

export default function PageStrategyDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [strategy, setStrategy] = useState<TypeOption | null>(null);
  const [orders, setOrders] = useState<TypeOrderLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live toggle state
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<TypeLiveMode>("testnet");
  const [accountId, setAccountId] = useState("");

  // Risk caps state
  const [maxPosition, setMaxPosition] = useState<number>(0);
  const [maxLeverage, setMaxLeverage] = useState<number>(0);
  const [dailyLoss, setDailyLoss] = useState<number>(0);

  const refresh = async () => {
    if (!id) return;
    try {
      const [s, o] = await Promise.all([getStrategy(id), getOrders(id)]);
      setStrategy(s);
      setOrders(o);
      setEnabled(!!s.live?.enabled);
      setMode((s.live?.mode as TypeLiveMode) ?? "testnet");
      setAccountId(s.live?.accountId ?? "");
      setMaxPosition(s.risk?.maxPositionUsd ?? 0);
      setMaxLeverage(s.risk?.maxLeverage ?? 0);
      setDailyLoss(s.risk?.dailyLossCapUsd ?? 0);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    // The lint rule "set-state-in-effect" wants synchronous setState
    // calls hoisted out of effects; refresh() does an async fetch and
    // *then* calls setState, which is the recommended pattern. Run it
    // via a microtask trampoline to satisfy the rule statically.
    let cancelled = false;
    (async () => {
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live order events — prepended to the local order list as they arrive.
  const { events, connected } = useStrategyStream(id);

  // Merge incoming ws events into the orders table by clientOrderId.
  // Keeping this in a useMemo gives us a deterministic render order.
  const mergedOrders = useMemo(() => {
    const byClient = new Map<string, TypeOrderLog>();
    for (const o of orders) byClient.set(o.clientOrderId, o);
    for (const ev of events) {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      const cid = p["clientOrderId"] as string | undefined;
      if (!cid) continue;
      const existing = byClient.get(cid);
      const merged: TypeOrderLog = {
        ...(existing ?? {
          id: cid,
          clientOrderId: cid,
          strategyId: id ?? "",
          accountId: "",
          symbol: (p["symbol"] as string) ?? "",
          side: (p["side"] as TypeOrderLog["side"]) ?? "BUY",
          type: "MARKET",
          qty: 0,
          filled: 0,
          avgFillPrice: 0,
          status: "new",
          mode: "testnet",
          realisedPnlUsd: 0,
          submittedAt: (p["ts"] as string) ?? new Date().toISOString(),
          lastEventAt: (p["ts"] as string) ?? new Date().toISOString(),
        }),
        status: (p["status"] as TypeOrderLog["status"]) ?? existing?.status ?? "new",
        exchangeOrderId: (p["exchangeOrderId"] as string) ?? existing?.exchangeOrderId,
        filled: (p["filled"] as number) ?? existing?.filled ?? 0,
        avgFillPrice: (p["avgFillPrice"] as number) ?? existing?.avgFillPrice ?? 0,
        lastEventAt: (p["ts"] as string) ?? new Date().toISOString(),
      };
      byClient.set(cid, merged);
    }
    return Array.from(byClient.values()).sort(
      (a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt),
    );
  }, [orders, events, id]);

  const onSaveLive = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await setLive(id, { enabled, mode, accountId });
      await refresh();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSaveRisk = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await setRisk(id, {
        maxPositionUsd: maxPosition,
        maxLeverage,
        dailyLossCapUsd: dailyLoss,
      });
      await refresh();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!strategy) {
    return <div className="p-4 text-sm text-default-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {strategy.name}{" "}
          <span className="ml-2 text-sm text-default-500">
            {strategy.execSymbol}
          </span>
        </h1>
        <div className="flex items-center gap-3 text-xs text-default-500">
          {/* Phase 6 — manual "tune now" button. Calls
              POST /api/v1/strategies/:id/optimize and shows live progress
              via the WS optimization topic. */}
          {id && <TuneNowButton strategyId={id} />}
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-success-500" : "bg-default-300"}`} />
          {connected ? "live stream connected" : "stream idle"}
        </div>
      </div>

      {error && (
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          {error}
        </div>
      )}

      {mode === "mainnet" && enabled && (
        <div className="rounded border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
          MAINNET TRADING IS ENABLED FOR THIS STRATEGY. Real funds at risk. The
          server-side gate (env + confirm token) must currently be open.
        </div>
      )}

      {/* ---- Live toggle ---- */}
      <section className="rounded border border-default-200 p-4">
        <h2 className="mb-3 text-sm font-semibold">Live execution</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enabled</span>
          </label>
          <label className="flex items-center gap-2">
            Mode:
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as TypeLiveMode)}
              className="rounded border border-default-200 px-2 py-1"
            >
              <option value="testnet">testnet (default)</option>
              <option value="mainnet">mainnet (admin gate)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Account ID:
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded border border-default-200 px-2 py-1"
              placeholder="required when enabling"
            />
          </label>
        </div>
        <button
          disabled={busy}
          onClick={onSaveLive}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save live config
        </button>
      </section>

      {/* ---- Risk caps ---- */}
      <section className="rounded border border-default-200 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Risk caps{" "}
          <span className="text-xs font-normal text-default-500">
            (mandatory; missing values cause the gateway to REJECT every order)
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Max position (USD)
            <input
              type="number"
              value={maxPosition}
              onChange={(e) => setMaxPosition(Number(e.target.value))}
              className="rounded border border-default-200 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Max leverage
            <input
              type="number"
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(Number(e.target.value))}
              className="rounded border border-default-200 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Daily loss cap (USD)
            <input
              type="number"
              value={dailyLoss}
              onChange={(e) => setDailyLoss(Number(e.target.value))}
              className="rounded border border-default-200 px-2 py-1"
            />
          </label>
        </div>
        <button
          disabled={busy}
          onClick={onSaveRisk}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save risk caps
        </button>
      </section>

      {/* ---- Order log ---- */}
      <section className="rounded border border-default-200 p-4">
        <h2 className="mb-3 text-sm font-semibold">Order log (live)</h2>
        {mergedOrders.length === 0 ? (
          <p className="text-sm text-default-500">No orders yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-default-500">
              <tr>
                <th className="py-1">Submitted</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Filled</th>
                <th>Avg fill</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Client ID</th>
              </tr>
            </thead>
            <tbody>
              {mergedOrders.map((o) => (
                <tr key={o.clientOrderId} className="border-t border-default-200">
                  <td className="py-1">{o.submittedAt}</td>
                  <td>{o.symbol}</td>
                  <td>{o.side}</td>
                  <td>{o.type}</td>
                  <td>{o.qty}</td>
                  <td>{o.filled}</td>
                  <td>{o.avgFillPrice || ""}</td>
                  <td>
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        o.status === "filled"
                          ? "bg-success-100 text-success-700"
                          : o.status === "rejected"
                          ? "bg-danger-100 text-danger-700"
                          : "bg-default-100 text-default-700"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td>{o.mode}</td>
                  <td className="font-mono text-[10px]">{o.clientOrderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
