// Node 2.C.3 — central map from URL path → human-readable Chinese label.
//
// Used by <Breadcrumb> to render path segments and by /more to label the
// aggregated entries. Keep this list keyed by absolute path so subpaths
// can be looked up by progressively building "/a", "/a/b", "/a/b/c"; an
// unknown path falls back to the raw segment string.
//
// Dynamic segments (e.g. /accounts/[id]) are not in this table — the
// breadcrumb component will just display the raw id segment. This is by
// design: we don't want to add a server round-trip just to translate
// "abc123" → "BTC strategy".

export const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/accounts": "账户",
  "/accounts/new": "新建账户",
  "/wallets": "钱包",
  "/wallets/new": "新建钱包",
  "/portfolio": "投资组合",
  "/strategies": "策略",
  "/option": "新建策略",
  "/recommendations": "AI 推荐",
  "/backtests": "回测",
  "/backtests/new": "新建回测",
  "/markets": "行情",
  "/data-explorer": "数据浏览",
  "/data-explorer/equities": "股票",
  "/data-explorer/futures": "期货",
  "/data-explorer/macro": "宏观",
  "/data-explorer/onchain": "链上",
  "/data-explorer/news": "新闻",
  "/prediction": "预测",
  "/prediction/markets": "预测市场",
  "/prediction/strategies": "预测策略",
  "/admin": "管理",
  "/admin/ai": "AI 配置",
  "/admin/audit": "审计",
  "/more": "更多",
  "/dev": "调试",
};

// Look up a label for an absolute path. Falls back to the segment itself
// (the last "/x" portion) when unknown.
export function routeLabel(absPath: string): string {
  if (absPath in ROUTE_LABELS) return ROUTE_LABELS[absPath];
  const seg = absPath.split("/").filter(Boolean).pop() ?? "";
  return seg || "首页";
}
