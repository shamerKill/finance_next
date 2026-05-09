import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OptionService } from './option.service';
import { CryptoService } from '../../common/crypto.service';

describe('OptionService', () => {
  let service: OptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptionService,
        { provide: getModelToken('Option'), useValue: {} },
        { provide: CryptoService, useValue: { encrypt: (s: string) => s } },
      ],
    }).compile();

    service = module.get<OptionService>(OptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
