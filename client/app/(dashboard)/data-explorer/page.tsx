// Phase 8 data-explorer landing page. Pure server component — links
// to each per-domain explorer below. Each downstream page is also a
// server component that fetches default data from the gateway.
//
// Node 2.C.5.d — adopted design-system tokens (bg-bg-surface /
// border-border-default / text-text-*) and an icon-bearing card grid
// instead of plain Link tiles. Single column on mobile, two columns
// from md, three columns from lg. No business logic touched.

import Link from "next/link";

import { PageHeader } from "@/components/page-header";

export const metadata = { title: "数据浏览" };

const ENTRIES: Array<{
  href: string;
  title: string;
  blurb: string;
  icon: string;
}> = [
  {
    href: "/data-explorer/equities",
    title: "股票",
    blurb: "A 股 (AKShare) + 美股/港股 (yfinance)。日线 / 日内 OHLCV。",
    icon: "📈",
  },
  {
    href: "/data-explorer/futures",
    title: "期货",
    blurb: "国内商品与股指期货 (SHFE / DCE / CZCE / CFFEX)。",
    icon: "🛢",
  },
  {
    href: "/data-explorer/macro",
    title: "宏观指标",
    blurb: "FRED (美国/全球) + AKShare 国内 (CPI/PPI/M2/GDP/PMI)。",
    icon: "🌐",
  },
  {
    href: "/data-explorer/onchain",
    title: "链上指标",
    blurb: "DefiLlama TVL、Etherscan ETH 供应/Gas、blockchain.info BTC 统计。",
    icon: "⛓",
  },
  {
    href: "/data-explorer/news",
    title: "新闻与情绪",
    blurb: "CryptoPanic、AKShare 财联社、RSS 聚合。词典情绪分析。",
    icon: "📰",
  },
];

export default function DataExplorerLanding() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="数据浏览"
        subtitle="浏览所有 Phase 8 数据源。只读 — 持有 admin-key 的用户可在管理页面额外触发临时数据采集。"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ENTRIES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="rounded-lg border border-border-default bg-bg-surface p-4 flex flex-col gap-2 transition-colors hover:border-brand-primary"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-2xl leading-none">
                {e.icon}
              </span>
              <div className="text-base font-semibold text-text-primary">
                {e.title}
              </div>
            </div>
            <div className="text-sm text-text-secondary">{e.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
