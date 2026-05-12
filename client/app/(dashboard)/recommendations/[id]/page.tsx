// Recommendation detail (Phase 6 → 2.C.5.b polish).
//
// Server component fetches:
//   - the recommendation itself
//   - the parent strategy (for the diff table + header "name (symbol)")
//   - the strategy's recent performance (for at-a-glance comparison)
// Diff numbers run through the centralised format helpers so floats like
// `0.025637836675816615` show as `0.02564`. The rationale is rendered
// via react-markdown so **bold** and bullet lists display correctly
// rather than leaking raw asterisks.
//
// 2.C.5.b refactor — PageHeader / Section / Stat / Callout for diff
// container + approve/reject. Approve / reject now go through
// ConfirmDialog + toast (see actions.tsx).

import Link from "next/link";

import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { Section } from "@/components/section";
import { Stat, type StatDirection } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
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
  TypeRecommendationStatus,
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

const STATUS_TONE: Record<
  TypeRecommendationStatus,
  "warning" | "success" | "default"
> = {
  pending_review: "warning",
  approved: "success",
  rejected: "default",
  superseded: "default",
};

const STATUS_LABEL: Record<TypeRecommendationStatus, string> = {
  pending_review: "待审核",
  approved: "已批准",
  rejected: "已拒绝",
  superseded: "已替代",
};

function dir(n: number | undefined | null): StatDirection {
  if (n === undefined || n === null || !Number.isFinite(n) || n === 0)
    return "flat";
  return n > 0 ? "up" : "down";
}

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
      <div className="space-y-4">
        <PageHeader
          breadcrumb={
            <Link href="/recommendations" className="hover:underline">
              ← AI 推荐
            </Link>
          }
          title="推荐详情"
        />
        <Callout variant="danger" title="无法加载推荐">
          {error ?? "未找到推荐"}
        </Callout>
      </div>
    );
  }

  // Diff-table key set: every proposed key plus current-strategy keys
  // that overlap. We don't render strategy-only keys (api keys, live
  // config, etc.) — those aren't part of the recommendation.
  const currentParams: Record<string, unknown> = (strategy ??
    {}) as unknown as Record<string, unknown>;
  const allKeys = Array.from(
    new Set([
      ...Object.keys(rec.proposedParams ?? {}),
      ...Object.keys(currentParams).filter(
        (k) => k in (rec.proposedParams ?? {}),
      ),
    ]),
  ).sort();

  // Header title — prefer "name (symbol)" when the strategy is still
  // around, fall back to the rec's ObjectId. Either way the parent
  // strategy panel below shows the same info more prominently.
  const headerStrategyLabel = strategy
    ? `${strategy.name} (${strategy.execSymbol})`
    : "已删除策略";

  const period = rec.period ?? DEFAULT_RECOMMENDATION_PERIOD;
  const sharpe = rec.expectedDelta?.sharpe;
  const ret = rec.expectedDelta?.return;

  return (
    <div className="flex flex-col gap-6">
      <RecentTracker
        id={id}
        kind="recommendation"
        label={headerStrategyLabel}
        path={`/recommendations/${id}`}
      />

      <PageHeader
        breadcrumb={
          <Link
            href="/recommendations"
            className="hover:underline"
          >
            ← AI 推荐
          </Link>
        }
        title={
          <span className="flex items-center gap-3 flex-wrap">
            推荐详情
            <StatusBadge tone={STATUS_TONE[rec.status]}>
              {STATUS_LABEL[rec.status]}
            </StatusBadge>
          </span>
        }
        subtitle={
          <span>
            策略 <span className="font-medium">{headerStrategyLabel}</span> ·
            Study <span className="font-mono tnum">{rec.studyId}</span> ·
            创建于 {new Date(rec.createdAt).toLocaleString()}
            {rec.appliedVersion && (
              <> · 应用版本 v{rec.appliedVersion}</>
            )}
          </span>
        }
      />

      {/* Parent strategy snapshot — comparison anchor above the diff. */}
      <ParentStrategyPanel strategy={strategy} performance={performance} />

      {/* Expected delta KPIs. `period` is optional on legacy docs; we
          render the documented defaults (90/63/27 + annualized) when
          absent. */}
      <Section title="预期影响">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Stat
            label="Δ 夏普比率（样本外）"
            value={
              <span
                className={`tnum ${deltaToneClass(sharpe)}`}
              >
                {fmtSharpe(sharpe)}
              </span>
            }
            delta={{ value: fmtSharpe(sharpe), direction: dir(sharpe) }}
            hint={`OOS 段${period.sharpeAnnualized ? "年化" : "未年化"} · ${period.oosDays} 天`}
          />
          <Stat
            label="Δ 收益（样本外）"
            value={
              <span
                className={`tnum ${deltaToneClass(ret)}`}
              >
                {fmtPct(ret)}
              </span>
            }
            delta={{ value: fmtPct(ret), direction: dir(ret) }}
            hint={`OOS ${period.oosDays} 天累计 · 非年化`}
          />
        </div>
        <div className="mt-3 text-xs text-text-secondary">
          <span aria-hidden className="mr-1">ⓘ</span>
          优化基于最近 {period.lookbackDays} 天数据，前 70% (
          {period.inSampleDays} 天) 做 IS，后 30% ({period.oosDays} 天) 做
          OOS。Sharpe {period.sharpeAnnualized ? "已年化" : "未年化"}；Return
          为 OOS 段累计收益率。
        </div>
      </Section>

      {/* Param diff table. */}
      <Section title="建议的参数变更">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border-default text-left text-text-tertiary">
              <tr>
                <th className="py-2 pr-4 font-medium">参数</th>
                <th className="py-2 pr-4 font-medium">当前值</th>
                <th className="py-2 pr-4 font-medium">建议值</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {allKeys.map((k) => {
                const current = currentParams[k];
                const proposed = rec.proposedParams[k];
                const changed =
                  JSON.stringify(current) !== JSON.stringify(proposed);
                return (
                  <tr
                    key={k}
                    className={`border-b border-border-default/60 ${
                      changed ? "bg-accent-warning/10" : ""
                    }`}
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{k}</td>
                    <td className="py-2 pr-4 font-mono tnum text-xs text-text-secondary">
                      {fmtParam(current)}
                    </td>
                    <td className="py-2 pr-4 font-mono tnum text-xs">
                      {fmtParam(proposed)}
                    </td>
                    <td className="py-2 text-xs text-text-tertiary">
                      {changed ? "已修改" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Rationale rendered as light markdown — **bold** and bullets
          show correctly instead of leaking asterisks. */}
      <Section title="理由">
        <Rationale text={rec.rationale} />
      </Section>

      {/* Approve / reject / backtest. The backtest button is always
          available (operator may want to dry-run an already-applied or
          already-rejected proposal); approve/reject hide once status is
          no longer actionable. */}
      <Section title="操作">
        <RecommendationActions
          id={rec.id}
          strategyId={rec.strategyId}
          proposedParams={rec.proposedParams ?? {}}
          execSymbol={strategy?.execSymbol}
          actionable={rec.status === "pending_review"}
        />
        {rec.status === "pending_review" && (
          <p className="mt-3 text-xs text-text-tertiary">
            批准后将更新策略文档，自增 <code>currentVersion</code>{" "}
            ，并替代该策略其他所有待审核的推荐。
          </p>
        )}
      </Section>
    </div>
  );
}
