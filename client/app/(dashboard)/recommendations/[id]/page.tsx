// Recommendation detail (Phase 6 → Phase D polish).
//
// Server component fetches:
//   - the recommendation itself
//   - the parent strategy (for the diff table + header "name (symbol)")
//   - the strategy's recent performance (for at-a-glance comparison)
// Diff numbers run through the centralised format helpers so floats like
// `0.025637836675816615` show as `0.02564`. The rationale is rendered
// via react-markdown so **bold** and bullet lists display correctly
// rather than leaking raw asterisks.

import Link from "next/link";

import {
  getRecommendation,
  getStrategy,
  getStrategyPerformance,
} from "@/data/api-client";
import {
  DEFAULT_RECOMMENDATION_PERIOD,
  deltaToneClass,
  fmtPct,
  fmtRawNum,
  fmtSharpe,
} from "@/data/format";
import type {
  TypeOption,
  TypeRecommendation,
  TypeStrategyPerformance,
} from "@/data/type";

import RecommendationActions from "./actions";
import { ParentStrategyPanel } from "./parent-strategy-panel";
import { Rationale } from "./rationale";

export const dynamic = "force-dynamic";

export const metadata = { title: "推荐详情" };

// Render any param value for the diff table. Numbers go through fmtRawNum
// for 4-sig-fig consistency; strings + nulls pass through; objects
// (createPositions[]) get pretty JSON. This is intentionally local —
// fmtRawNum lives in data/format.ts for cross-page reuse but the type
// dispatch is page-specific.
const fmtParam = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return fmtRawNum(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecommendationDetailPage({ params }: PageProps) {
  const { id } = await params;

  let rec: TypeRecommendation | null = null;
  let strategy: TypeOption | null = null;
  let performance: TypeStrategyPerformance | null = null;
  let error: string | null = null;

  try {
    rec = await getRecommendation(id);
  } catch (e) {
    error = e instanceof Error ? e.message : "失败";
  }

  // Strategy + performance are best-effort. A deleted strategy or a
  // missing /performance endpoint should not break the detail page.
  if (rec) {
    try {
      strategy = await getStrategy(rec.strategyId);
    } catch {
      strategy = null;
    }
    try {
      performance = await getStrategyPerformance(rec.strategyId);
    } catch {
      performance = null;
    }
  }

  if (error || !rec) {
    return (
      <div className="rounded-md bg-danger-50 p-4 text-sm text-danger-700">
        {error ?? "未找到推荐"}
        <div className="mt-2">
          <Link href="/recommendations" className="text-primary hover:underline">
            ← 返回推荐列表
          </Link>
        </div>
      </div>
    );
  }

  // Diff-table key set: every proposed key plus current-strategy keys
  // that overlap. We don't render strategy-only keys (api keys, live
  // config, etc.) — those aren't part of the recommendation.
  const currentParams: Record<string, unknown> = (strategy ?? {}) as unknown as Record<
    string,
    unknown
  >;
  const allKeys = Array.from(
    new Set([
      ...Object.keys(rec.proposedParams ?? {}),
      ...Object.keys(currentParams).filter((k) => k in (rec.proposedParams ?? {})),
    ]),
  ).sort();

  // Header title — prefer "name (symbol)" when the strategy is still
  // around, fall back to the rec's ObjectId. Either way the parent
  // strategy panel below shows the same info more prominently.
  const headerStrategyLabel = strategy
    ? `${strategy.name} (${strategy.execSymbol})`
    : "已删除策略";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/recommendations"
            className="text-xs text-default-500 hover:underline"
          >
            ← AI 推荐
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">推荐详情</h1>
          <p className="text-sm text-default-500">
            策略 <span className="font-medium">{headerStrategyLabel}</span> · Study{" "}
            <span className="font-mono">{rec.studyId}</span>
          </p>
        </div>
        <div className="text-right text-xs text-default-500">
          <div>创建于 {new Date(rec.createdAt).toLocaleString()}</div>
          <div>状态：{rec.status}</div>
          {rec.appliedVersion && <div>应用版本：{rec.appliedVersion}</div>}
        </div>
      </header>

      {/* Parent strategy snapshot — comparison anchor above the diff. */}
      <ParentStrategyPanel strategy={strategy} performance={performance} />

      {/* Expected delta. `period` is optional on legacy docs; we
          render the documented defaults (90/63/27 + annualized) when
          absent. The subtitle is the human-readable explanation of
          what the cell number actually measures. */}
      {(() => {
        const period = rec.period ?? DEFAULT_RECOMMENDATION_PERIOD;
        return (
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-md bg-default-50 p-3">
              <div className="text-xs text-default-500">
                Δ 夏普比率（样本外）
              </div>
              <div
                className={`text-lg font-semibold tabular-nums ${deltaToneClass(rec.expectedDelta?.sharpe)}`}
              >
                {fmtSharpe(rec.expectedDelta?.sharpe)}
              </div>
              <div className="mt-1 text-xs text-default-500">
                OOS 段{period.sharpeAnnualized ? "年化" : "未年化"} ·{" "}
                {period.oosDays} 天
              </div>
            </div>
            <div className="rounded-md bg-default-50 p-3">
              <div className="text-xs text-default-500">Δ 收益（样本外）</div>
              <div
                className={`text-lg font-semibold tabular-nums ${deltaToneClass(rec.expectedDelta?.return)}`}
              >
                {fmtPct(rec.expectedDelta?.return)}
              </div>
              <div className="mt-1 text-xs text-default-500">
                OOS {period.oosDays} 天累计 · 非年化
              </div>
            </div>
          </section>
        );
      })()}

      {/* Period explainer — defines exactly what the Δ numbers above
          measure (lookback window, IS/OOS split, annualization). */}
      {(() => {
        const period = rec.period ?? DEFAULT_RECOMMENDATION_PERIOD;
        return (
          <div className="rounded-md border border-default-200 bg-default-50/50 p-3 text-xs text-default-600">
            <span aria-hidden className="mr-1">ⓘ</span>
            优化基于最近 {period.lookbackDays} 天数据，前 70% (
            {period.inSampleDays} 天) 做 IS，后 30% ({period.oosDays} 天)
            做 OOS。Sharpe {period.sharpeAnnualized ? "已年化" : "未年化"}
            ；Return 为 OOS 段累计收益率。
          </div>
        );
      })()}

      {/* Param diff table. */}
      <section>
        <h2 className="text-lg font-semibold mb-2">建议的参数变更</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-default-200 text-left text-default-500">
            <tr>
              <th className="py-2 pr-4">参数</th>
              <th className="py-2 pr-4">当前值</th>
              <th className="py-2 pr-4">建议值</th>
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
                  <td className="py-2 pr-4 font-mono text-xs text-default-500 tabular-nums">
                    {fmtParam(current)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs tabular-nums">
                    {fmtParam(proposed)}
                  </td>
                  <td className="py-2 text-xs text-default-500">
                    {changed ? "已修改" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rationale rendered as light markdown — **bold** and bullets
          show correctly instead of leaking asterisks. */}
      <section>
        <h2 className="text-lg font-semibold mb-2">理由</h2>
        <Rationale text={rec.rationale} />
      </section>

      {/* Approve / reject / backtest. The backtest button is always
          available (operator may want to dry-run an already-applied or
          already-rejected proposal); approve/reject hide once status is
          no longer actionable. */}
      <section className="border-t border-default-200 pt-4">
        <RecommendationActions
          id={rec.id}
          strategyId={rec.strategyId}
          proposedParams={rec.proposedParams ?? {}}
          execSymbol={strategy?.execSymbol}
          actionable={rec.status === "pending_review"}
        />
        {rec.status === "pending_review" && (
          <p className="mt-2 text-xs text-default-500">
            批准后将更新策略文档，自增
            <code className="mx-1">currentVersion</code>，并替代
            该策略其他所有待审核的推荐。
          </p>
        )}
      </section>
    </div>
  );
}
