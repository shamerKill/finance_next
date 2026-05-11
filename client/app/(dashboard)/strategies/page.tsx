// Phase 4 strategies list. Uses the same underlying /option resource as
// the Phase 0 api-list page but adds a Live badge column. The list is
// rendered as an async server component (mirrors api-list/page.tsx) so
// the initial paint happens against the gateway with no client-side
// fetch.

import Link from "next/link";
import { FC } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getStrategies } from "@/data/api-client";
import { TypeOption } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "策略" };

// Live badge — same color logic on desktop table cell and mobile card.
function LiveBadge({ s }: { s: TypeOption }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${s.live?.enabled ? "bg-success-100 text-success-700" : "bg-default-100 text-default-700"}`}
    >
      {s.live?.enabled ? "已启用" : "关闭"}
    </span>
  );
}

function ModeLabel({ s }: { s: TypeOption }) {
  return s.live?.mode === "mainnet" ? (
    <span className="text-warning-600">主网</span>
  ) : (
    <span className="text-default-500">测试网</span>
  );
}

function RiskCell({ s }: { s: TypeOption }) {
  return (
    <span className="text-xs text-default-500">
      {s.risk
        ? `仓位 $${s.risk.maxPositionUsd} · 杠杆 ${s.risk.maxLeverage}× · 日亏 $${s.risk.dailyLossCapUsd}`
        : "—（订单将被拒绝）"}
    </span>
  );
}

const PageStrategies: FC = async () => {
  let strategies: TypeOption[] = [];
  let error: string | null = null;
  try {
    strategies = await getStrategies();
  } catch (e: unknown) {
    error = (e as Error).message;
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="策略"
        action={
          <Link
            href="/option"
            className="rounded bg-primary px-3 py-1.5 text-sm text-white"
          >
            新建策略
          </Link>
        }
      />
      {error && (
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          加载策略失败：{error}
        </div>
      )}
      {strategies.length === 0 && !error && (
        <EmptyState
          title="暂无策略"
          description="点击右上角“新建策略”创建第一个策略配置。"
          action={
            <Link
              href="/option"
              className="rounded bg-primary px-3 py-1.5 text-sm text-white"
            >
              新建策略
            </Link>
          }
        />
      )}

      {/* Desktop: dense table. */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-default-500">
            <tr>
              <th className="py-2">名称</th>
              <th>交易对</th>
              <th>实盘</th>
              <th>模式</th>
              <th>风控</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => (
              <tr key={s.id ?? s.name} className="border-t border-default-200">
                <td className="py-2">
                  {s.id ? (
                    <Link className="text-primary" href={`/strategies/${s.id}`}>
                      {s.name}
                    </Link>
                  ) : (
                    s.name
                  )}
                </td>
                <td>{s.execSymbol}</td>
                <td>
                  <LiveBadge s={s} />
                </td>
                <td>
                  <ModeLabel s={s} />
                </td>
                <td>
                  <RiskCell s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list. Tap entire card → detail. */}
      <div className="md:hidden space-y-3">
        {strategies.map((s) =>
          s.id ? (
            <Link
              key={s.id ?? s.name}
              href={`/strategies/${s.id}`}
              className="block rounded border border-default-200 p-4 active:bg-default-50"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold">{s.name}</span>
                <LiveBadge s={s} />
              </div>
              <div className="text-xs text-default-500 flex gap-2">
                <span className="font-mono">{s.execSymbol}</span>
                <span>·</span>
                <ModeLabel s={s} />
              </div>
              <div className="mt-1">
                <RiskCell s={s} />
              </div>
            </Link>
          ) : (
            <div
              key={s.name}
              className="rounded border border-default-200 p-4"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold">{s.name}</span>
                <LiveBadge s={s} />
              </div>
              <div className="text-xs text-default-500">{s.execSymbol}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
};

export default PageStrategies;
