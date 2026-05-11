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
    title: "股票",
    blurb: "A 股 (AKShare) + 美股/港股 (yfinance)。日线 / 日内 OHLCV。",
  },
  {
    href: "/data-explorer/futures",
    title: "期货",
    blurb: "国内商品与股指期货 (SHFE / DCE / CZCE / CFFEX)。",
  },
  {
    href: "/data-explorer/macro",
    title: "宏观指标",
    blurb: "FRED (美国/全球) + AKShare 国内 (CPI/PPI/M2/GDP/PMI)。",
  },
  {
    href: "/data-explorer/onchain",
    title: "链上指标",
    blurb: "DefiLlama TVL、Etherscan ETH 供应/Gas、blockchain.info BTC 统计。",
  },
  {
    href: "/data-explorer/news",
    title: "新闻与情绪",
    blurb: "CryptoPanic、AKShare 财联社、RSS 聚合。词典情绪分析。",
  },
];

export default function DataExplorerLanding() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">数据浏览</h1>
        <p className="text-sm text-default-500">
          浏览所有 Phase 8 数据源。只读 — 持有 admin-key 的用户可在管理页面额外触发临时数据采集。
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
