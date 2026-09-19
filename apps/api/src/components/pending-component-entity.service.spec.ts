import { Test } from '@nestjs/testing';
import { PendingComponentEntityService } from './pending-component-entity.service';
import { CategoriesService } from '../categories/categories.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';

describe('PendingComponentEntityService', () => {
  let service: PendingComponentEntityService;
  const manufacturersService = {
    getAllManufacturers: jest.fn(),
    create: jest.fn(),
  };
  const categoriesService = {
    getAllCategories: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    manufacturersService.getAllManufacturers.mockResolvedValue([]);
    categoriesService.getAllCategories.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        PendingComponentEntityService,
        { provide: ManufacturersService, useValue: manufacturersService },
        { provide: CategoriesService, useValue: categoriesService },
      ],
    }).compile();
    service = module.get(PendingComponentEntityService);
  });

  it('reuses an existing manufacturer for a pending candidate', async () => {
    manufacturersService.getAllManufacturers.mockResolvedValue([
      { id: 'mfg-1', code: 'YAGEO', name: 'Yageo' },
    ]);

    await expect(
      service.resolveManufacturer(null, { name: 'Yageo' }),
    ).resolves.toBe('mfg-1');
    expect(manufacturersService.create).not.toHaveBeenCalled();
  });

  it('creates a missing manufacturer at component save time', async () => {
    manufacturersService.create.mockResolvedValue({ id: 'mfg-2' });

    await expect(
      service.resolveManufacturer(null, { name: 'Acme Semiconductor' }),
    ).resolves.toBe('mfg-2');
    expect(manufacturersService.create).toHaveBeenCalledWith({
      code: 'ACME-SEMICONDUCTOR',
      name: 'Acme Semiconductor',
    });
  });

  it('creates a missing category with its parent at component save time', async () => {
    categoriesService.create.mockResolvedValue({ id: 'cat-2' });

    await expect(
      service.resolveCategory(null, {
        name: 'Photovoltaic Connectors',
        parentId: 'cat-connectors',
      }),
    ).resolves.toBe('cat-2');
    expect(categoriesService.create).toHaveBeenCalledWith({
      code: 'PHOTOVOLTAIC-CONNECTORS',
      name: 'Photovoltaic Connectors',
      parentId: 'cat-connectors',
      description: null,
    });
  });

  it('rejects contradictory explicit and pending values', async () => {
    await expect(
      service.resolveManufacturer('mfg-1', { name: 'Yageo' }),
    ).rejects.toThrow('cannot both be provided');
  });

  it('reuses a record created concurrently when creation reports a duplicate', async () => {
    manufacturersService.create.mockRejectedValue({ code: '23505' });
    manufacturersService.getAllManufacturers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'mfg-raced', code: 'ACME', name: 'Acme' }]);

    await expect(
      service.resolveManufacturer(null, { name: 'Acme' }),
    ).resolves.toBe('mfg-raced');
  });
});
