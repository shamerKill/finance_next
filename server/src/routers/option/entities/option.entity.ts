import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
class CreatePosition {
  @Prop({ required: true, min: 0, max: 1 })
  marginRate: number;

  @Prop({ required: true, min: 0 })
  lossAddRate: number;
}

const createPositionSchema = SchemaFactory.createForClass(CreatePosition);

@Schema({
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      delete ret.__v;
      delete ret.userApiKey;
      delete ret.userSecretKey;
      return ret;
    },
  },
})
export class Option extends Document {
  @Prop({ unique: true, required: true, minlength: 3, maxlength: 8 })
  name: string;

  @Prop({ required: true, min: 1, max: 125 })
  positionLevel: number;

  @Prop({ required: true, min: 0 })
  openPositionStopTime: number;

  @Prop({ required: true })
  execSymbol: string;

  @Prop({ required: true })
  orderGroupMargin: number;

  @Prop({ required: true })
  stopProfitRate: number;

  @Prop({ required: true })
  stopLossRate: number;

  @Prop({ required: true })
  profitRateAfterAtAddPosition: number;

  @Prop({ required: true, default: false })
  createCostOrderInProfit: boolean;

  @Prop({ type: [createPositionSchema], required: true, default: [] })
  createPositions: CreatePosition[];

  @Prop({ required: true })
  userEmail: string;

  @Prop({ required: true })
  userApiKey: string;

  @Prop({ required: true })
  userSecretKey: string;

  @Prop({ required: true, default: () => new Date() })
  createTime: Date;
}

export type OptionDocument = Option & Document;

export const optionSchema = SchemaFactory.createForClass(Option);
