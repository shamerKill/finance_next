"use client";

// Node 3.E.3 — /settings/observability client panel.
//
// Polls /api/v1/settings/system-info every 10s to render:
//   - /metrics endpoint hint (readonly)
//   - 4 dep dots (mongo / redis / timescale / quant) with latency
//   - OTLP endpoint configured/not
//   - link to /admin/audit
//   - cron last-success table (currently empty placeholder)
//
// All readonly — no mutations on this page.

import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import type { TypeDepStatus } from "@/data/type";
import { useSystemInfo } from "@/data/use-system-info";

const DEP_LABELS: Record<string, string> = {
  mongo: "MongoDB",
  redis: "Redis",
  timescale: "TimescaleDB",
  quant: "Quant worker (gRPC)",
};

const DEP_ORDER = ["mongo", "redis", "timescale", "quant"];

function depTone(status?: string): "success" | "danger" | "default" {
  if (status === "ok") return "success";
  if (status === "error") return "danger";
  return "default";
}

function depLabel(status?: string): string {
  if (status === "ok") return "OK";
  if (status === "error") return "Error";
  if (status === "disabled") return "未配置";
  return "未知";
}

function DepRow({ name, dep }: { name: string; dep?: TypeDepStatus }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <StatusBadge tone={depTone(dep?.status)} variant="dot" size="sm">
          <span className="text-text-primary">
            {DEP_LABELS[name] ?? name}
          </span>
        </StatusBadge>
      </div>
      <div className="text-xs text-text-secondary font-mono tnum flex items-center gap-2">
        {dep && dep.status === "ok" && dep.latencyMs !== undefined && (
          <span>{dep.latencyMs} ms</span>
        )}
        <span>{depLabel(dep?.status)}</span>
      </div>
    </li>
  );
}

export function ObservabilitySettingsClient() {
  // 10s poll keeps the dep dots fresh on this screen.
  const { data: info, err } = useSystemInfo({ poll: 10_000 });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="监控"
        subtitle="审计日志 / Prometheus 指标 / OTLP / 健康检查 / 后台任务状态。"
      />

      {err && <ApiErrorView error={err} />}

      <Section title="监控端点">
        <ul className="space-y-3">
          <li>
            <div className="text-sm font-medium text-text-primary">
              <span className="font-mono">/metrics</span>{" "}
              <span className="text-text-tertiary text-xs">
                — Prometheus scrape endpoint
              </span>
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              进程内计数器 + 直方图；建议反代仅对内网 / Prometheus IP
              开放。Grafana dashboards JSON 在
              <code className="mx-1">infra/grafana/dashboards/</code>。
            </div>
          </li>
          <li>
            <div className="text-sm font-medium text-text-primary">
              <span className="font-mono">/healthz</span>{" "}
              <span className="text-text-tertiary text-xs">
                — 依赖健康检查（每 10 秒自动刷新）
              </span>
            </div>
            <ul className="mt-2 divide-y divide-border-default rounded border border-border-default">
              {DEP_ORDER.map((name) => (
                <div key={name} className="px-3">
                  <DepRow name={name} dep={info?.deps?.[name]} />
                </div>
              ))}
            </ul>
          </li>
        </ul>
      </Section>

      <Section title="OpenTelemetry">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary">
              OTEL_EXPORTER_OTLP_ENDPOINT
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              未配置 = trace 走 stdout（默认，避免意外外发）。
              设置后 gateway 与 quant 都切到 OTLP 导出器。
            </div>
          </div>
          <div className="shrink-0">
            {info?.envFlags?.OTEL_EXPORTER_OTLP_ENDPOINT === true ? (
              <StatusBadge tone="success" variant="flat" size="sm">
                已配置
              </StatusBadge>
            ) : info?.envFlags?.OTEL_EXPORTER_OTLP_ENDPOINT === false ? (
              <StatusBadge tone="default" variant="flat" size="sm">
                未配置（stdout）
              </StatusBadge>
            ) : (
              <StatusBadge tone="default" variant="dot" size="sm">
                状态未知
              </StatusBadge>
            )}
          </div>
        </div>
      </Section>

      <Section title="审计日志">
        <p className="text-sm text-text-secondary mb-2">
          /api/v1/admin/* 与所有非 GET 请求的 append-only 审计记录
          （TTL 7 年；敏感字段已脱敏：apiKey / secret / passphrase /
          ciphertext / token / privateKey / mnemonic / seed）。
        </p>
        <Link
          href="/admin/audit"
          className="inline-block rounded bg-primary px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          打开审计日志 →
        </Link>
      </Section>

      <Section title="后台任务（cron）">
        <p className="text-xs text-text-tertiary mb-3">
          quant worker 的 ingest / optimize / extended_ingest cron 上次
          成功时间。空表说明 cron_state 持久化尚未落地（占位实现），
          Arq 调度仍按 quant/workers/settings.py 配置运行。
        </p>
        {info?.cronStatus && Object.keys(info.cronStatus).length > 0 ? (
          <ul className="divide-y divide-border-default">
            {Object.entries(info.cronStatus).map(([name, value]) => (
              <li
                key={name}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <span className="font-mono text-xs text-text-primary">
                  {name}
                </span>
                <span className="font-mono text-xs text-text-secondary tnum">
                  {typeof value === "string"
                    ? new Date(value).toLocaleString()
                    : JSON.stringify(value)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="暂无 cron 上次成功记录"
            description="参考 quant/workers/settings.py 中的 cron 配置；后续节点会把 cron_state 写入 Mongo。"
          />
        )}
        <Callout variant="info" title="后续可拓展">
          quant 端落地 <code className="mx-1">cron_state</code> 集合后，
          每个 cron 的上次成功时间会自动出现在这里，无需前端改动。
        </Callout>
      </Section>
    </div>
  );
}
