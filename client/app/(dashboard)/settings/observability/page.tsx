import Link from "next/link";

import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

import { requireAdmin } from "../require-admin";

export default async function SettingsObservabilityPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="监控"
        subtitle="审计日志、Prometheus 指标、追踪导出"
      />

      <Section title="审计日志">
        <p className="text-sm text-text-secondary mb-2">
          查看 /api/v1/admin/* 与非 GET 请求的 append-only 审计记录（TTL 7
          年；敏感字段已脱敏）。
        </p>
        <Link
          href="/admin/audit"
          className="inline-block rounded bg-primary px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          打开审计日志 →
        </Link>
      </Section>

      <Section title="其他监控（即将开放）">
        <Callout variant="info" title="需后端 system-info endpoint（3.E.2）">
          Prometheus 直方图概览、OTLP 端点状态、最近 trace 等聚合视图依赖
          Node 3.E.2 落地。/metrics 端点目前已可直接由 Prometheus 抓取，
          dashboards 在 infra/grafana/ 下。
        </Callout>
      </Section>
    </div>
  );
}
