import { InventoryTransactionsController } from './inventory-transactions.controller';
import { InventoryTransactionsService } from './inventory-transactions.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { TransactionType } from '@ananya/inventory';

describe('InventoryTransactionsController', () => {
  let controller: InventoryTransactionsController;
  let service: jest.Mocked<Partial<InventoryTransactionsService>>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({ id: 'tx-1' } as any),
    };
    controller = new InventoryTransactionsController(
      service as unknown as InventoryTransactionsService,
    );
  });

  it('binds createdBy strictly to req.user.id and ignores client-supplied createdBy', async () => {
    const req = {
      user: {
        id: 'real-actor-uuid',
        email: 'actor@example.com',
        roleName: 'Inventory Manager',
        permissions: ['Inventory.Update'],
      },
    } as AuthenticatedRequest;

    await controller.create(
      {
        componentId: 'comp-1',
        quantity: 10,
        unitOfMeasure: 'pcs',
        transactionType: TransactionType.Issue,
        createdBy: 'spoofed-attacker-uuid',
      },
      req,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'real-actor-uuid',
      }),
    );
  });
});
