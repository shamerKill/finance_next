"use client";

import Link from "next/link";

import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { TypePredictionMarket } from "@/data/type";

// Client subcomponent for the prediction markets DataTable. Column
// `render` callbacks live here so they don't cross the RSC → client
// boundary as raw function props.
export default function MarketsTable({
  rows,
}: {
  rows: TypePredictionMarket[];
}) {
  return (
    <DataTable<TypePredictionMarket>
      ariaLabel="预测市场列表"
      mobileLayout="card"
      rows={rows}
      getRowKey={(m) => m.marketId}
      columns={[
        {
          key: "question",
          label: "市场",
          render: (m) => (
            <Link
              href={`/prediction/markets/${encodeURIComponent(m.marketId)}`}
              className="font-medium text-brand-primary hover:underline"
            >
              {m.question}
            </Link>
          ),
        },
        {
          key: "category",
          label: "分类",
          render: (m) =>
            m.category ? (
              <StatusBadge tone="default" variant="flat" size="sm">
                {m.category}
              </StatusBadge>
            ) : (
              <span className="text-text-tertiary">—</span>
            ),
        },
        {
          key: "endDate",
          label: "结束时间",
          render: (m) =>
            m.endDate ? (
              <span className="font-mono text-mono-sm tnum">
                {new Date(m.endDate).toLocaleDateString()}
              </span>
            ) : (
              <span className="text-text-tertiary">—</span>
            ),
        },
        {
          key: "tags",
          label: "标签",
          hideOnCard: true,
          render: (m) => (
            <div className="flex flex-wrap gap-1">
              {(m.tags ?? []).map((t) => (
                <StatusBadge
                  key={t}
                  tone="default"
                  variant="flat"
                  size="sm"
                >
                  {t}
                </StatusBadge>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
}
