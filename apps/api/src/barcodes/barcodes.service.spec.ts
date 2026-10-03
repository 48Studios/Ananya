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

  it('should route structured ANANYA:V1:LOCATION payloads to lookupLocation', async () => {
    const spy = jest.spyOn(service as any, 'lookupLocation').mockResolvedValue({
      found: true,
      entityType: 'LOCATION',
      entityId: 'loc-123',
    } as any);

    const res = await service.lookup('ANANYA:V1:LOCATION:loc-123');
    expect(spy).toHaveBeenCalledWith('loc-123');
    expect(res.entityType).toBe('LOCATION');
  });

  it('should route case-insensitive ananya:v1:component payloads to lookupComponent', async () => {
    const spy = jest
      .spyOn(service as any, 'lookupComponent')
      .mockResolvedValue({
        found: true,
        entityType: 'COMPONENT',
        entityId: 'comp-456',
      } as any);

    const res = await service.lookup('ananya:v1:component:comp-456');
    expect(spy).toHaveBeenCalledWith('comp-456');
    expect(res.entityType).toBe('COMPONENT');
  });
});
