"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getPredictionStrategy,
  listPredictionOrders,
  listWallets,
  togglePredictionLive,
} from "@/data/api-client";
import {
  TypePredictionOrder,
  TypePredictionStrategy,
  TypeWallet,
} from "@/data/type";

export default function PredictionStrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [s, setS] = useState<TypePredictionStrategy | null>(null);
  const [orders, setOrders] = useState<TypePredictionOrder[]>([]);
  const [wallets, setWallets] = useState<TypeWallet[]>([]);
  const [walletId, setWalletId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [strat, orderList, wList] = await Promise.all([
          getPredictionStrategy(id),
          listPredictionOrders(id, 50).catch(() => []),
          listWallets().catch(() => []),
        ]);
        if (cancel) return;
        setS(strat);
        setOrders(orderList);
        setWallets(wList);
        setWalletId(strat.live.walletId ?? "");
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const toggle = async (enabled: boolean) => {
    if (enabled && !walletId) {
      setError("select a wallet first");
      return;
    }
    setBusy(true);
    try {
      const updated = await togglePredictionLive(id, {
        enabled,
        walletId,
        mode: "mainnet",
      });
      setS(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !s) {
    return (
      <div className="rounded border border-danger p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!s) return <div className="text-sm">Loading…</div>;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{s.name}</h1>
      <div className="text-xs text-default-500">
        market: {s.marketId} · outcome: {s.outcome} · v{s.currentVersion}
      </div>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Live mode</h2>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="border border-default-200 rounded px-2 py-1"
          >
            <option value="">— select wallet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} ({w.address.slice(0, 8)}…)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => toggle(!s.live.enabled)}
            className={`px-3 py-2 rounded text-white text-sm ${
              s.live.enabled ? "bg-danger" : "bg-success"
            } disabled:opacity-50`}
          >
            {s.live.enabled ? "Disable live" : "Enable live"}
          </button>
        </div>
        {s.live.enabled && (
          <div className="rounded border border-warning bg-warning/10 p-2 text-xs mt-2">
            <strong>MAINNET</strong> — Polymarket has no testnet. Three gates
            required: env <code>POLYMARKET_TRADING_ENABLED=true</code> + admin
            token confirmed (1h window) + this strategy mode=mainnet.
          </div>
        )}
        {error && (
          <div className="text-xs text-danger mt-2">{error}</div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Risk caps</h2>
        <div className="text-sm grid grid-cols-2 gap-1">
          <div>maxNotionalUsd: ${s.risk.maxNotionalUsd}</div>
          <div>maxOpenMarkets: {s.risk.maxOpenMarkets}</div>
          <div>maxSlippageBps: {s.risk.maxSlippageBps}</div>
          <div>dailyLossCapUsd: ${s.risk.dailyLossCapUsd}</div>
        </div>
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Recent orders</h2>
        {orders.length === 0 ? (
          <div className="text-sm text-default-500">No orders yet.</div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-default-500">
                <th className="text-left">submittedAt</th>
                <th className="text-left">side</th>
                <th className="text-right">price</th>
                <th className="text-right">size</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.clientOrderId}>
                  <td>{new Date(o.submittedAt).toLocaleString()}</td>
                  <td>{o.side}</td>
                  <td className="text-right">{o.price.toFixed(4)}</td>
                  <td className="text-right">{o.size.toFixed(2)}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
