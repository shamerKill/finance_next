// Phase 5: cross-exchange portfolio summary.
//
// Server component. Calls /api/v1/portfolio/summary at request time and
// renders three tables: total / per-exchange / top-10 assets. The USD
// price provider on the gateway is best-effort (Timescale latest close
// of `<asset>USDT` on binance) — anything missing surfaces in `notes`.

import { getPortfolioSummary } from "@/data/api-client";
import type { TypePortfolioSummary } from "@/data/type";

export const dynamic = "force-dynamic";

function formatUsd(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function PortfolioPage() {
  let summary: TypePortfolioSummary | null = null;
  let error: string | null = null;
  try {
    summary = await getPortfolioSummary();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <p className="text-sm text-default-500 mt-1">
          Cross-exchange snapshot. USD values use the latest{" "}
          <code>&lt;asset&gt;USDT</code> close from Timescale; missing series
          contribute 0 to the total.
        </p>
      </header>

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {summary && (
        <>
          <section>
            <h2 className="text-xl font-medium mb-2">Total</h2>
            <div className="text-3xl font-semibold">
              {formatUsd(summary.totalUsd)}
            </div>
            <div className="text-xs text-default-500 mt-1">
              Generated at {summary.generatedAt}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-medium mb-3">By exchange</h2>
            <table className="w-full text-sm">
              <thead className="text-default-500">
                <tr>
                  <th className="text-left p-2">Exchange</th>
                  <th className="text-right p-2">Accounts</th>
                  <th className="text-right p-2">Total USD</th>
                </tr>
              </thead>
              <tbody>
                {summary.perExchange.length === 0 ? (
                  <tr>
                    <td className="p-2 text-default-500" colSpan={3}>
                      No accounts configured.
                    </td>
                  </tr>
                ) : (
                  summary.perExchange.map((row) => (
                    <tr key={row.exchange} className="border-t border-default-200">
                      <td className="p-2 capitalize">{row.exchange}</td>
                      <td className="p-2 text-right">{row.accountIds.length}</td>
                      <td className="p-2 text-right">
                        {formatUsd(row.totalUsd)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-xl font-medium mb-3">Top assets</h2>
            <table className="w-full text-sm">
              <thead className="text-default-500">
                <tr>
                  <th className="text-left p-2">Asset</th>
                  <th className="text-right p-2">Quantity</th>
                  <th className="text-right p-2">USD value</th>
                </tr>
              </thead>
              <tbody>
                {summary.perAsset.length === 0 ? (
                  <tr>
                    <td className="p-2 text-default-500" colSpan={3}>
                      No balances.
                    </td>
                  </tr>
                ) : (
                  summary.perAsset.map((a) => (
                    <tr key={a.asset} className="border-t border-default-200">
                      <td className="p-2 font-mono">{a.asset}</td>
                      <td className="p-2 text-right font-mono">
                        {a.qty.toLocaleString(undefined, {
                          maximumFractionDigits: 8,
                        })}
                      </td>
                      <td className="p-2 text-right">
                        {formatUsd(a.usdValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {summary.notes && summary.notes.length > 0 && (
            <section className="text-xs text-default-500">
              <h3 className="font-medium text-default-600 mb-1">Notes</h3>
              <ul className="list-disc ml-5 space-y-1">
                {summary.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
