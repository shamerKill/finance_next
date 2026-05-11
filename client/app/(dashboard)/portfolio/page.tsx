// Phase 5: cross-exchange portfolio summary.
//
// Server component. Calls /api/v1/portfolio/summary at request time and
// renders three tables: total / per-exchange / top-10 assets. The USD
// price provider on the gateway is best-effort (Timescale latest close
// of `<asset>USDT` on binance) — anything missing surfaces in `notes`.

import { PageHeader } from "@/components/page-header";
import { getPortfolioSummary } from "@/data/api-client";
import type { TypePortfolioSummary } from "@/data/type";

export const dynamic = "force-dynamic";

export const metadata = { title: "投资组合" };

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
      <PageHeader
        title="投资组合"
        subtitle={
          <>
            跨交易所资产快照。USD 估值取自 Timescale 中{" "}
            <code>&lt;asset&gt;USDT</code> 的最新收盘价；缺失行情按 0 计入总值。
          </>
        }
      />

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {summary && (
        <>
          <section>
            <h2 className="text-xl font-medium mb-2">总计</h2>
            <div className="text-3xl font-semibold">
              {formatUsd(summary.totalUsd)}
            </div>
            <div className="text-xs text-default-500 mt-1">
              生成时间 {summary.generatedAt}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-medium mb-3">按交易所</h2>
            <table className="w-full text-sm">
              <thead className="text-default-500">
                <tr>
                  <th className="text-left p-2">交易所</th>
                  <th className="text-right p-2">账户数</th>
                  <th className="text-right p-2">总计 USD</th>
                </tr>
              </thead>
              <tbody>
                {summary.perExchange.length === 0 ? (
                  <tr>
                    <td className="p-2 text-default-500" colSpan={3}>
                      尚未配置任何账户。
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
            <h2 className="text-xl font-medium mb-3">主要资产</h2>
            <table className="w-full text-sm">
              <thead className="text-default-500">
                <tr>
                  <th className="text-left p-2">资产</th>
                  <th className="text-right p-2">数量</th>
                  <th className="text-right p-2">USD 价值</th>
                </tr>
              </thead>
              <tbody>
                {summary.perAsset.length === 0 ? (
                  <tr>
                    <td className="p-2 text-default-500" colSpan={3}>
                      暂无余额。
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
              <h3 className="font-medium text-default-600 mb-1">备注</h3>
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
