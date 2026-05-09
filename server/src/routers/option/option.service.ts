import { Injectable } from '@nestjs/common';
import { CreateOptionDto } from './dto/create-option.dto';
import { UpdateOptionDto } from './dto/update-option.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OptionDocument } from './entities/option.entity';
import { CryptoService } from '../../common/crypto.service';

@Injectable()
export class OptionService {
  constructor(
    @InjectModel('Option') private option: Model<OptionDocument>,
    private readonly crypto: CryptoService,
  ) {}

  private encryptCredentials<T extends Partial<CreateOptionDto>>(dto: T): T {
    const next = { ...dto };
    if (next.userApiKey) next.userApiKey = this.crypto.encrypt(next.userApiKey);
    if (next.userSecretKey)
      next.userSecretKey = this.crypto.encrypt(next.userSecretKey);
    return next;
  }

  async create(createOptionDto: CreateOptionDto) {
    const newOption = new this.option(this.encryptCredentials(createOptionDto));
    const doc = await newOption.save();
    return doc;
  }

  async findAll() {
    const options = await this.option.find({}).exec();
    return options;
  }

  findOne(id: string) {
    return this.option.findOne({ _id: id }).exec();
  }

  async update(id: string, updateOptionDto: UpdateOptionDto) {
    const _res = await this.findOne(id);
    if (_res === null) throw new Error('Option not found');
    const res = await this.option.updateOne(
      { _id: id },
      {
        $set: this.encryptCredentials(updateOptionDto),
      },
    );
    if (res.acknowledged) return this.findOne(id);
    throw new Error('Update failed');
  }

  async remove(id: string) {
    const res = await this.option.deleteOne({ _id: id });
    if (res.acknowledged) return { success: true };
    throw new Error('Delete failed');
  }
}
