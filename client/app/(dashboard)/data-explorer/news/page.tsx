// Phase 8 news explorer. Server-rendered list of the most recent 100
// items, sentiment-coloured. Symbol filter is left for a follow-up
// (the gateway endpoint already accepts ?symbols=).

import { getNews } from "@/data/api-client";
import type { TypeNewsItem } from "@/data/type";

export const dynamic = "force-dynamic";

function sentimentClass(s: number): string {
  if (s > 0.2) return "text-success";
  if (s < -0.2) return "text-danger";
  return "text-default-500";
}

export default async function NewsPage() {
  let items: TypeNewsItem[] = [];
  let error: string | null = null;
  try {
    items = await getNews(undefined, undefined, 100);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load news";
  }
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">News & sentiment</h1>
        <p className="text-sm text-default-500">
          Latest {items.length} items across CryptoPanic / AKShare CLS / RSS.
          Sentiment is a placeholder lexicon scorer — not financial advice.
        </p>
      </header>
      {error && (
        <div className="text-sm text-warning border border-warning rounded p-2">
          {error}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            className="border border-default-200 rounded p-3 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-default-400">{n.ts}</span>
              <span className="text-default-500">{n.source}</span>
              <span className={sentimentClass(n.sentiment)}>
                {n.sentiment >= 0 ? "+" : ""}
                {n.sentiment.toFixed(2)}
              </span>
              {n.symbols.length > 0 && (
                <span className="ml-auto text-default-400">
                  {n.symbols.join(", ")}
                </span>
              )}
            </div>
            {n.url ? (
              <a
                href={n.url}
                className="text-sm hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {n.title}
              </a>
            ) : (
              <span className="text-sm">{n.title}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
