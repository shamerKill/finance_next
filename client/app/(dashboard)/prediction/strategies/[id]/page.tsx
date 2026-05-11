"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
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

  const breadcrumb = (
    <span className="flex items-center gap-2 flex-wrap">
      <Link href="/prediction/strategies" className="hover:underline">
        ← 预测策略
      </Link>
      {s?.name && (
        <>
          <span className="text-default-300">/</span>
          <span>{s.name}</span>
        </>
      )}
    </span>
  );

  if (error && !s) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="预测策略详情" />
        <div className="rounded border border-danger p-3 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }
  if (!s) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="加载中…" />
      </div>
    );
  }

  const toggle = async (enabled: boolean) => {
    if (enabled && !walletId) {
      setError("请先选择钱包");
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

  // Resolve the wallet doc so we can render a friendly label next to
  // the relation link. Falls back to the bare id if we never fetched
  // the wallet list (e.g. listWallets() 4xx'd because of admin-key
  // requirements).
  const linkedWallet = wallets.find((w) => w.id === s.live.walletId);

  return (
    <div className="grid gap-4">
      <PageHeader
        breadcrumb={breadcrumb}
        title={s.name}
        subtitle={
          <>
            市场：
            <Link
              href={`/prediction/markets/${encodeURIComponent(s.marketId)}`}
              className="text-primary hover:underline font-mono"
            >
              {s.marketId}
            </Link>{" "}
            · 结果：{s.outcome} · v{s.currentVersion}
          </>
        }
      />

      <Section title="关联">
        <ul className="text-sm space-y-2">
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-default-500 w-16">市场</span>
            <Link
              href={`/prediction/markets/${encodeURIComponent(s.marketId)}`}
              className="text-primary hover:underline font-mono break-all"
            >
              {s.marketId}
            </Link>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-default-500 w-16">钱包</span>
            {s.live.walletId ? (
              <Link
                href={`/wallets/${s.live.walletId}`}
                className="text-primary hover:underline"
              >
                {linkedWallet
                  ? `${linkedWallet.label} (${linkedWallet.address.slice(0, 8)}…)`
                  : s.live.walletId}
              </Link>
            ) : (
              <span className="text-default-400">未关联钱包</span>
            )}
          </li>
        </ul>
      </Section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">实盘模式</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="border border-default-200 rounded px-2 py-1"
          >
            <option value="">— 选择钱包 —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} ({w.address.slice(0, 8)}…)
              </option>
            ))}
          </select>
          {walletId && (
            <Link
              href={`/wallets/${walletId}`}
              className="text-xs text-primary hover:underline"
            >
              查看钱包 →
            </Link>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => toggle(!s.live.enabled)}
            className={`px-3 py-2 rounded text-white text-sm ${
              s.live.enabled ? "bg-danger" : "bg-success"
            } disabled:opacity-50`}
          >
            {s.live.enabled ? "禁用实盘" : "启用实盘"}
          </button>
        </div>
        {s.live.enabled && (
          <div className="rounded border border-warning bg-warning/10 p-2 text-xs mt-2">
            <strong>MAINNET 主网</strong> — Polymarket 没有测试网。需要
            三道闸：env <code>POLYMARKET_TRADING_ENABLED=true</code> +
            admin token 已确认（1 小时窗口）+ 此策略 mode=mainnet。
          </div>
        )}
        {error && (
          <div className="text-xs text-danger mt-2">{error}</div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">风控上限</h2>
        <div className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
          <div>maxNotionalUsd：${s.risk.maxNotionalUsd}</div>
          <div>maxOpenMarkets：{s.risk.maxOpenMarkets}</div>
          <div>maxSlippageBps：{s.risk.maxSlippageBps}</div>
          <div>dailyLossCapUsd：${s.risk.dailyLossCapUsd}</div>
        </div>
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">最近订单</h2>
        {orders.length === 0 ? (
          <div className="text-sm text-default-500">暂无订单。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-default-500">
                  <th className="text-left">提交时间</th>
                  <th className="text-left">方向</th>
                  <th className="text-right">价格</th>
                  <th className="text-right">数量</th>
                  <th>状态</th>
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
          </div>
        )}
      </section>
    </div>
  );
}
