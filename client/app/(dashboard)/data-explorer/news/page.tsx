// Phase 8 news explorer. Server-rendered list of the most recent 100
// items, sentiment-coloured. Symbol filter is left for a follow-up
// (the gateway endpoint already accepts ?symbols=).
//
// Node 2.C.5.d — migrated list rendering to <DataTable> (which
// transparently swaps to a card-list on mobile) and sentiment chip to
// <StatusBadge>. Business logic unchanged; ingest still uses the
// IngestWithVerify wrapper.

import { ApiErrorView } from "@/components/api-error";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { getNews } from "@/data/api-client";
import type { TypeNewsItem } from "@/data/type";

import { IngestWithVerify } from "./ingest-with-verify";

export const metadata = { title: "新闻与情绪" };

export const dynamic = "force-dynamic";

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

export default async function NewsPage() {
  let items: TypeNewsItem[] = [];
  let error: unknown = null;
  try {
    items = await getNews(undefined, undefined, 100);
  } catch (e) {
    error = e;
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="新闻与情绪"
        subtitle={`来自 CryptoPanic / AKShare 财联社 / RSS 的最新 ${items.length} 条。情绪为占位词典打分 — 不构成投资建议。`}
        action={<IngestWithVerify />}
      />
      <ApiErrorView error={error} />
      <Section title="最新新闻">
        <DataTable
          ariaLabel="news list"
          mobileLayout="card"
          columns={COLUMNS}
          rows={items}
          getRowKey={(n) => n.id}
          emptyState={
            <EmptyState
              title="暂无新闻"
              description="尚未抓取到任何新闻条目。点击右上角“立即抓取数据”触发一次采集。"
            />
          }
        />
      </Section>
    </div>
  );
}
