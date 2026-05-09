import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Option extends Document {
  @Prop({ unique: true, required: true })
  name: string;
  @Prop({ required: true, default: new Date() })
  createTime: Date;
}

export type OptionDocument = Option & Document;

export const optionSchema = SchemaFactory.createForClass(Option);
