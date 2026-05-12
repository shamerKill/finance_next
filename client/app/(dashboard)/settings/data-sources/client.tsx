"use client";

// Node 3.E.3 — /settings/data-sources client panel.
//
// Renders three sections:
//   1. 外部 API Keys — presence/absence badges for FRED / Etherscan /
//      CryptoPanic / Polygon (paid stub) / Glassnode (stub) / Nansen
//      (stub). Most of these live on the quant process; the gateway's
//      system-info endpoint only exposes flags for env vars it parses
//      directly, so a quant-only key shows "状态未知（quant 端持有）"
//      with a hint to inspect quant/.env manually.
//   2. AI Context — readonly `AI_CONTEXT_INCLUDE_EXTENDED` flag. The
//      backend is env-only (no PUT path); the toggle is disabled with
//      a hint.
//   3. 数据源状态自检 — per-cron last-success timestamps from
//      `cronStatus`. Currently a stub on the backend, so we render an
//      EmptyState when the map is empty.
//
// Secrets are never displayed; only "已配置" / "未配置" / "状态未知".

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { useSystemInfo } from "@/data/use-system-info";

type KeyRow = {
  /** env var name displayed in the row (also used as React key). */
  envKey: string;
  /** Human label rendered to the left. */
  label: string;
  /** Where this env var lives — drives the hint text and whether we read
   * its boolean status from the system-info envFlags (gateway) or
   * surface "unknown". */
  scope: "gateway" | "quant";
  /** Short note rendered below the row. */
  hint: string;
};

const API_KEY_ROWS: KeyRow[] = [
  {
    envKey: "FRED_API_KEY",
    label: "FRED API Key",
    scope: "quant",
    hint: "宏观指标抓取（FRED）；编辑 quant/.env 后重启 quant worker。",
  },
  {
    envKey: "ETHERSCAN_API_KEY",
    label: "Etherscan API Key",
    scope: "quant",
    hint: "链上指标抓取（Etherscan）；编辑 quant/.env 后重启 quant worker。",
  },
  {
    envKey: "CRYPTOPANIC_TOKEN",
    label: "CryptoPanic Token",
    scope: "quant",
    hint: "新闻抓取免费层加速；编辑 quant/.env 后重启 quant worker。",
  },
  {
    envKey: "POLYGON_API_KEY",
    label: "Polygon.io API Key (paid stub)",
    scope: "quant",
    hint: "美股 / intl 行情付费源；当前仍是 stub，启用前需替换 quant/data/equities/polygon_stub.py。",
  },
  {
    envKey: "GLASSNODE_API_KEY",
    label: "Glassnode API Key (stub)",
    scope: "quant",
    hint: "链上付费源；当前仍是 stub，启用前需替换 quant/data/onchain/glassnode_stub.py。",
  },
  {
    envKey: "NANSEN_API_KEY",
    label: "Nansen API Key (stub)",
    scope: "quant",
    hint: "钱包标注付费源；当前仍是 stub，启用前需替换 quant/data/onchain/nansen_stub.py。",
  },
];

export function DataSourcesClient() {
  const { data, err, loading } = useSystemInfo();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="数据源"
        subtitle="行情 / 宏观 / 链上 / 新闻数据 API 配置；密钥永不在 UI 中显示原值，只显示是否已配置。"
      />

      {err && <ApiErrorView error={err} />}
      {loading && !data && (
        <div className="text-sm text-text-secondary">加载中…</div>
      )}

      <Section title="外部 API Keys">
        <ul className="divide-y divide-border-default">
          {API_KEY_ROWS.map((row) => {
            const raw = data?.envFlags?.[row.envKey];
            const known = data != null && typeof raw === "boolean";
            const ok = known && raw === true;
            return (
              <li
                key={row.envKey}
                className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">
                    {row.label}
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5 font-mono">
                    {row.envKey}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    {row.hint}
                  </div>
                </div>
                <div className="shrink-0">
                  {!known ? (
                    <StatusBadge tone="default" variant="dot" size="sm">
                      状态未知（quant 端持有）
                    </StatusBadge>
                  ) : ok ? (
                    <StatusBadge tone="success" variant="flat" size="sm">
                      已配置
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="default" variant="flat" size="sm">
                      未配置
                    </StatusBadge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <Callout variant="info" title="为何 quant 端 key 显示「状态未知」？">
          FRED / Etherscan / CryptoPanic 等键由 Python quant worker 在
          进程内读取，gateway 的 system-info 端点只能看到自己进程的
          env。要核对实际状态，请在部署机器上检查 quant/.env 或容器
          环境变量。
        </Callout>
      </Section>

      <Section title="AI Context">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary">
              AI_CONTEXT_INCLUDE_EXTENDED
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              控制 AI 优化器在 prompt 中是否附带 24h 新闻 top-5、最新
              宏观与链上快照。默认在 FRED 或 Etherscan 任一已配置时
              开启；该开关只在 quant 进程启动时读取，
              <span className="font-semibold">不可在 UI 修改</span>，
              如需覆盖请编辑 quant/.env 并重启 quant worker。
            </div>
          </div>
          <div className="shrink-0">
            <StatusBadge tone="default" variant="dot" size="sm">
              状态未知（quant 端持有）
            </StatusBadge>
          </div>
        </div>
      </Section>

      <Section title="数据源状态自检">
        <p className="text-xs text-text-tertiary mb-3">
          各 ingest cron 上次成功时间。空表说明 quant worker 尚未
          落地 cron_state 持久化（占位实现），暂以 Arq cron 配置为准。
        </p>
        {data && data.cronStatus && Object.keys(data.cronStatus).length > 0 ? (
          <ul className="divide-y divide-border-default">
            {Object.entries(data.cronStatus).map(([name, value]) => (
              <li
                key={name}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <span className="font-mono text-xs text-text-primary">
                  {name}
                </span>
                <span className="font-mono text-xs text-text-secondary tnum">
                  {formatCronTs(value)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="暂无 cron 上次成功记录"
            description="quant worker 尚未持久化 cron_state；Arq 调度仍按 quant/workers/settings.py 配置运行。"
          />
        )}
      </Section>
    </div>
  );
}

function formatCronTs(v: unknown): string {
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    return v;
  }
  if (v == null) return "—";
  return JSON.stringify(v);
}
