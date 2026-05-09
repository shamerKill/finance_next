import {
  Length,
  Max,
  Min,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  ArrayNotEmpty,
  IsEmail,
} from 'class-validator';

export class CreateOptionDto {
  @Length(3, 8, { message: '名字长度为3-8' })
  name: string;
  // 杠杆倍数
  @IsInt()
  @Min(1)
  @Max(125)
  positionLevel: number;
  // 开仓未成交停止时间单位分钟
  @IsInt()
  @Min(0)
  openPositionStopTime: number;
  // 执行交易的交易对
  @IsNotEmpty()
  execSymbol: string;
  // 订单组占用保证金数量
  @IsInt()
  orderGroupMargin: number;
  // 止盈比例
  @IsNumber()
  stopProfitRate: number;
  // 止损比例
  @IsNumber()
  stopProiftRate: number;
  // 补仓后止盈降低比例
  @IsNumber()
  profitRateAfterAtAddPosition: number;
  // 到止盈之后是否创建保本订单
  @IsBoolean()
  createCostOrderInProfit: boolean;
  // 订单组分布比例
  @ArrayNotEmpty()
  createPositions: {
    // 开仓保证金占单次订单周期总资金的比例
    marginRate: number;
    // 头仓完成之后亏损多少百分比，进行补仓，头仓为0
    lossAddRate: number;
  }[];
  // 用户的密钥
  @IsEmail()
  userEmail: string;
  @IsNotEmpty()
  userApiKey: string;
  @IsNotEmpty()
  userSecretKey: string;
}
