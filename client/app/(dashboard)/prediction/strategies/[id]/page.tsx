"use client";

import { Button, Select, SelectItem } from "@heroui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RiskMeter } from "@/components/risk-meter";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge, StatusTone } from "@/components/status-badge";
import { Tabs } from "@/components/tabs";
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

// Node 2.C.5.e — Tabs (参数 / 风控 / 订单 / 实时) + design-system
// primitives. The mainnet 3-gate warning + walletId requirement remain.

// Recommended ceilings used for the read-only RiskMeter visualisations.
// These are presentation hints — backend owns the hard caps.
const HINT_MAX_NOTIONAL = 1000;
const HINT_MAX_MARKETS = 10;
const HINT_MAX_SLIPPAGE_BPS = 1000;
const HINT_DAILY_LOSS = 500;

function orderStatusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s.includes("filled") || s === "success") return "success";
  if (s.includes("rejected") || s.includes("canceled") || s.includes("failed"))
    return "danger";
  if (s.includes("pending") || s.includes("partial") || s.includes("submitted"))
    return "warning";
  return "default";
}

export default function PredictionStrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [s, setS] = useState<TypePredictionStrategy | null>(null);
  const [orders, setOrders] = useState<TypePredictionOrder[]>([]);
  const [wallets, setWallets] = useState<TypeWallet[]>([]);
  const [walletId, setWalletId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(false);
  const [tab, setTab] = useState("params");

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
          <span className="text-text-tertiary">/</span>
          <span>{s.name}</span>
        </>
      )}
    </span>
  );

  if (error && !s) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="预测策略详情" />
        <Callout variant="danger" title="加载失败">
          {error}
        </Callout>
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

  const requestToggle = (enable: boolean) => {
    setError(null);
    if (enable && !walletId) {
      setError("请先选择钱包");
      return;
    }
    setPendingEnable(enable);
    setConfirmOpen(true);
  };

  const performToggle = async () => {
    setBusy(true);
    try {
      const updated = await togglePredictionLive(id, {
        enabled: pendingEnable,
        walletId,
        mode: "mainnet",
      });
      setS(updated);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const linkedWallet = wallets.find((w) => w.id === s.live.walletId);

  // ---- Tab: 参数 ----
  const paramsContent = (
    <Section title="基本参数">
      <ul className="text-sm space-y-2">
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary w-16">名称</span>
          <span>{s.name}</span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary w-16">市场</span>
          <Link
            href={`/prediction/markets/${encodeURIComponent(s.marketId)}`}
            className="text-brand-primary hover:underline font-mono break-all"
          >
            {s.marketId}
          </Link>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary w-16">结果</span>
          <StatusBadge
            tone={s.outcome === "YES" ? "success" : "danger"}
            variant="flat"
            size="sm"
          >
            {s.outcome}
          </StatusBadge>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary w-16">钱包</span>
          {s.live.walletId ? (
            <Link
              href={`/wallets/${s.live.walletId}`}
              className="text-brand-primary hover:underline"
            >
              {linkedWallet
                ? `${linkedWallet.label} (${linkedWallet.address.slice(0, 8)}…)`
                : s.live.walletId}
            </Link>
          ) : (
            <span className="text-text-tertiary">未关联钱包</span>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary w-16">版本</span>
          <span className="font-mono tnum">v{s.currentVersion}</span>
        </li>
      </ul>
    </Section>
  );

  // ---- Tab: 风控 ----
  const riskContent = (
    <Section title="风控上限">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Stat
            label="maxNotionalUsd"
            value={
              <span className="font-mono tnum">
                ${s.risk.maxNotionalUsd.toLocaleString()}
              </span>
            }
          />
          <RiskMeter
            value={s.risk.maxNotionalUsd}
            max={HINT_MAX_NOTIONAL}
            readout={`$${s.risk.maxNotionalUsd} / 建议 $${HINT_MAX_NOTIONAL}`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Stat
            label="maxOpenMarkets"
            value={
              <span className="font-mono tnum">{s.risk.maxOpenMarkets}</span>
            }
          />
          <RiskMeter
            value={s.risk.maxOpenMarkets}
            max={HINT_MAX_MARKETS}
            readout={`${s.risk.maxOpenMarkets} / 建议 ${HINT_MAX_MARKETS}`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Stat
            label="maxSlippageBps"
            value={
              <span className="font-mono tnum">{s.risk.maxSlippageBps}</span>
            }
            hint="相对 mid 的最大可接受滑点（bps）"
          />
          <RiskMeter
            value={s.risk.maxSlippageBps}
            max={HINT_MAX_SLIPPAGE_BPS}
            readout={`${s.risk.maxSlippageBps} bps / 建议 ${HINT_MAX_SLIPPAGE_BPS} bps`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Stat
            label="dailyLossCapUsd"
            value={
              <span className="font-mono tnum">
                ${s.risk.dailyLossCapUsd.toLocaleString()}
              </span>
            }
          />
          <RiskMeter
            value={s.risk.dailyLossCapUsd}
            max={HINT_DAILY_LOSS}
            readout={`$${s.risk.dailyLossCapUsd} / 建议 $${HINT_DAILY_LOSS}`}
          />
        </div>
      </div>
    </Section>
  );

  // ---- Tab: 订单 ----
  const ordersContent = (
    <Section title="最近订单">
      {orders.length === 0 ? (
        <div className="text-sm text-text-tertiary">暂无订单。</div>
      ) : (
        <DataTable<TypePredictionOrder>
          ariaLabel="预测订单列表"
          mobileLayout="card"
          rows={orders}
          getRowKey={(o) => o.clientOrderId}
          columns={[
            {
              key: "submittedAt",
              label: "提交时间",
              render: (o) => (
                <span className="font-mono text-mono-sm tnum">
                  {new Date(o.submittedAt).toLocaleString()}
                </span>
              ),
            },
            {
              key: "side",
              label: "方向",
              render: (o) => (
                <StatusBadge
                  tone={o.side === "BUY" ? "success" : "danger"}
                  variant="dot"
                  size="sm"
                >
                  {o.side}
                </StatusBadge>
              ),
            },
            {
              key: "price",
              label: "价格",
              align: "end",
              render: (o) => (
                <span className="font-mono tnum">{o.price.toFixed(4)}</span>
              ),
            },
            {
              key: "size",
              label: "数量",
              align: "end",
              render: (o) => (
                <span className="font-mono tnum">{o.size.toFixed(2)}</span>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (o) => (
                <StatusBadge
                  tone={orderStatusTone(o.status)}
                  variant="flat"
                  size="sm"
                >
                  {o.status}
                </StatusBadge>
              ),
            },
          ]}
        />
      )}
    </Section>
  );

  // ---- Tab: 实时 ----
  // Polymarket prediction WS topic isn't yet wired into the client WS hub;
  // we surface the latest order events the polling fetch returned and tell
  // the user the live channel will arrive when the gateway exposes the
  // prediction_strategy topic in the browser WS hub.
  const liveContent = (
    <Section title="实时事件">
      <Callout variant="info">
        预测策略实时事件通道（WebSocket topic{" "}
        <code>prediction_strategy</code>）尚未在浏览器端订阅；当前面板基于
        gateway HTTP 拉取的最近事件，刷新页面会重新拉取。订单页签是更细
        粒度的视图。
      </Callout>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="最近订单"
          value={<span className="font-mono tnum">{orders.length}</span>}
        />
        <Stat
          label="最新事件时间"
          value={
            orders[0] ? (
              <span className="font-mono text-mono-sm tnum">
                {new Date(orders[0].lastEventAt).toLocaleTimeString()}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Stat
          label="实盘状态"
          value={
            <StatusBadge
              tone={s.live.enabled ? "success" : "default"}
              variant="flat"
              size="sm"
            >
              {s.live.enabled ? `实盘 · ${s.live.mode ?? "mainnet"}` : "未启用"}
            </StatusBadge>
          }
        />
      </div>
    </Section>
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        breadcrumb={breadcrumb}
        title={s.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>市场：</span>
            <Link
              href={`/prediction/markets/${encodeURIComponent(s.marketId)}`}
              className="text-brand-primary hover:underline font-mono"
            >
              {s.marketId}
            </Link>
            <StatusBadge
              tone={s.outcome === "YES" ? "success" : "danger"}
              variant="flat"
              size="sm"
            >
              {s.outcome}
            </StatusBadge>
            <span className="font-mono tnum text-xs text-text-tertiary">
              v{s.currentVersion}
            </span>
          </span>
        }
        action={
          <StatusBadge
            tone={s.live.enabled ? "success" : "default"}
            variant={s.live.enabled ? "solid" : "flat"}
            size="md"
          >
            {s.live.enabled ? `实盘 · ${s.live.mode ?? "mainnet"}` : "未启用"}
          </StatusBadge>
        }
      />

      <Section title="实盘模式">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <FormField
              label="关联钱包"
              htmlFor="strat-wallet"
              className="min-w-[240px]"
            >
              <Select
                id="strat-wallet"
                aria-label="选择钱包"
                placeholder="— 选择钱包 —"
                selectedKeys={walletId ? [walletId] : []}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys)[0];
                  setWalletId(typeof k === "string" ? k : "");
                }}
              >
                {wallets.map((w) => (
                  <SelectItem key={w.id}>
                    {`${w.label} (${w.address.slice(0, 8)}…)`}
                  </SelectItem>
                ))}
              </Select>
            </FormField>
            {walletId && (
              <Link
                href={`/wallets/${walletId}`}
                className="text-xs text-brand-primary hover:underline"
              >
                查看钱包 →
              </Link>
            )}
            <Button
              color={s.live.enabled ? "danger" : "success"}
              isDisabled={busy}
              onPress={() => requestToggle(!s.live.enabled)}
            >
              {s.live.enabled ? "禁用实盘" : "启用实盘"}
            </Button>
          </div>
          {s.live.enabled && (
            <Callout variant="warning" title="MAINNET 主网">
              Polymarket 没有测试网。需要三道闸：env{" "}
              <code>POLYMARKET_TRADING_ENABLED=true</code> + admin token
              已确认（1 小时窗口）+ 此策略 <code>mode=mainnet</code>。
            </Callout>
          )}
          {error && (
            <div className="text-xs text-accent-down" role="alert">
              {error}
            </div>
          )}
        </div>
      </Section>

      <Tabs
        ariaLabel="strategy detail tabs"
        selectedKey={tab}
        onSelectionChange={setTab}
        items={[
          { key: "params", label: "参数", content: paramsContent },
          { key: "risk", label: "风控", content: riskContent },
          { key: "orders", label: "订单", content: ordersContent },
          { key: "live", label: "实时", content: liveContent },
        ]}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingEnable ? "启用实盘交易？" : "禁用实盘交易？"}
        confirmColor={pendingEnable ? "danger" : "warning"}
        confirmLabel={pendingEnable ? "启用" : "禁用"}
        message={
          pendingEnable ? (
            <div className="space-y-2">
              <div>
                将以钱包{" "}
                <strong>
                  {wallets.find((w) => w.id === walletId)?.label ?? walletId}
                </strong>{" "}
                启用 <strong>主网</strong> 模式。Polymarket 没有测试网 — 这是
                真实资金交易。
              </div>
              <div className="text-xs text-text-tertiary">
                gateway 仍会校验：env <code>POLYMARKET_TRADING_ENABLED</code>{" "}
                + admin token 窗口 + 策略 mode。
              </div>
            </div>
          ) : (
            <div>
              将禁用实盘交易；策略保留，订单引擎不再为此策略下单。
            </div>
          )
        }
        onConfirm={performToggle}
      />
    </div>
  );
}
