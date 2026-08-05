import { Test, TestingModule } from '@nestjs/testing';
import { BarcodesService } from './barcodes.service';
import { NotFoundException } from '@nestjs/common';

describe('BarcodesService', () => {
  let service: BarcodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BarcodesService],
    }).compile();

    service = module.get<BarcodesService>(BarcodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException on empty barcode string', async () => {
    await expect(service.lookup('')).rejects.toThrow(NotFoundException);
    await expect(service.lookup('   ')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException on unrecognized barcode format', async () => {
    await expect(
      service.lookup('NON_EXISTENT_UNKNOWN_SKU_999999999'),
    ).rejects.toThrow(NotFoundException);
  });
});
