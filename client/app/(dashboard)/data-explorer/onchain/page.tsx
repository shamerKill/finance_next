// Phase 8 on-chain explorer. Defaults to BTC hash rate; same plain
// table layout as the macro page.

import { ApiErrorView } from "@/components/api-error";
import { IngestButton } from "@/components/ingest-button";
import { getOnchainMetrics } from "@/data/api-client";
import type { TypeOnchainPoint } from "@/data/type";

export const dynamic = "force-dynamic";

const DEFAULT_CHAIN = "btc";
const DEFAULT_METRIC = "hash_rate";

export default async function OnchainPage() {
  let points: TypeOnchainPoint[] = [];
  let error: unknown = null;
  try {
    points = await getOnchainMetrics(DEFAULT_CHAIN, DEFAULT_METRIC);
  } catch (e) {
    error = e;
  }
  const rows = [...points].reverse().slice(0, 200);
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            链上 — {DEFAULT_CHAIN}:{DEFAULT_METRIC}
          </h1>
          <p className="text-sm text-default-500">
            显示最近 {rows.length} 条观测数据。
          </p>
        </div>
        <IngestButton
          path="v1/admin/ingest/onchain"
          body={{ chain: DEFAULT_CHAIN, metric: DEFAULT_METRIC }}
        />
      </header>
      <ApiErrorView error={error} />
      <table className="text-sm border border-default-200">
        <thead className="bg-default-100">
          <tr>
            <th className="text-left px-3 py-2">时间</th>
            <th className="text-right px-3 py-2">数值</th>
            <th className="text-left px-3 py-2">来源</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.ts} className="border-t border-default-200">
              <td className="px-3 py-1 font-mono">{p.ts}</td>
              <td className="px-3 py-1 text-right font-mono">{p.value}</td>
              <td className="px-3 py-1">{p.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
