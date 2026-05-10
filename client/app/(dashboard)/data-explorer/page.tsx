// Phase 8 data-explorer landing page. Pure server component — links
// to each per-domain explorer below. Each downstream page is also a
// server component that fetches default data from the gateway.

import Link from "next/link";

const ENTRIES: Array<{
  href: string;
  title: string;
  blurb: string;
}> = [
  {
    href: "/data-explorer/equities",
    title: "Equities",
    blurb: "A 股 (AKShare) + US/HK (yfinance). Daily / intraday OHLCV.",
  },
  {
    href: "/data-explorer/futures",
    title: "Futures",
    blurb: "CN commodity & index futures (SHFE / DCE / CZCE / CFFEX).",
  },
  {
    href: "/data-explorer/macro",
    title: "Macro indicators",
    blurb: "FRED (US/global) + AKShare CN (CPI/PPI/M2/GDP/PMI).",
  },
  {
    href: "/data-explorer/onchain",
    title: "On-chain metrics",
    blurb: "DefiLlama TVL, Etherscan ETH supply/gas, blockchain.info BTC stats.",
  },
  {
    href: "/data-explorer/news",
    title: "News & sentiment",
    blurb: "CryptoPanic, AKShare CLS, RSS aggregator. Lexicon sentiment.",
  },
];

export default function DataExplorerLanding() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Data Explorer</h1>
        <p className="text-sm text-default-500">
          Browse every Phase 8 data source. Read-only — admin-key holders can
          additionally trigger ad-hoc ingest from the Admin page.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTRIES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="text-lg font-semibold">{e.title}</div>
            <div className="text-sm text-default-500">{e.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
