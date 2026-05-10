"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getPredictionMarket,
  getPredictionQuotes,
  getPredictionTrades,
} from "@/data/api-client";
import {
  TypePredictionMarket,
  TypePredictionQuote,
  TypePredictionTrade,
} from "@/data/type";

export default function PredictionMarketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [market, setMarket] = useState<TypePredictionMarket | null>(null);
  const [quotes, setQuotes] = useState<TypePredictionQuote[]>([]);
  const [trades, setTrades] = useState<TypePredictionTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const m = await getPredictionMarket(id);
        if (!cancel) setMarket(m);
        const t = await getPredictionTrades(id, 50).catch(() => []);
        if (!cancel) setTrades(t);
        // Quotes are keyed by token_id; use the market id as a placeholder
        // until the metadata row carries token_ids.
        const q = await getPredictionQuotes(id).catch(() => []);
        if (!cancel) setQuotes(q);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="rounded border border-danger p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!market) {
    return <div className="text-sm text-default-500">Loading…</div>;
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{market.question}</h1>
      <div className="text-xs text-default-500">
        {market.category} · ends{" "}
        {market.endDate
          ? new Date(market.endDate).toLocaleString()
          : "no end date"}
      </div>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Latest quotes</h2>
        {quotes.length === 0 ? (
          <div className="text-sm text-default-500">No quote history.</div>
        ) : (
          <div className="grid gap-1 text-sm font-mono">
            {quotes.slice(-10).map((q, i) => (
              <div key={i} className="flex justify-between">
                <span>{new Date(q.ts).toISOString()}</span>
                <span>mid={(q.mid ?? 0).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Recent trades</h2>
        {trades.length === 0 ? (
          <div className="text-sm text-default-500">No trade history.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-default-500">
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Side</th>
                <th className="text-right">Price</th>
                <th className="text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.txHash || `${t.ts}-${t.price}`}>
                  <td className="font-mono text-xs">
                    {new Date(t.ts).toLocaleTimeString()}
                  </td>
                  <td>{t.side}</td>
                  <td className="text-right">{t.price.toFixed(4)}</td>
                  <td className="text-right">{t.size.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="border border-default-200 rounded p-4 bg-warning/5">
        <h2 className="font-semibold mb-2">Place order</h2>
        <div className="text-xs text-default-500">
          Order placement uses prediction strategies — create a strategy under{" "}
          <Link href="/prediction/strategies/new" className="underline">
            Prediction Strategies
          </Link>{" "}
          referencing this market id, attach a wallet, then enable live.
        </div>
      </section>
    </div>
  );
}
