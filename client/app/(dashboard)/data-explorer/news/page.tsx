// Phase 8 news explorer. Server-rendered list of the most recent 100
// items, sentiment-coloured. Symbol filter is left for a follow-up
// (the gateway endpoint already accepts ?symbols=).
//
// Node 2.C.5.d — migrated list rendering to <DataTable> (which
// transparently swaps to a card-list on mobile) and sentiment chip to
// <StatusBadge>. Business logic unchanged; ingest still uses the
// IngestWithVerify wrapper. Column `render` callbacks live in
// <NewsTable> (client) to keep functions on the client side of the
// RSC boundary.

import { ApiErrorView } from "@/components/api-error";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { getNews } from "@/data/api-client";
import type { TypeNewsItem } from "@/data/type";

import { IngestWithVerify } from "./ingest-with-verify";
import NewsTable from "./news-table";

export const metadata = { title: "新闻与情绪" };

export const dynamic = "force-dynamic";

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
        <NewsTable rows={items} />
      </Section>
    </div>
  );
}
