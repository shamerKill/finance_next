"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ApiErrorView } from "@/components/api-error";
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
  const [error, setError] = useState<unknown>(null);

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
        if (!cancel) setError(e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  if (error) {
    return <ApiErrorView error={error} />;
  }
  if (!market) {
    return <div className="text-sm text-default-500">加载中…</div>;
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{market.question}</h1>
      <div className="text-xs text-default-500">
        {market.category} · 结束{" "}
        {market.endDate
          ? new Date(market.endDate).toLocaleString()
          : "无结束日期"}
      </div>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">最新报价</h2>
        {quotes.length === 0 ? (
          <div className="text-sm text-default-500">无报价历史。</div>
        ) : (
          <div className="grid gap-1 text-sm font-mono">
            {quotes.slice(-10).map((q, i) => (
              <div key={i} className="flex justify-between">
                <span>{new Date(q.ts).toISOString()}</span>
                <span>中间价={(q.mid ?? 0).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">最近成交</h2>
        {trades.length === 0 ? (
          <div className="text-sm text-default-500">无成交历史。</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-default-500">
              <tr>
                <th className="text-left">时间</th>
                <th className="text-left">方向</th>
                <th className="text-right">价格</th>
                <th className="text-right">数量</th>
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
        <h2 className="font-semibold mb-2">下单</h2>
        <div className="text-xs text-default-500">
          下单通过预测策略完成 — 在{" "}
          <Link href="/prediction/strategies/new" className="underline">
            预测策略
          </Link>{" "}
          下创建一个引用此 market id 的策略，关联钱包后启用实盘。
        </div>
      </section>
    </div>
  );
}
