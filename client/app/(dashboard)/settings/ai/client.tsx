"use client";

// Node 3.E.1 — migrated from /admin/ai/page.tsx.
//
// Admin sub-page for the AI optimization stack: model family + names,
// base URLs, per-study / per-day budgets, and the OHLCV lookback
// window. All editable via the gateway endpoint
// PUT /api/v1/admin/ai/config, which persists to Mongo and applies on
// the next optimize tick (no quant restart needed).
//
// The system prompts (loaded by the quant worker at boot) are shown
// read-only. They are intentionally NOT runtime-editable — prompts
// shape the LLM's behaviour and inline editing is a prompt-injection
// surface. To change them, edit quant/src/quant/ai/prompts.py and
// redeploy.
//
// API keys (ANTHROPIC_API_KEY / OPENAI_API_KEY) are intentionally
// excluded from this UI for the same reason as the KEK master key:
// rotating them via a web form is more risk than benefit.

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import {
  ApiError,
  TypeAIConfig,
  TypeAIPrompts,
  getAdminAIConfig,
  getAdminAIPrompts,
} from "@/data/api-client";
import { useAdminKey } from "@/data/use-admin-key";

import { AIConfigEditButton } from "./edit-modal";

const FAMILY_LABELS: Record<TypeAIConfig["modelFamily"], string> = {
  claude: "claude",
  openai: "openai",
};

const SOURCE_LABELS: Record<TypeAIConfig["source"], string> = {
  mongo: "mongo",
  env: "env",
  mixed: "mixed",
};

function ConfiguredBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-success-700">
      <span className="inline-block h-2 w-2 rounded-full bg-success" />
      已配置
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-default-500">
      <span className="inline-block h-2 w-2 rounded-full border border-default-300" />
      未配置
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-default-500">{label}</dt>
      <dd className="font-mono text-right break-all">{children}</dd>
    </>
  );
}

export function AIConfigClient() {
  const adminKey = useAdminKey();
  const [config, setConfig] = useState<TypeAIConfig | null>(null);
  const [prompts, setPrompts] = useState<TypeAIPrompts | null>(null);
  const [configError, setConfigError] = useState<unknown>(null);
  const [promptsError, setPromptsError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!adminKey) {
      setConfig(null);
      setPrompts(null);
      setConfigError(null);
      setPromptsError(null);
      return;
    }
    setLoading(true);
    setConfigError(null);
    setPromptsError(null);
    const [cfgRes, prRes] = await Promise.allSettled([
      getAdminAIConfig(adminKey),
      getAdminAIPrompts(adminKey),
    ]);
    if (cfgRes.status === "fulfilled") {
      setConfig(cfgRes.value);
    } else {
      setConfigError(cfgRes.reason);
      setConfig(null);
    }
    if (prRes.status === "fulfilled") {
      setPrompts(prRes.value);
    } else {
      setPromptsError(prRes.reason);
      setPrompts(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const configAuthFailed =
    configError instanceof ApiError &&
    (configError.status === 401 || configError.status === 403);
  const keyMissing = !adminKey;

  if (keyMissing || configAuthFailed) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          title="AI 配置"
          breadcrumb={
            <Link href="/settings/system" className="hover:underline">
              ← 系统设置
            </Link>
          }
          subtitle="模型、预算、查找窗口、prompts 等 AI 相关配置。API 密钥不在 UI 中暴露，仍通过环境变量配置。"
        />
        <EmptyState
          title={keyMissing ? "请先设置管理员密钥" : "无权访问"}
          description={
            keyMissing
              ? "本页面需要管理员密钥；在 /settings/system 设置一次后，本浏览器即可访问所有 admin 端点。"
              : "管理员密钥缺失或不正确。"
          }
          action={
            <Link
              href="/settings/system"
              className="rounded bg-primary px-4 py-1.5 text-white hover:opacity-90"
            >
              前往设置 →
            </Link>
          }
        />
      </div>
    );
  }

  const promptsUnavailable =
    promptsError instanceof ApiError && promptsError.status === 503;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="AI 配置"
        breadcrumb={
          <Link href="/settings/system" className="hover:underline">
            ← 系统设置
          </Link>
        }
        subtitle="模型、预算、查找窗口、prompts 等 AI 相关配置。API 密钥不在 UI 中暴露，仍通过环境变量配置。"
      />

      {configError != null && !configAuthFailed ? (
        <ApiErrorView error={configError} />
      ) : null}

      {config && (
        <Section
          title={
            <span>
              当前配置{" "}
              <span className="text-xs font-normal text-default-500">
                来源: {SOURCE_LABELS[config.source]}
              </span>
            </span>
          }
          action={
            <AIConfigEditButton
              adminKey={adminKey}
              config={config}
              onSaved={(next) => setConfig(next)}
            />
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="模型族">{FAMILY_LABELS[config.modelFamily]}</Row>
            <Row label="主模型">
              {config.modelFamily === "claude"
                ? config.anthropicPrimaryModel
                : config.openaiPrimaryModel}
            </Row>
            <Row label="refine 模型">
              {config.modelFamily === "claude"
                ? config.anthropicRefineModel
                : config.openaiRefineModel}
            </Row>
            <Row label="Anthropic">
              <ConfiguredBadge ok={config.anthropicConfigured} />
            </Row>
            <Row label="OpenAI">
              <ConfiguredBadge ok={config.openaiConfigured} />
            </Row>
            <Row label="Anthropic base URL">
              {config.anthropicBaseURL || (
                <span className="text-default-400">(默认)</span>
              )}
            </Row>
            <Row label="OpenAI base URL">
              {config.openaiBaseURL || (
                <span className="text-default-400">(默认)</span>
              )}
            </Row>
            <Row label="每 study 预算">${config.budgetUsdPerStudy.toFixed(2)}</Row>
            <Row label="每日预算">${config.budgetUsdPerDay.toFixed(2)}</Row>
            <Row label="查找窗口">{config.lookbackDays} 天</Row>
            <Row label="上次更新">
              {config.updatedAt
                ? new Date(config.updatedAt).toLocaleString()
                : "—"}{" "}
              <span className="text-xs text-default-500">
                (来源: {SOURCE_LABELS[config.source]})
              </span>
            </Row>
          </dl>
        </Section>
      )}

      {loading && !config && (
        <div className="text-sm text-default-500">加载中…</div>
      )}

      <Section title="System Prompts (只读)">
        {promptsUnavailable && (
          <Callout variant="warning" title="无法连接 quant worker">
            请确认 quant 已启动 (gRPC :50051)；系统 prompts 通过 quant 的
            <code className="mx-1">GetAIConfig</code> RPC 返回，gateway
            是只读代理。
          </Callout>
        )}
        {promptsError != null && !promptsUnavailable ? (
          <ApiErrorView error={promptsError} />
        ) : null}
        {prompts && (
          <div className="space-y-3">
            <p className="text-xs text-default-500">
              版本{" "}
              <span className="font-mono">{prompts.version}</span> · 哈希{" "}
              <span className="font-mono">
                {prompts.promptsHash.slice(0, 12)}…
              </span>
            </p>
            <Callout variant="info">
              Prompts 写死于源码 (防 prompt injection)；如需修改请编辑{" "}
              <code className="mx-1">quant/src/quant/ai/prompts.py</code>{" "}
              并重启 quant worker。
            </Callout>
            <div className="space-y-2">
              <PromptRow
                title="define_search_space"
                model={prompts.primaryModelActive}
                family={prompts.modelFamilyActive}
                body={prompts.defineSearchSpace}
              />
              <PromptRow
                title="refine_search_space"
                model={prompts.refineModelActive}
                family={prompts.modelFamilyActive}
                body={prompts.refineSearchSpace}
              />
              <PromptRow
                title="final_rationale"
                model={prompts.primaryModelActive}
                family={prompts.modelFamilyActive}
                body={prompts.finalRationale}
              />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function PromptRow({
  title,
  model,
  family,
  body,
}: {
  title: string;
  model: string;
  family: string;
  body: string;
}) {
  return (
    <details className="rounded border border-default-200">
      <summary className="cursor-pointer px-3 py-2 text-sm hover:bg-default-50">
        <span className="font-mono">{title}</span>
        <span className="ml-2 text-xs text-default-500">
          ({family} · {model})
        </span>
      </summary>
      <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-default-200 bg-default-50/50 p-3 font-mono text-xs">
        {body}
      </pre>
    </details>
  );
}
