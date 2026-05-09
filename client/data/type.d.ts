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
}

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