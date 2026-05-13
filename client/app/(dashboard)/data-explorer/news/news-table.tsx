"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import type { TypeNewsItem } from "@/data/type";

function sentimentTone(s: number): StatusTone {
  if (s > 0.2) return "success";
  if (s < -0.2) return "danger";
  return "default";
}

function fmtSentiment(s: number): string {
  return `${s >= 0 ? "+" : ""}${s.toFixed(2)}`;
}

const COLUMNS: DataTableColumn<TypeNewsItem>[] = [
  {
    key: "ts",
    label: "时间",
    render: (n) => (
      <span className="font-mono text-xs text-text-secondary">{n.ts}</span>
    ),
  },
  {
    key: "source",
    label: "来源",
    render: (n) => <span className="text-text-secondary">{n.source}</span>,
  },
  {
    key: "sentiment",
    label: "情绪",
    render: (n) => (
      <StatusBadge tone={sentimentTone(n.sentiment)} variant="flat" size="sm">
        {fmtSentiment(n.sentiment)}
      </StatusBadge>
    ),
  },
  {
    key: "title",
    label: "标题",
    render: (n) =>
      n.url ? (
        <a
          href={n.url}
          className="text-sm text-text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {n.title}
        </a>
      ) : (
        <span className="text-sm text-text-primary">{n.title}</span>
      ),
  },
  {
    key: "symbols",
    label: "标的",
    render: (n) =>
      n.symbols.length > 0 ? (
        <span className="text-xs text-text-tertiary">
          {n.symbols.join(", ")}
        </span>
      ) : (
        <span className="text-xs text-text-tertiary">—</span>
      ),
  },
];

// Client subcomponent for the news DataTable. The `render` callbacks
// stay in the client island to avoid the RSC → client function-prop
// transit.
export default function NewsTable({ rows }: { rows: TypeNewsItem[] }) {
  return (
    <DataTable
      ariaLabel="news list"
      mobileLayout="card"
      columns={COLUMNS}
      rows={rows}
      getRowKey={(n) => n.id}
      emptyState={
        <EmptyState
          title="暂无新闻"
          description="尚未抓取到任何新闻条目。点击右上角“立即抓取数据”触发一次采集。"
        />
      }
    />
  );
}
