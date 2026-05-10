// Phase 8 macro explorer. Server-component renders a simple table of
// the most recent 200 observations; charting is left to a follow-up
// because the macro series cadence (monthly) doesn't fit lightweight-charts'
// candlestick API cleanly.

import { getMacroIndicators } from "@/data/api-client";
import type { TypeMacroPoint } from "@/data/type";

export const dynamic = "force-dynamic";

const DEFAULT_SOURCE = "fred";
const DEFAULT_CODE = "CPIAUCSL";

export default async function MacroPage() {
  let points: TypeMacroPoint[] = [];
  let error: string | null = null;
  try {
    points = await getMacroIndicators(DEFAULT_SOURCE, DEFAULT_CODE);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load macro";
  }
  // Display newest first.
  const rows = [...points].reverse().slice(0, 200);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">
          Macro — {DEFAULT_SOURCE}:{DEFAULT_CODE}
        </h1>
        <p className="text-sm text-default-500">
          Showing the most recent {rows.length} observations.
        </p>
      </header>
      {error && (
        <div className="text-sm text-warning border border-warning rounded p-2">
          {error}
        </div>
      )}
      <table className="text-sm border border-default-200">
        <thead className="bg-default-100">
          <tr>
            <th className="text-left px-3 py-2">ts</th>
            <th className="text-right px-3 py-2">value</th>
            <th className="text-left px-3 py-2">unit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.ts} className="border-t border-default-200">
              <td className="px-3 py-1 font-mono">{p.ts}</td>
              <td className="px-3 py-1 text-right font-mono">{p.value}</td>
              <td className="px-3 py-1">{p.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
