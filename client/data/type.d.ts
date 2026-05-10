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
};

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