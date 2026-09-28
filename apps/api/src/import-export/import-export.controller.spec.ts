import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { ExportFormat, type UploadedFileObj } from './dtos';

describe('ImportExportController', () => {
  let controller: ImportExportController;
  let service: jest.Mocked<Partial<ImportExportService>>;
  let permissionsService: PermissionsService;

  const mockFile: UploadedFileObj = {
    originalname: 'test.csv',
    buffer: Buffer.from('id,name\n1,test'),
    size: 14,
    mimetype: 'text/csv',
  };

  beforeEach(() => {
    service = {
      executeImport: jest.fn().mockResolvedValue({
        success: true,
        entityType: 'Component',
        totalRows: 1,
        successCount: 1,
        errorCount: 0,
      } as any),
      previewImport: jest.fn().mockResolvedValue({
        entityType: 'Component',
        totalRows: 1,
        headers: ['id', 'name'],
        previewRows: [],
      } as any),
      getTemplate: jest
        .fn()
        .mockReturnValue({ entityType: 'Component', headers: [] } as any),
      executeExport: jest.fn().mockResolvedValue({
        fileContent: 'csv-data',
        fileName: 'export.csv',
        contentType: 'text/csv',
        recordCount: 1,
      }),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    permissionsService = new PermissionsService();
    controller = new ImportExportController(
      service as unknown as ImportExportService,
      permissionsService,
    );
  });

  it('rejects import execution on unknown entity type with BadRequestException (fails closed)', async () => {
    const req = {
      user: {
        id: 'user-admin',
        email: 'admin@example.com',
        roleName: 'Administrator',
        permissions: ['*'],
      },
    } as AuthenticatedRequest;

    await expect(
      controller.executeImport(mockFile, 'UnknownEntity', '{}', req),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects import execution for User when caller only has Inventory.Update', async () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'inventory@example.com',
        roleName: 'Inventory Manager',
        permissions: ['Inventory.Update', 'Inventory.Read'],
      },
    } as AuthenticatedRequest;

    await expect(
      controller.executeImport(mockFile, 'User', '{}', req),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects import execution for Role when caller only has Inventory.Update', async () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'inventory@example.com',
        roleName: 'Inventory Manager',
        permissions: ['Inventory.Update', 'Inventory.Read'],
      },
    } as AuthenticatedRequest;

    await expect(
      controller.executeImport(mockFile, 'Role', '{}', req),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows import execution for User when caller has Administration.Users', async () => {
    const req = {
      user: {
        id: 'user-admin',
        email: 'admin@example.com',
        roleName: 'User Admin',
        permissions: ['Administration.Users'],
      },
    } as AuthenticatedRequest;

    const result = await controller.executeImport(mockFile, 'User', '{}', req);
    expect(result).toBeDefined();
    expect(service.executeImport).toHaveBeenCalled();
  });

  it('allows import execution for Role when caller has Administration.Roles', async () => {
    const req = {
      user: {
        id: 'user-admin',
        email: 'admin@example.com',
        roleName: 'Role Admin',
        permissions: ['Administration.Roles'],
      },
    } as AuthenticatedRequest;

    const result = await controller.executeImport(mockFile, 'Role', '{}', req);
    expect(result).toBeDefined();
    expect(service.executeImport).toHaveBeenCalled();
  });

  it('allows import execution for Component when caller has Inventory.Update', async () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'inventory@example.com',
        roleName: 'Inventory Manager',
        permissions: ['Inventory.Update'],
      },
    } as AuthenticatedRequest;

    const result = await controller.executeImport(
      mockFile,
      'Component',
      '{}',
      req,
    );
    expect(result).toBeDefined();
    expect(service.executeImport).toHaveBeenCalled();
  });

  it('rejects export of User data when caller lacks Administration.Users', async () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'auditor@example.com',
        roleName: 'Auditor',
        permissions: ['Reports.Export'],
      },
    } as AuthenticatedRequest;

    await expect(
      controller.executeExport(
        { entityType: 'User', format: ExportFormat.CSV },
        req,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
