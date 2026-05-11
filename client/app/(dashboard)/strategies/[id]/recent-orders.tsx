"use client";

// Recent-orders table for the strategy detail page. Initial rows are
// rendered server-side via the /performance endpoint; this client island
// subscribes to the WS strategy topic and merges incoming
// `event.order.{filled|rejected|canceled|updated}` envelopes into the
// same table by clientOrderId. Newest first; capped at the same 10
// rows the gateway returned.

import { useMemo } from "react";

import { StatusBadge, type StatusTone } from "@/components/status-badge";
import type {
  TypeOrderStatus,
  TypeStrategyPerformanceOrder,
} from "@/data/type";
import { useStrategyStream } from "@/data/ws-client";

type Props = {
  strategyId: string;
  initial: TypeStrategyPerformanceOrder[];
};

const STATUS_TONE: Record<TypeOrderStatus, StatusTone> = {
  new: "default",
  partial: "primary",
  filled: "success",
  canceled: "default",
  rejected: "danger",
  unknown: "warning",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtNum(v: number | undefined, dp = 4): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  return v.toFixed(dp).replace(/\.?0+$/, "");
}

export function RecentOrdersTable({ strategyId, initial }: Props) {
  const { events, connected } = useStrategyStream(strategyId);

  const merged = useMemo(() => {
    const byClient = new Map<string, TypeStrategyPerformanceOrder>();
    for (const o of initial) byClient.set(o.clientOrderId, o);
    for (const ev of events) {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      const cid = p["clientOrderId"] as string | undefined;
      if (!cid) continue;
      const existing = byClient.get(cid);
      byClient.set(cid, {
        ...(existing ?? {
          clientOrderId: cid,
          symbol: (p["symbol"] as string) ?? "",
          side: (p["side"] as TypeStrategyPerformanceOrder["side"]) ?? "BUY",
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
        status:
          (p["status"] as TypeOrderStatus) ?? existing?.status ?? "new",
        exchangeOrderId:
          (p["exchangeOrderId"] as string) ?? existing?.exchangeOrderId,
        filled: (p["filled"] as number) ?? existing?.filled ?? 0,
        avgFillPrice:
          (p["avgFillPrice"] as number) ?? existing?.avgFillPrice ?? 0,
        lastEventAt: (p["ts"] as string) ?? new Date().toISOString(),
      });
    }
    return Array.from(byClient.values())
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
      .slice(0, 10);
  }, [initial, events]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2 text-[11px] text-default-500">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-success-500" : "bg-default-300"
          }`}
        />
        {connected ? "实时" : "等待事件"}
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-default-500">
          <tr>
            <th className="py-1 pr-2">时间</th>
            <th className="pr-2">交易对</th>
            <th className="pr-2">方向</th>
            <th className="pr-2 text-right">数量</th>
            <th className="pr-2 text-right">价格</th>
            <th className="pr-2">状态</th>
            <th>客户端 ID</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((o) => (
            <tr
              key={o.clientOrderId}
              className="border-t border-default-200"
            >
              <td className="py-1 pr-2 whitespace-nowrap">
                {fmtTime(o.submittedAt)}
              </td>
              <td className="pr-2">{o.symbol}</td>
              <td className="pr-2">{o.side}</td>
              <td className="pr-2 text-right">{fmtNum(o.qty)}</td>
              <td className="pr-2 text-right">
                {fmtNum(o.avgFillPrice || o.price, 2)}
              </td>
              <td className="pr-2">
                <StatusBadge tone={STATUS_TONE[o.status] ?? "default"}>
                  {o.status}
                </StatusBadge>
              </td>
              <td className="font-mono text-[10px] text-default-500">
                {o.clientOrderId.slice(0, 12)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
