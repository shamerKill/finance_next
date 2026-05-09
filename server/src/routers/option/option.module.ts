import { Module } from '@nestjs/common';
import { OptionService } from './option.service';
import { OptionController } from './option.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Option, optionSchema } from './entities/option.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Option.name,
        schema: optionSchema,
      },
    ]),
  ],
  controllers: [OptionController],
  providers: [OptionService],
})
export class OptionModule {}
