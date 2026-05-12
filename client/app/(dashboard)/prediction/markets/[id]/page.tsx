"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { DataTable } from "@/components/data-table";
import { OrderBook, OrderBookLevel } from "@/components/order-book";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
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

// Node 2.C.5.e — adopt OrderBook + DataTable + Stat + PageHeader.
// Polymarket's catalogue endpoint exposes a single bid/ask/mid quote (no
// full ladder), so the orderbook visual renders one level per side. When
// the quote stream eventually carries depth, this component will scale up
// without further changes.

const OUTCOME_BAR_GREEN = "bg-accent-up";
const OUTCOME_BAR_RED = "bg-accent-down";

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

  const latestQuote = quotes.length > 0 ? quotes[quotes.length - 1] : null;
  const yesMid = latestQuote?.mid ?? null;
  const noMid = yesMid != null ? 1 - yesMid : null;

  const { bids, asks } = useMemo(() => {
    if (!latestQuote)
      return { bids: [] as OrderBookLevel[], asks: [] as OrderBookLevel[] };
    const bidPx = latestQuote.bid;
    const askPx = latestQuote.ask;
    const vol = latestQuote.volume24h ?? 1;
    return {
      bids:
        bidPx != null
          ? [{ price: bidPx, size: vol }]
          : ([] as OrderBookLevel[]),
      asks:
        askPx != null
          ? [{ price: askPx, size: vol }]
          : ([] as OrderBookLevel[]),
    };
  }, [latestQuote]);

  const breadcrumb = (
    <span className="flex items-center gap-2 flex-wrap">
      <Link href="/prediction/markets" className="hover:underline">
        ← 预测市场
      </Link>
      {market?.question && (
        <>
          <span className="text-text-tertiary">/</span>
          <span className="line-clamp-1 max-w-[60ch]">{market.question}</span>
        </>
      )}
    </span>
  );

  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="预测市场详情" />
        <ApiErrorView error={error} />
      </div>
    );
  }
  if (!market) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="加载中…" />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        breadcrumb={breadcrumb}
        title={market.question}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {market.category && (
              <StatusBadge tone="default" variant="flat" size="sm">
                {market.category}
              </StatusBadge>
            )}
            <span>
              结束：
              {market.endDate
                ? new Date(market.endDate).toLocaleString()
                : "无结束日期"}
            </span>
          </span>
        }
        action={
          <Button
            as={Link}
            href={`/prediction/strategies/new?marketId=${encodeURIComponent(market.marketId)}`}
            color="primary"
            size="sm"
          >
            为此市场创建策略 →
          </Button>
        }
      />

      {yesMid != null && noMid != null && (
        <Section title="结果概率">
          <div className="space-y-3">
            <OutcomeBar label="YES" prob={yesMid} color={OUTCOME_BAR_GREEN} />
            <OutcomeBar label="NO" prob={noMid} color={OUTCOME_BAR_RED} />
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="最新中间价"
          value={
            yesMid != null ? (
              <span className="font-mono tnum">{yesMid.toFixed(4)}</span>
            ) : (
              "—"
            )
          }
          hint="YES outcome"
        />
        <Stat
          label="最新 last"
          value={
            latestQuote?.last != null ? (
              <span className="font-mono tnum">
                {latestQuote.last.toFixed(4)}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Stat
          label="24h 成交量"
          value={
            latestQuote?.volume24h != null ? (
              <span className="font-mono tnum">
                {latestQuote.volume24h.toLocaleString()}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Stat
          label="报价时间"
          value={
            latestQuote ? (
              <span className="font-mono text-mono-sm tnum">
                {new Date(latestQuote.ts).toLocaleTimeString()}
              </span>
            ) : (
              "—"
            )
          }
          hint={quotes.length === 0 ? "无报价历史" : `${quotes.length} 条记录`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="订单簿（YES）">
          {bids.length === 0 && asks.length === 0 ? (
            <div className="text-sm text-text-tertiary">
              暂无报价。Polymarket 报价流抓取完成后会自动出现。
            </div>
          ) : (
            <OrderBook
              bids={bids}
              asks={asks}
              maxRows={10}
              mid={
                yesMid != null ? (
                  <span className="font-mono tnum">
                    mid {yesMid.toFixed(4)}
                  </span>
                ) : null
              }
            />
          )}
        </Section>

        <Section title="最近成交">
          {trades.length === 0 ? (
            <div className="text-sm text-text-tertiary">无成交历史。</div>
          ) : (
            <DataTable<TypePredictionTrade>
              ariaLabel="最近成交"
              mobileLayout="scroll"
              rows={trades}
              getRowKey={(t) => t.txHash || `${t.ts}-${t.price}-${t.size}`}
              columns={[
                {
                  key: "ts",
                  label: "时间",
                  render: (t) => (
                    <span className="font-mono text-mono-sm tnum">
                      {new Date(t.ts).toLocaleTimeString()}
                    </span>
                  ),
                },
                {
                  key: "side",
                  label: "方向",
                  render: (t) => (
                    <StatusBadge
                      tone={
                        t.side.toUpperCase() === "BUY" ? "success" : "danger"
                      }
                      variant="dot"
                      size="sm"
                    >
                      {t.side}
                    </StatusBadge>
                  ),
                },
                {
                  key: "price",
                  label: "价格",
                  align: "end",
                  render: (t) => (
                    <span className="font-mono tnum">
                      {t.price.toFixed(4)}
                    </span>
                  ),
                },
                {
                  key: "size",
                  label: "数量",
                  align: "end",
                  render: (t) => (
                    <span className="font-mono tnum">
                      {t.size.toFixed(2)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Section>
      </div>

      <Callout variant="info" title="下单流程">
        下单通过预测策略完成 — 点击右上角 <em>“为此市场创建策略”</em>{" "}
        预填此市场 ID，关联钱包后启用实盘。Polymarket 没有测试网，启用实盘
        需通过三道闸。
      </Callout>
    </div>
  );
}

function OutcomeBar({
  label,
  prob,
  color,
}: {
  label: string;
  prob: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, prob * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono tnum text-text-primary">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
