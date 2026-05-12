"use client";

// Node 3.E.3 — /settings/deployment client panel.
//
// Fully read-only. Top: build version + buildAt as Stat cards. Then
// four dep latency cards, KEK / CORS / auth posture, and AI budget
// caps. Warns inline (Callout danger) when ALLOW_S2S_HEADER=true since
// that flag relaxes the gateway's auth model and should be off in
// production.

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import type { TypeDepStatus } from "@/data/type";
import { useSystemInfo } from "@/data/use-system-info";

const DEP_LABELS: Record<string, string> = {
  mongo: "MongoDB",
  redis: "Redis",
  timescale: "TimescaleDB",
  quant: "Quant gRPC",
};
const DEP_ORDER = ["mongo", "redis", "timescale", "quant"];

function depTone(status?: string): "success" | "danger" | "default" {
  if (status === "ok") return "success";
  if (status === "error") return "danger";
  return "default";
}

function depText(dep?: TypeDepStatus): string {
  if (!dep) return "—";
  if (dep.status === "ok") return `OK · ${dep.latencyMs ?? "?"} ms`;
  if (dep.status === "error") return `Error: ${dep.err ?? "?"}`;
  if (dep.status === "disabled") return "未配置";
  return dep.status;
}

function formatBuildAt(s: string): string {
  if (!s || s === "unknown") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export function DeploymentSettingsClient() {
  const { data: info, err } = useSystemInfo();

  const env = info?.envFlags ?? {};
  const allowS2S = env.ALLOW_S2S_HEADER === true;
  const requireUserId = env.REQUIRE_USER_ID === true;
  const cookieSecure = env.AUTH_COOKIE_SECURE === true;
  const kekProvider =
    typeof env.KEK_PROVIDER === "string" ? env.KEK_PROVIDER : "—";
  const allowedOrigins = Array.isArray(env.ALLOWED_ORIGINS)
    ? (env.ALLOWED_ORIGINS as string[])
    : [];
  const aiPerStudy =
    typeof env.AI_MAX_USD_PER_STUDY === "number"
      ? (env.AI_MAX_USD_PER_STUDY as number)
      : null;
  const aiPerDay =
    typeof env.AI_MAX_USD_PER_DAY === "number"
      ? (env.AI_MAX_USD_PER_DAY as number)
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="部署"
        subtitle="版本 / 依赖 / KEK / CORS / 审计 / AI 预算 — 全部 readonly，配置请改 env 后重启。"
      />

      {err && <ApiErrorView error={err} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label="版本"
          value={
            <span className="break-all">{info?.version ?? "—"}</span>
          }
          hint="gateway -ldflags 注入"
        />
        <Stat
          label="构建时间"
          value={formatBuildAt(info?.buildAt ?? "")}
          hint="gateway 进程启动时记录"
        />
      </div>

      <Section title="依赖服务">
        <ul className="divide-y divide-border-default">
          {DEP_ORDER.map((name) => {
            const dep = info?.deps?.[name];
            return (
              <li
                key={name}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <StatusBadge tone={depTone(dep?.status)} variant="dot" size="sm">
                  <span className="text-text-primary">
                    {DEP_LABELS[name] ?? name}
                  </span>
                </StatusBadge>
                <span className="text-xs text-text-secondary font-mono tnum">
                  {depText(dep)}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="环境变量">
        {allowS2S && (
          <Callout variant="danger" title="ALLOW_S2S_HEADER 处于开启状态">
            该 flag 允许内部服务通过自定义 header 直接装扮成用户绕过
            JWT；仅 dev / staging 应启用，<strong>生产必须关闭</strong>。
            排查路径：gateway 环境变量 / k8s ConfigMap。
          </Callout>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-secondary">KEK_PROVIDER</dt>
          <dd className="text-right font-mono">{kekProvider}</dd>

          <dt className="text-text-secondary">REQUIRE_USER_ID</dt>
          <dd className="text-right">
            {requireUserId ? (
              <StatusBadge tone="success" variant="flat" size="sm">
                true
              </StatusBadge>
            ) : (
              <StatusBadge tone="default" variant="flat" size="sm">
                false
              </StatusBadge>
            )}
          </dd>

          <dt className="text-text-secondary">AUTH_COOKIE_SECURE</dt>
          <dd className="text-right">
            {cookieSecure ? (
              <StatusBadge tone="success" variant="flat" size="sm">
                true
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning" variant="flat" size="sm">
                false
              </StatusBadge>
            )}
          </dd>

          <dt className="text-text-secondary">ALLOW_S2S_HEADER</dt>
          <dd className="text-right">
            {allowS2S ? (
              <StatusBadge tone="danger" variant="flat" size="sm">
                true
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" variant="flat" size="sm">
                false
              </StatusBadge>
            )}
          </dd>

          <dt className="text-text-secondary">ALLOWED_ORIGINS</dt>
          <dd className="text-right">
            {allowedOrigins.length === 0 ? (
              <span className="text-text-tertiary">—</span>
            ) : (
              <ul className="flex flex-col items-end gap-0.5">
                {allowedOrigins.map((o) => (
                  <li key={o} className="font-mono text-xs break-all">
                    {o}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </Section>

      <Section title="AI 预算">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-secondary">每 study 上限</dt>
          <dd className="text-right font-mono tnum">
            {aiPerStudy != null ? `$${aiPerStudy.toFixed(2)}` : "—"}
          </dd>
          <dt className="text-text-secondary">每日上限</dt>
          <dd className="text-right font-mono tnum">
            {aiPerDay != null ? `$${aiPerDay.toFixed(2)}` : "—"}
          </dd>
        </dl>
        <Callout variant="info" title="当日预算使用率">
          当日累计花费由 quant 端 cost ledger 记录；前端聚合需要扩展
          system-info（或调用 /admin/ai/config）。当前不展示进度条，
          避免误读为「未用」。
        </Callout>
      </Section>
    </div>
  );
}
