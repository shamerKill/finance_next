"use client";

// Page-local IngestButton wrapper that wires the verify callback. The
// callback re-fetches the news list and returns its length, so the button
// can poll for the consumer to actually land data + report "新增 N 条"
// instead of just refreshing blindly.

import { IngestButton } from "@/components/ingest-button";
import { getNews } from "@/data/api-client";

export function IngestWithVerify() {
  return (
    <IngestButton
      path="v1/admin/ingest/news"
      body={{ limit: 100 }}
      verify={async () => {
        const items = await getNews(undefined, undefined, 1000);
        return items.length;
      }}
    />
  );
}
