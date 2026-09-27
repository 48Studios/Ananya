import { ForbiddenException } from '@nestjs/common';
import { BulkActionsController } from './bulk-actions.controller';
import { BulkActionService } from './bulk-action.service';
import { PermissionsService } from '../permissions/permissions.service';
import { BulkActionType } from './dtos';
import type { AuthenticatedRequest } from '../auth/permission.guard';

describe('BulkActionsController', () => {
  let controller: BulkActionsController;
  let bulkActionService: jest.Mocked<Partial<BulkActionService>>;
  let permissionsService: PermissionsService;

  beforeEach(() => {
    bulkActionService = {
      execute: jest.fn().mockResolvedValue({
        entityType: 'Role',
        action: BulkActionType.DELETE,
        requestedCount: 1,
        appliedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        results: [],
      }),
      getSupport: jest.fn(),
    };
    permissionsService = new PermissionsService();
    controller = new BulkActionsController(
      bulkActionService as unknown as BulkActionService,
      permissionsService,
    );
  });

  it('rejects bulk action on Role when user only has Inventory.Update permission', async () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        roleName: 'Standard',
        permissions: ['Inventory.Update'],
      },
    } as AuthenticatedRequest;

    expect(() =>
      controller.executeBulkAction(
        {
          entityType: 'Role',
          action: BulkActionType.DELETE,
          ids: ['role-1'],
        },
        req,
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows bulk action on Role when user has Administration.Roles permission', async () => {
    const req = {
      user: {
        id: 'user-admin',
        email: 'admin@example.com',
        roleName: 'Administrator',
        permissions: ['Administration.Roles'],
      },
    } as AuthenticatedRequest;

    const result = await controller.executeBulkAction(
      {
        entityType: 'Role',
        action: BulkActionType.DELETE,
        ids: ['role-1'],
      },
      req,
    );

    expect(result).toBeDefined();
    expect(bulkActionService.execute).toHaveBeenCalled();
  });

  it('rejects bulk action on PurchaseOrder when user lacks PurchaseOrders.Update', () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        roleName: 'Standard',
        permissions: ['Inventory.Update'],
      },
    } as AuthenticatedRequest;

    expect(() =>
      controller.executeBulkAction(
        {
          entityType: 'PurchaseOrder',
          action: BulkActionType.DELETE,
          ids: ['po-1'],
        },
        req,
      ),
    ).toThrow(ForbiddenException);
  });
});
