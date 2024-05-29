import { PartialType } from '@nestjs/mapped-types';
import { CreateOptionDto } from './create-option.dto';
import { Length } from 'class-validator';

export class UpdateOptionDto extends PartialType(CreateOptionDto) {
  @Length(3, 8, { message: '名字长度为3-8' })
  name: string;
}
