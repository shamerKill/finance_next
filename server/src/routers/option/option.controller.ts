import { Controller, Get, Post, Body, Patch, Param, Delete, Put } from '@nestjs/common';
import { OptionService } from './option.service';
import { CreateOptionDto } from './dto/create-option.dto';
import { UpdateOptionDto } from './dto/update-option.dto';

@Controller('option')
export class OptionController {
  constructor(private readonly optionService: OptionService) {}

  @Post()
  async create(@Body() createOptionDto: CreateOptionDto) {
    const doc = await this.optionService.create(createOptionDto);
    return {
      message: '创建成功',
      value: {name: doc.name}
    };
  }

  @Get()
  findAll() {
    return this.optionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.optionService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateOptionDto: UpdateOptionDto) {
    return await this.optionService.update(id, updateOptionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.optionService.remove(id);
  }
}
