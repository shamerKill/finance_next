// Recommendation detail (Phase 6).
//
// Server component fetches the recommendation + the strategy it points
// at (so we can diff current vs proposed params side-by-side). Approve/
// reject actions live in the client subcomponent below; they call the
// gateway via the existing api-client helpers.

import Link from "next/link";

import { getRecommendation, getStrategy } from "@/data/api-client";
import type {
  TypeOption,
  TypeRecommendation,
} from "@/data/type";

import RecommendationActions from "./actions";

export const dynamic = "force-dynamic";

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toString();
  if (typeof v === "string") return v;
  return JSON.stringify(v);
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecommendationDetailPage({ params }: PageProps) {
  const { id } = await params;

  let rec: TypeRecommendation | null = null;
  let strategy: TypeOption | null = null;
  let error: string | null = null;

  try {
    rec = await getRecommendation(id);
    strategy = await getStrategy(rec.strategyId);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed";
  }

  if (error || !rec) {
    return (
      <div className="rounded-md bg-danger-50 p-4 text-sm text-danger-700">
        {error ?? "Recommendation not found"}
        <div className="mt-2">
          <Link href="/recommendations" className="text-primary hover:underline">
            ← Back to recommendations
          </Link>
        </div>
      </div>
    );
  }

  // Build the union of params keys so the diff table covers every
  // changed field, including ones added by the recommendation that
  // weren't in the current strategy doc.
  const currentParams: Record<string, unknown> = (strategy ?? {}) as unknown as Record<string, unknown>;
  const allKeys = Array.from(
    new Set([
      ...Object.keys(rec.proposedParams ?? {}),
      ...Object.keys(currentParams).filter((k) => k in (rec.proposedParams ?? {})),
    ]),
  ).sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/recommendations"
            className="text-xs text-default-500 hover:underline"
          >
            ← Recommendations
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Recommendation</h1>
          <p className="text-sm text-default-500">
            Strategy{" "}
            <span className="font-mono">{rec.strategyId}</span> · Study{" "}
            <span className="font-mono">{rec.studyId}</span>
          </p>
        </div>
        <div className="text-right text-xs text-default-500">
          <div>Created {new Date(rec.createdAt).toLocaleString()}</div>
          <div>Status: {rec.status}</div>
          {rec.appliedVersion && (
            <div>Applied version: {rec.appliedVersion}</div>
          )}
        </div>
      </header>

      {/* Expected delta + cost meter. */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-md bg-default-50 p-3">
          <div className="text-xs text-default-500">Δ Sharpe (OOS)</div>
          <div className="text-lg font-semibold">
            {(rec.expectedDelta?.sharpe ?? 0).toFixed(3)}
          </div>
        </div>
        <div className="rounded-md bg-default-50 p-3">
          <div className="text-xs text-default-500">Δ Return (OOS)</div>
          <div className="text-lg font-semibold">
            {((rec.expectedDelta?.return ?? 0) * 100).toFixed(2)}%
          </div>
        </div>
      </section>

      {/* Param diff table. */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Proposed parameter changes</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-default-200 text-left text-default-500">
            <tr>
              <th className="py-2 pr-4">Parameter</th>
              <th className="py-2 pr-4">Current</th>
              <th className="py-2 pr-4">Proposed</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map((k) => {
              const current = currentParams[k];
              const proposed = rec.proposedParams[k];
              const changed = JSON.stringify(current) !== JSON.stringify(proposed);
              return (
                <tr
                  key={k}
                  className={`border-b border-default-100 ${
                    changed ? "bg-warning-50/40" : ""
                  }`}
                >
                  <td className="py-2 pr-4 font-mono text-xs">{k}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-default-500">
                    {fmt(current)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{fmt(proposed)}</td>
                  <td className="py-2 text-xs text-default-500">
                    {changed ? "modified" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rationale. We deliberately render plain text + paragraph splits
          rather than reaching for react-markdown here — the prose is
          short enough that <pre> + line-breaks reads cleanly and we
          avoid an extra render-time dep on the server. */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Rationale</h2>
        <div className="rounded-md border border-default-200 bg-default-50 p-4 text-sm whitespace-pre-wrap">
          {rec.rationale || "(no rationale produced)"}
        </div>
      </section>

      {/* Approve / reject. Hidden once the recommendation is no longer
          actionable. */}
      {rec.status === "pending_review" && (
        <section className="border-t border-default-200 pt-4">
          <RecommendationActions id={rec.id} />
          <p className="mt-2 text-xs text-default-500">
            Approving will update the strategy document, bump
            <code className="mx-1">currentVersion</code>, and supersede
            any other pending recommendations for this strategy.
          </p>
        </section>
      )}
    </div>
  );
}
