export type TypeOption = {
  name: string;
  // 杠杆倍数
  positionLevel: number;
  // 开仓未成交停止时间单位分钟
  openPositionStopTime: number;
  // 执行交易的交易对
  execSymbol: string;
  // 订单组占用保证金数量
  orderGroupMargin: number;
  // 止盈比例
  stopProfitRate: number;
  // 止损比例
  stopLossRate: number;
  // 补仓后止盈降低比例
  profitRateAfterAtAddPosition: number;
  // 到止盈之后是否创建保本订单
  createCostOrderInProfit: boolean;
  // 订单组分布比例
  createPositions: {
    // 开仓保证金占单次订单周期总资金的比例
    marginRate: number;
    // 头仓完成之后亏损多少百分比，进行补仓，头仓为0
    lossAddRate: number;
  }[];
  // 用户的密钥
  userEmail: string;
  userApiKey: string;
  userSecretKey: string;
  // Phase 4 additions. Both optional so legacy docs validate. The
  // gateway treats missing `live` as `enabled=false`; missing `risk`
  // causes order submissions to be REJECTED — there are no silent
  // defaults.
  id?: string;
  risk?: TypeRiskCaps;
  live?: TypeLiveConfig;
  // Phase 6 — bumps by 1 each time an AI recommendation is approved
  // against this strategy. Optional on the client because the field is
  // absent on legacy docs that pre-date the recommendation flow.
  currentVersion?: number;
}

// Phase 4 — strategy-level risk caps. All three fields are mandatory at
// runtime; the gateway refuses to size orders when any is zero/missing.
export type TypeRiskCaps = {
  maxPositionUsd: number;
  maxLeverage: number;
  dailyLossCapUsd: number;
};

// Phase 4 — per-strategy live execution toggle. `mode="testnet"` is the
// default; switching to `mainnet` requires the admin mainnet gate to be
// open server-side.
export type TypeLiveMode = "testnet" | "mainnet";
export type TypeLiveConfig = {
  enabled: boolean;
  mode: TypeLiveMode;
  accountId?: string;
  startedAt?: string | null;
};

// Phase 4 — order log row. Wire shape matches gateway/internal/domain/order.go.
export type TypeOrderStatus =
  | "new"
  | "partial"
  | "filled"
  | "canceled"
  | "rejected"
  | "unknown";
export type TypeOrderSide = "BUY" | "SELL";
export type TypeOrderType = "MARKET" | "LIMIT";

export type TypeOrderLog = {
  id: string;
  clientOrderId: string;
  exchangeOrderId?: string;
  strategyId: string;
  accountId: string;
  symbol: string;
  side: TypeOrderSide;
  type: TypeOrderType;
  qty: number;
  price?: number;
  filled: number;
  avgFillPrice: number;
  status: TypeOrderStatus;
  mode: TypeLiveMode;
  realisedPnlUsd: number;
  submittedAt: string;
  lastEventAt: string;
};

export type TypeSetLive = {
  enabled?: boolean;
  accountId?: string;
  mode?: TypeLiveMode;
};

export type TypeSubmitOrder = {
  accountId: string;
  symbol: string;
  side: TypeOrderSide;
  type: TypeOrderType;
  qty: number;
  price?: number;
  markPrice?: number;
  idempotencyKey?: string;
};

export type TypeMainnetStatus = {
  envEnabled: boolean;
  mainnetAllowed: boolean;
  confirmExpiresAt?: string;
  pendingTokenCount: number;
};

// ---------- Account / exchange types (phase 1) ----------

export type TypeExchange = "binance" | "okx" | "bybit" | "a_share";

export type TypePermissions = {
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
};

export type TypeAccount = {
  id: string;
  userId: string;
  exchange: TypeExchange;
  label: string;
  email: string;
  permissions: TypePermissions;
  lastSnapshotAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TypeCreateAccount = {
  exchange: TypeExchange;
  label: string;
  email: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
};

export type TypeBalance = {
  asset: string;
  free: string;
  locked: string;
  wallet: string;
};

export type TypePosition = {
  symbol: string;
  positionSide: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unrealizedProfit: string;
  leverage: string;
  liquidationPrice: string;
  marginType: string;
};

// ---------- Backtests (phase 3) ----------

// Mirrors quantpb.v1.BacktestState integer codes; keep both forms so the
// UI can render either label or compare against the wire value.
export const BacktestState = {
  Pending: 1,
  Running: 2,
  Completed: 3,
  Failed: 4,
} as const;
export type BacktestStateValue = (typeof BacktestState)[keyof typeof BacktestState];

export type TypeBacktestTrade = {
  entryTs: string;
  exitTs: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  returnPct: number;
  nAdds: number;
  exitReason: string;
};

export type TypeBacktest = {
  runId: string;
  strategyId: string;
  kind: string;
  params: Record<string, unknown>;
  request: Record<string, unknown>;
  state: BacktestStateValue;
  progress: number;
  metrics: Record<string, number>;
  trades: TypeBacktestTrade[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string;
};

export type TypeCreateBacktest = {
  strategyId: string;
  kind?: string;
  params?: Record<string, unknown>;
  symbol: string;
  exchange: string;
  timeframe: "1m" | "5m" | "1h" | "1d";
  start: string;
  end: string;
  initialCapital?: number;
  commissionRate?: number;
  slippageBps?: number;
};

export type TypeBacktestHandle = {
  runId: string;
  enqueuedAt: string;
};

export type TypeEquityPoint = {
  time: string;
  equity: number;
  drawdown: number;
  position: number;
};

// ---------- Phase 5 — exchange_meta + portfolio summary ----------

export type TypeExchangeMeta = {
  id: string;
  exchange: TypeExchange;
  canonicalSymbol: string;
  nativeSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  contractType: "spot" | "linear-perp" | string;
  pricePrecision: number;
  qtyPrecision: number;
  minNotionalUsd: number;
  takerFeeRate: number;
  makerFeeRate: number;
  lastUpdated: string;
};

export type TypePortfolioExchangeBreakdown = {
  exchange: TypeExchange;
  totalUsd: number;
  accountIds: string[];
};

export type TypePortfolioAssetBreakdown = {
  asset: string;
  qty: number;
  usdValue: number;
};

export type TypePortfolioSummary = {
  totalUsd: number;
  perExchange: TypePortfolioExchangeBreakdown[];
  perAsset: TypePortfolioAssetBreakdown[];
  generatedAt: string;
  notes?: string[];
};

// ---------- Phase 6 — AI recommendations + optimizations ----------

export type TypeRecommendationStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "superseded";

// Phase D — wave 3 — period metadata describing the lookback window
// the optimizer used to evaluate the recommendation. Optional on the
// client because legacy recommendations pre-date the field; UI defaults
// to 90/63/27 + annualized=true when absent (matches the optimizer's
// historical default search window).
export type TypeRecommendationPeriod = {
  lookbackDays: number;
  inSampleDays: number;
  oosDays: number;
  sharpeAnnualized: boolean;
};

export type TypeRecommendation = {
  id: string;
  strategyId: string;
  studyId: string;
  proposedParams: Record<string, unknown>;
  expectedDelta: { sharpe: number; return: number };
  rationale: string;
  status: TypeRecommendationStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  appliedVersion?: number | null;
  createdAt: string;
  updatedAt: string;
  // Optional — see TypeRecommendationPeriod note above.
  period?: TypeRecommendationPeriod;
};

// Legacy-fallback default period block — the actual constant lives in
// `data/format.ts` since `.d.ts` files cannot hold runtime values.
// Re-export the type here for ergonomic single-source imports.

export type TypeOptimizationCost = {
  claudeTokensIn: number;
  claudeTokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usdSpent: number;
};

export type TypeOptimizationRun = {
  studyId: string;
  strategyId: string;
  algorithm: string;
  paramSpace: Record<string, unknown>;
  claudeContextHash: string;
  trialsTotal: number;
  trialsCompleted: number;
  bestValue: number;
  bestTrialId?: string | null;
  cost: TypeOptimizationCost;
  state: string;
  startedAt: string;
  finishedAt?: string | null;
  error: string;
  recommendationId?: string | null;
};

export type TypeStudyHandle = {
  studyId: string;
  enqueuedAt: string;
};

export type TypeApproveRecommendation = {
  recommendation: TypeRecommendation;
  strategy: TypeOption;
  newVersion: number;
};

// ---------- Phase 8 — extended data sources ----------

export type TypeMacroPoint = {
  source: string;
  code: string;
  ts: string;
  value: number;
  unit: string;
};

export type TypeOnchainPoint = {
  source: string;
  chain: string;
  metric: string;
  ts: string;
  value: number;
};

export type TypeNewsItem = {
  id: string;
  source: string;
  ts: string;
  title: string;
  url: string;
  body: string;
  sentiment: number;
  symbols: string[];
};

// ---------- Phase 9 — Polymarket prediction-market vertical ----------

export type TypePredictionMarket = {
  source: string;
  marketId: string;
  conditionId?: string;
  question: string;
  endDate?: string;
  category?: string;
  tags?: string[];
  createdAt: string;
};

export type TypePredictionQuote = {
  source: string;
  marketId: string;
  tokenId: string;
  ts: string;
  mid?: number;
  last?: number;
  bid?: number;
  ask?: number;
  volume24h?: number;
};

export type TypePredictionTrade = {
  source: string;
  marketId: string;
  tokenId: string;
  ts: string;
  side: string;
  price: number;
  size: number;
  txHash: string;
};

export type TypeWallet = {
  id: string;
  userId: string;
  label: string;
  address: string;
  usdcBalanceCached?: number;
  usdcAllowanceCached?: number;
  cachedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TypeWalletBalance = {
  balanceUsdc: number;
  allowanceUsdc: number;
  fetchedAt: string;
};

export type TypeWalletPosition = {
  tokenId: string;
  marketId?: string;
  outcome?: string;
  balance: number;
  updatedAt: string;
};

export type TypeCreateWallet = {
  label: string;
  privateKey: string;
  expectedAddress?: string;
};

export type TypePredictionRisk = {
  maxNotionalUsd: number;
  maxOpenMarkets: number;
  maxSlippageBps: number;
  dailyLossCapUsd: number;
};

export type TypePredictionStrategy = {
  id: string;
  userId: string;
  name: string;
  marketId: string;
  outcome: "YES" | "NO";
  risk: TypePredictionRisk;
  live: { enabled: boolean; mode?: string; walletId?: string };
  params?: unknown;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type TypeCreatePredictionStrategy = {
  name: string;
  marketId: string;
  outcome: "YES" | "NO";
  risk: TypePredictionRisk;
  params?: unknown;
};

export type TypePredictionOrder = {
  id: string;
  clientOrderId: string;
  strategyId: string;
  walletId: string;
  marketId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  price: number;
  size: number;
  midAtSubmit?: number;
  slippageBps?: number;
  status: string;
  exchangeOrderId?: string;
  filled?: number;
  avgFillPrice?: number;
  realisedPnlUsd?: number;
  submittedAt: string;
  lastEventAt: string;
};

// ---------- Wave 1B — /api/v1/dashboard/summary ----------
//
// Aggregated response for the redesigned dashboard landing page.
// All numeric fields fall back to 0 server-side when the corresponding
// repo errors; `notes` carries the per-section error strings so the UI
// can surface them without 5xx-ing the shell.
export type TypeDashboardSummary = {
  system: {
    tradingHalted: boolean;
    haltedReason: string;
    haltedBy: string;
    haltedSince: string | null;
  };
  portfolio: {
    totalUsd: number;
    accountCount: number;
    strategyCount: number;
    walletCount: number;
  };
  pnl: {
    realised24hUsd: number;
    realised30dUsd: number;
    tradesLast24h: number;
  };
  openOrders: {
    count: number;
    openNotionalUsd: number;
  };
  recommendations: {
    pendingCount: number;
    topPendingIds: string[];
  };
  aiBudget: {
    usdSpentToday: number;
    usdCapPerDay: number;
    anthropicConfigured: boolean;
    openaiConfigured: boolean;
    currentFamily: string;
  };
  generatedAt: string;
  notes?: string[];
};

// ---------- Wave 2 / Phase C — /api/v1/strategies/:id/performance ----------
//
// Aggregated KPIs + equity curve + recent orders for the strategy detail
// page. Matches gateway/internal/http/handlers/dashboard.go::
// StrategyPerformance. `equityCurve` may be empty when no live trades
// have happened yet; `recentOrders` is capped at 10 server-side.
export type TypeStrategyPerformanceKPIs = {
  totalPnlUsd: number;
  realised24hUsd: number;
  realised30dUsd: number;
  tradesTotal: number;
  tradesLast24h: number;
  winRate: number;
  maxDrawdownPct: number;
  lastTradeAt: string | null;
  currentOpenNotionalUsd: number;
};

export type TypeStrategyEquityPoint = {
  ts: string;
  equityUsd: number;
};

// Subset of fields the recent-orders table actually renders. Extra
// fields on the wire are tolerated by TS structural typing — the
// backend serialises the full domain.OrderLog.
export type TypeStrategyPerformanceOrder = {
  clientOrderId: string;
  exchangeOrderId?: string;
  symbol: string;
  side: TypeOrderSide;
  type: TypeOrderType;
  qty: number;
  price?: number;
  filled: number;
  avgFillPrice: number;
  status: TypeOrderStatus;
  mode: TypeLiveMode;
  realisedPnlUsd: number;
  submittedAt: string;
  lastEventAt: string;
};

export type TypeStrategyPerformance = {
  strategyId: string;
  userId: string;
  isLive: boolean;
  mode: string;
  kpis: TypeStrategyPerformanceKPIs;
  equityCurve: TypeStrategyEquityPoint[];
  recentOrders: TypeStrategyPerformanceOrder[];
  notes?: string[];
};

// --- Phase 1.A.3 — auth user (cookie / JWT) ---------------------------
//
// Mirrors gateway/internal/domain/user.go::User minus the password hash
// (the gateway strips that with json:"-"). Returned by GET /auth/me and
// embedded into login/register/accept-invite 200 responses.
export type TypeUserRole = "admin" | "member";

export type TypeUser = {
  id: string;
  email: string;
  role: TypeUserRole;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  invitedBy?: string;
};

// Body of the admin /auth/invite reply. Token is also embedded inside
// the URL but kept as a separate field for UIs that prefer to render a
// raw "copy this" string instead of (or alongside) the URL.
export type TypeInviteResult = {
  inviteUrl: string;
  token: string;
  expiresAt: string;
};