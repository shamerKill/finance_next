// Recommendations list (Phase 6). Server component — fetches from the
// gateway and renders a status-filtered table. The default filter is
// `pending_review` because that's the only actionable state — approved /
// rejected / superseded show up in the "All" filter for audit.

import Link from "next/link";

import { listRecommendations } from "@/data/api-client";
import type {
  TypeRecommendation,
  TypeRecommendationStatus,
} from "@/data/type";

export const dynamic = "force-dynamic";

type StatusBadge = { label: string; color: string };
const statusBadge = (s: TypeRecommendationStatus): StatusBadge => {
  switch (s) {
    case "pending_review":
      return { label: "pending review", color: "bg-warning-100 text-warning-700" };
    case "approved":
      return { label: "approved", color: "bg-success-100 text-success-700" };
    case "rejected":
      return { label: "rejected", color: "bg-default-100 text-default-700" };
    case "superseded":
      return { label: "superseded", color: "bg-default-100 text-default-500" };
  }
};

const fmtNumber = (n: number) =>
  Number.isFinite(n) ? n.toFixed(3) : "—";

interface PageProps {
  searchParams: Promise<{ status?: TypeRecommendationStatus }>;
}

export default async function RecommendationsListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status: TypeRecommendationStatus = params?.status ?? "pending_review";
  let recs: TypeRecommendation[] = [];
  let error: string | null = null;
  try {
    recs = await listRecommendations(status);
  } catch (e) {
    error = e instanceof Error ? e.message : "failed";
  }

  const filters: TypeRecommendationStatus[] = [
    "pending_review",
    "approved",
    "rejected",
    "superseded",
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Recommendations</h1>
        <p className="text-sm text-default-500">
          AI-generated strategy parameter recommendations. Every change
          requires explicit human approval — there is no auto-apply.
        </p>
      </header>

      <nav className="flex gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f}
            href={`/recommendations?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              status === f
                ? "border-primary text-primary"
                : "border-default-200 text-default-600"
            }`}
          >
            {f.replace("_", " ")}
          </Link>
        ))}
      </nav>

      {error && (
        <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
          Failed to load recommendations: {error}
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="border-b border-default-200 text-left text-default-500">
          <tr>
            <th className="py-2 pr-4">Strategy</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Δ Sharpe</th>
            <th className="py-2 pr-4">Δ Return</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {recs.length === 0 && !error && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-default-400">
                No recommendations with status &quot;{status}&quot;.
              </td>
            </tr>
          )}
          {recs.map((r) => {
            const badge = statusBadge(r.status);
            return (
              <tr key={r.id} className="border-b border-default-100">
                <td className="py-2 pr-4 font-mono text-xs">{r.strategyId}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  {fmtNumber(r.expectedDelta?.sharpe ?? 0)}
                </td>
                <td className="py-2 pr-4">
                  {fmtNumber(r.expectedDelta?.return ?? 0)}
                </td>
                <td className="py-2 pr-4 text-default-500">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="py-2">
                  <Link
                    href={`/recommendations/${r.id}`}
                    className="text-primary hover:underline"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
