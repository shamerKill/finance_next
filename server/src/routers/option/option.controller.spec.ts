import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OptionController } from './option.controller';
import { OptionService } from './option.service';
import { CryptoService } from '../../common/crypto.service';

describe('OptionController', () => {
  let controller: OptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptionController],
      providers: [
        OptionService,
        { provide: getModelToken('Option'), useValue: {} },
        { provide: CryptoService, useValue: { encrypt: (s: string) => s } },
      ],
    }).compile();

    controller = module.get<OptionController>(OptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
