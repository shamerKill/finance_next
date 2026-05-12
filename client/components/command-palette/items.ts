// Node 2.C.4 — CommandPalette items catalog.
//
// 三组 items：
//   - 导航 (pages)：dashboard 下所有路径
//   - 操作 (actions)：高频操作的 deeplink + query param（真正确认 /
//     调 API 由目标页面响应；这里不直接触发危险动作）
//   - 最近访问 (recent)：从 localStorage 读，运行时由
//     `use-palette-items.ts` 注入到列表头部
//
// Items 不直接调 router，而是返回一个 `target: string` 让上层 hook
// 用 `useRouter()` 把 push 注入；这样这个模块就是纯数据，不依赖
// next/navigation，也方便单测。

export interface StaticPaletteItem {
  id: string;
  /** 中文 label，用于显示与搜索 */
  label: string;
  /** 额外 search tokens（英文 / 同义词），与 label 一起匹配 */
  searchExtra?: string;
  group: "导航" | "操作";
  /** 目标路径（含可选 query） */
  target: string;
  /** 危险动作（红色标记 / 提示文案） */
  danger?: boolean;
  /** 显示在右侧的 hint 文案 */
  hint?: string;
}

// 1.1 Pages — sidebar 中能直接到达的所有 dashboard 路径
export const PAGE_ITEMS: StaticPaletteItem[] = [
  { id: "nav:dashboard", label: "仪表盘", searchExtra: "dashboard home overview", group: "导航", target: "/dashboard" },
  { id: "nav:accounts", label: "账户列表", searchExtra: "accounts 交易所 账号", group: "导航", target: "/accounts" },
  { id: "nav:accounts:new", label: "新建账户", searchExtra: "new account 添加", group: "导航", target: "/accounts/new" },
  { id: "nav:wallets", label: "钱包列表", searchExtra: "wallets polygon polymarket", group: "导航", target: "/wallets" },
  { id: "nav:wallets:new", label: "新建钱包", searchExtra: "new wallet 添加 钱包", group: "导航", target: "/wallets/new" },
  { id: "nav:portfolio", label: "持仓汇总", searchExtra: "portfolio 持仓 余额 总市值", group: "导航", target: "/portfolio" },
  { id: "nav:strategies", label: "策略列表", searchExtra: "strategies 策略", group: "导航", target: "/strategies" },
  // 当前实际新建策略页仍在 /option；2.C.5 会迁到 /strategies/new。
  { id: "nav:strategies:new", label: "新建策略", searchExtra: "new strategy 添加 创建", group: "导航", target: "/option" },
  { id: "nav:recommendations", label: "AI 推荐", searchExtra: "recommendations ai 推荐 优化", group: "导航", target: "/recommendations" },
  { id: "nav:backtests", label: "回测列表", searchExtra: "backtests 回测", group: "导航", target: "/backtests" },
  { id: "nav:backtests:new", label: "新建回测", searchExtra: "new backtest 添加 创建", group: "导航", target: "/backtests/new" },
  { id: "nav:markets", label: "行情", searchExtra: "markets ohlcv k线 chart", group: "导航", target: "/markets" },
  { id: "nav:data-explorer", label: "数据浏览", searchExtra: "data explorer 数据", group: "导航", target: "/data-explorer" },
  { id: "nav:data-explorer:equities", label: "数据 · 股票", searchExtra: "equities stocks 股票", group: "导航", target: "/data-explorer/equities" },
  { id: "nav:data-explorer:futures", label: "数据 · 期货", searchExtra: "futures 期货", group: "导航", target: "/data-explorer/futures" },
  { id: "nav:data-explorer:macro", label: "数据 · 宏观", searchExtra: "macro 宏观 fred cpi", group: "导航", target: "/data-explorer/macro" },
  { id: "nav:data-explorer:onchain", label: "数据 · 链上", searchExtra: "onchain 链上 chain", group: "导航", target: "/data-explorer/onchain" },
  { id: "nav:data-explorer:news", label: "数据 · 新闻", searchExtra: "news 新闻 资讯", group: "导航", target: "/data-explorer/news" },
  { id: "nav:prediction:markets", label: "预测市场", searchExtra: "prediction markets polymarket 预测", group: "导航", target: "/prediction/markets" },
  { id: "nav:prediction:strategies", label: "预测策略", searchExtra: "prediction strategies polymarket 预测策略", group: "导航", target: "/prediction/strategies" },
  // Node 3.E.1 — IA collapsed to /settings/*; /admin/audit stays put.
  { id: "nav:settings", label: "设置", searchExtra: "settings admin 管理 配置", group: "导航", target: "/settings/account" },
  { id: "nav:settings:account", label: "设置 · 个人", searchExtra: "account profile 个人 资料", group: "导航", target: "/settings/account" },
  { id: "nav:settings:system", label: "设置 · 系统", searchExtra: "system kill switch halt 系统 停机 限额", group: "导航", target: "/settings/system" },
  { id: "nav:settings:ai", label: "设置 · AI", searchExtra: "ai settings claude 优化 预算", group: "导航", target: "/settings/ai" },
  { id: "nav:settings:data-sources", label: "设置 · 数据源", searchExtra: "data sources 数据源 ingest", group: "导航", target: "/settings/data-sources" },
  { id: "nav:settings:trading", label: "设置 · 交易", searchExtra: "trading mainnet token gate 交易 主网", group: "导航", target: "/settings/trading" },
  { id: "nav:settings:observability", label: "设置 · 监控", searchExtra: "observability metrics audit 监控 追踪", group: "导航", target: "/settings/observability" },
  { id: "nav:settings:deployment", label: "设置 · 部署", searchExtra: "deployment version backup 部署 版本", group: "导航", target: "/settings/deployment" },
  { id: "nav:admin:audit", label: "审计日志", searchExtra: "audit 审计 日志 log", group: "导航", target: "/admin/audit" },
];

// 1.2 Actions — 高频操作 deeplink。query param 暂时占位，Wave 3 才会接通。
export const ACTION_ITEMS: StaticPaletteItem[] = [
  {
    id: "act:halt",
    label: "紧急停机交易",
    searchExtra: "halt kill switch 停机 急停 emergency",
    group: "操作",
    target: "/settings/system?action=halt",
    danger: true,
    hint: "需确认",
  },
  {
    id: "act:resume",
    label: "恢复交易",
    searchExtra: "resume 恢复 重启 unhalt",
    group: "操作",
    target: "/settings/system?action=resume",
    hint: "需确认",
  },
  {
    id: "act:new-strategy",
    label: "新建策略",
    searchExtra: "new strategy 创建 添加",
    group: "操作",
    target: "/option",
  },
  {
    id: "act:new-account",
    label: "新建账户",
    searchExtra: "new account 创建 添加",
    group: "操作",
    target: "/accounts/new",
  },
  {
    id: "act:new-wallet",
    label: "新建钱包",
    searchExtra: "new wallet 创建 添加",
    group: "操作",
    target: "/wallets/new",
  },
  {
    id: "act:ingest-markets",
    label: "抓取行情",
    searchExtra: "ingest ohlcv 抓取 行情 fetch",
    group: "操作",
    target: "/markets?action=ingest",
  },
  {
    id: "act:optimize",
    label: "触发 AI 优化",
    searchExtra: "optimize ai tune 优化",
    group: "操作",
    target: "/strategies?action=optimize-prompt",
  },
];
