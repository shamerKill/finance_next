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
  stopProiftRate: number;
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