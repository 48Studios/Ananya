import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DomainError } from '@ananya/core';
import { AttributesService } from '../attributes/attributes.service';
import { BomsService } from '../boms/boms.service';
import { CategoriesService } from '../categories/categories.service';
import { ComponentsService } from '../components/components.service';
import { LocationsService } from '../locations/locations.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RolesService } from '../roles/roles.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { UnitsService } from '../units/units.service';
import { BulkActionType } from './dtos';
import {
  BulkActionService,
  classifyBulkActionFailure,
} from './bulk-action.service';
import { MAX_BULK_ACTION_IDS } from './bulk-action-registry';

interface MockService {
  delete: jest.Mock;
  deleteDefinition: jest.Mock;
  update: jest.Mock;
  updateDefinition: jest.Mock;
}

const MOCK_METHODS: Array<keyof MockService> = [
  'delete',
  'deleteDefinition',
  'update',
  'updateDefinition',
];

function createMockService(): MockService {
  return {
    delete: jest.fn().mockResolvedValue(undefined),
    deleteDefinition: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    updateDefinition: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * The service is an orchestration layer: every claim here is about WHICH module
 * operation a bulk action calls, and how one record's refusal is kept from
 * stopping the rest of the batch.
 */
describe('BulkActionService', () => {
  let service: BulkActionService;

  const mocks = {
    attributes: createMockService(),
    categories: createMockService(),
    components: createMockService(),
    manufacturers: createMockService(),
    suppliers: createMockService(),
    locations: createMockService(),
    units: createMockService(),
    roles: createMockService(),
    boms: createMockService(),
    productionOrders: createMockService(),
    purchaseOrders: createMockService(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const mock of Object.values(mocks)) {
      for (const method of MOCK_METHODS) {
        mock[method].mockResolvedValue(undefined);
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkActionService,
        { provide: AttributesService, useValue: mocks.attributes },
        { provide: CategoriesService, useValue: mocks.categories },
        { provide: ComponentsService, useValue: mocks.components },
        { provide: ManufacturersService, useValue: mocks.manufacturers },
        { provide: SuppliersService, useValue: mocks.suppliers },
        { provide: LocationsService, useValue: mocks.locations },
        { provide: UnitsService, useValue: mocks.units },
        { provide: RolesService, useValue: mocks.roles },
        { provide: BomsService, useValue: mocks.boms },
        { provide: ProductionOrdersService, useValue: mocks.productionOrders },
        { provide: PurchaseOrdersService, useValue: mocks.purchaseOrders },
      ],
    }).compile();

    service = module.get<BulkActionService>(BulkActionService);
  });

  it('reports what the toolbar may offer', () => {
    expect(service.getSupport('Component').supportedActions).toEqual([
      BulkActionType.DELETE,
      BulkActionType.ARCHIVE,
      BulkActionType.UPDATE_STATUS,
    ]);
    expect(service.getSupport('ServiceRequest').supportedActions).toEqual([]);
  });

  it('refuses an action the entity type does not support', async () => {
    await expect(
      service.execute({
        entityType: 'Component',
        action: BulkActionType.ASSIGN_CATEGORY,
        ids: ['a'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an entity type with no bulk support at all', async () => {
    await expect(
      service.execute({
        entityType: 'OpeningInventory',
        action: BulkActionType.DELETE,
        ids: ['a'],
      }),
    ).rejects.toThrow('Bulk actions are not supported for "OpeningInventory".');
  });

  it('refuses a batch larger than the per-request bound', async () => {
    const ids = Array.from({ length: MAX_BULK_ACTION_IDS + 1 }, (_, i) =>
      String(i),
    );

    await expect(
      service.execute({
        entityType: 'Component',
        action: BulkActionType.DELETE,
        ids,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acts on a duplicated id once', async () => {
    const result = await service.execute({
      entityType: 'Component',
      action: BulkActionType.DELETE,
      ids: ['c1', 'c1', 'c2'],
    });

    expect(mocks.components.delete).toHaveBeenCalledTimes(2);
    expect(result.requestedCount).toBe(2);
    expect(result.appliedCount).toBe(2);
  });

  it('archives through the module update path with isActive false', async () => {
    const result = await service.execute({
      entityType: 'Component',
      action: BulkActionType.ARCHIVE,
      ids: ['c1'],
    });

    expect(mocks.components.update).toHaveBeenCalledWith('c1', {
      isActive: false,
    });
    expect(mocks.components.delete).not.toHaveBeenCalled();
    expect(result.appliedCount).toBe(1);
    expect(result.results[0]).toEqual({
      id: 'c1',
      outcome: 'APPLIED',
      reason: null,
    });
  });

  it('activates through the module update path with isActive true', async () => {
    await service.execute({
      entityType: 'Unit',
      action: BulkActionType.UPDATE_STATUS,
      ids: ['u1'],
    });

    expect(mocks.units.update).toHaveBeenCalledWith('u1', { isActive: true });
  });

  it('deletes through the owning module for every delete-capable entity', async () => {
    const cases: Array<[string, jest.Mock]> = [
      ['AttributeDefinition', mocks.attributes.deleteDefinition],
      ['Category', mocks.categories.delete],
      ['Component', mocks.components.delete],
      ['Manufacturer', mocks.manufacturers.delete],
      ['Supplier', mocks.suppliers.delete],
      ['Location', mocks.locations.delete],
      ['Unit', mocks.units.delete],
      ['Role', mocks.roles.delete],
      ['BOM', mocks.boms.delete],
      ['WorkOrder', mocks.productionOrders.delete],
      ['PurchaseOrder', mocks.purchaseOrders.delete],
    ];

    for (const [entityType, deleteMethod] of cases) {
      await service.execute({
        entityType,
        action: BulkActionType.DELETE,
        ids: ['id-1'],
      });

      expect(deleteMethod).toHaveBeenCalledWith('id-1');
    }
  });

  it('keeps going when one record is refused', async () => {
    mocks.components.delete
      .mockRejectedValueOnce(new DomainError('Component is consolidated.'))
      .mockResolvedValueOnce(undefined);

    const result = await service.execute({
      entityType: 'Component',
      action: BulkActionType.DELETE,
      ids: ['refused', 'ok'],
    });

    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.results[0]).toEqual({
      id: 'refused',
      outcome: 'SKIPPED',
      reason: 'Component is consolidated.',
    });
    expect(result.results[1]?.outcome).toBe('APPLIED');
  });

  it('treats a not-found record as skipped, not as a failure', async () => {
    mocks.categories.delete.mockRejectedValueOnce(
      new NotFoundException('Category "gone" not found.'),
    );

    const result = await service.execute({
      entityType: 'Category',
      action: BulkActionType.DELETE,
      ids: ['gone'],
    });

    expect(result.skippedCount).toBe(1);
    expect(result.results[0]?.reason).toBe('Category "gone" not found.');
  });

  it('reports an unexpected error as failed', async () => {
    mocks.units.delete.mockRejectedValueOnce(new Error('connection reset'));

    const result = await service.execute({
      entityType: 'Unit',
      action: BulkActionType.DELETE,
      ids: ['u1'],
    });

    expect(result.failedCount).toBe(1);
    expect(result.results[0]).toEqual({
      id: 'u1',
      outcome: 'FAILED',
      reason: 'connection reset',
    });
  });

  it('classifies refusals, failures and unknown throws', () => {
    expect(classifyBulkActionFailure(new DomainError('rule said no'))).toEqual({
      outcome: 'SKIPPED',
      reason: 'rule said no',
    });
    expect(
      classifyBulkActionFailure(new BadRequestException('only DRAFT')),
    ).toEqual({ outcome: 'SKIPPED', reason: 'only DRAFT' });
    expect(classifyBulkActionFailure(new Error('boom'))).toEqual({
      outcome: 'FAILED',
      reason: 'boom',
    });
    expect(classifyBulkActionFailure('not an error')).toEqual({
      outcome: 'FAILED',
      reason: 'Unknown error',
    });
  });
});
