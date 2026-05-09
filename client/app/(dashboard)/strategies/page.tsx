// Phase 4 strategies list. Uses the same underlying /option resource as
// the Phase 0 api-list page but adds a Live badge column. The list is
// rendered as an async server component (mirrors api-list/page.tsx) so
// the initial paint happens against the gateway with no client-side
// fetch.

import Link from "next/link";
import { FC } from "react";
import { getStrategies } from "@/data/api-client";
import { TypeOption } from "@/data/type";

export const dynamic = "force-dynamic";

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Strategies</h1>
        <Link
          href="/option"
          className="rounded bg-primary px-3 py-1.5 text-sm text-white"
        >
          New Strategy
        </Link>
      </div>
      {error && (
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          Failed to load strategies: {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-default-500">
          <tr>
            <th className="py-2">Name</th>
            <th>Symbol</th>
            <th>Live</th>
            <th>Mode</th>
            <th>Risk</th>
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
                <span
                  className={`rounded px-2 py-0.5 text-xs ${s.live?.enabled ? "bg-success-100 text-success-700" : "bg-default-100 text-default-700"}`}
                >
                  {s.live?.enabled ? "ENABLED" : "off"}
                </span>
              </td>
              <td>
                {s.live?.mode === "mainnet" ? (
                  <span className="text-warning-600">mainnet</span>
                ) : (
                  <span className="text-default-500">testnet</span>
                )}
              </td>
              <td className="text-xs text-default-500">
                {s.risk
                  ? `pos $${s.risk.maxPositionUsd} · lev ${s.risk.maxLeverage}× · daily $${s.risk.dailyLossCapUsd}`
                  : "— (orders will be rejected)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PageStrategies;
