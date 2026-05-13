"use client";

import Link from "next/link";

import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { TypePredictionStrategy } from "@/data/type";

// Client subcomponent for the prediction strategies DataTable. Column
// `render` callbacks live here so they don't cross the RSC → client
// boundary as raw function props.
export default function StrategiesTable({
  rows,
}: {
  rows: TypePredictionStrategy[];
}) {
  return (
    <DataTable<TypePredictionStrategy>
      ariaLabel="预测策略列表"
      mobileLayout="card"
      rows={rows}
      getRowKey={(s) => s.id}
      columns={[
        {
          key: "name",
          label: "名称",
          render: (s) => (
            <Link
              href={`/prediction/strategies/${s.id}`}
              className="font-medium text-brand-primary hover:underline"
            >
              {s.name}
            </Link>
          ),
        },
        {
          key: "marketId",
          label: "市场",
          render: (s) => (
            <span className="font-mono text-mono-sm break-all">
              {s.marketId}
            </span>
          ),
        },
        {
          key: "outcome",
          label: "结果",
          render: (s) => (
            <StatusBadge
              tone={s.outcome === "YES" ? "success" : "danger"}
              variant="flat"
              size="sm"
            >
              {s.outcome}
            </StatusBadge>
          ),
        },
        {
          key: "version",
          label: "版本",
          align: "end",
          render: (s) => (
            <span className="font-mono tnum">v{s.currentVersion}</span>
          ),
        },
        {
          key: "status",
          label: "状态",
          render: (s) =>
            s.live.enabled ? (
              <StatusBadge tone="success" variant="dot">
                实盘 · {s.live.mode ?? "mainnet"}
              </StatusBadge>
            ) : (
              <StatusBadge tone="default" variant="dot">
                未启用
              </StatusBadge>
            ),
        },
      ]}
    />
  );
}
