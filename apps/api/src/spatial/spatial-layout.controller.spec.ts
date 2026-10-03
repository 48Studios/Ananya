/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import 'reflect-metadata';
import { SpatialLayoutController } from './spatial-layout.controller';
import { SpatialLayoutService } from './spatial-layout.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { CanActivate, Type } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import type {
  CreateSpatialLayoutDto,
  UpdateSpatialLayoutDto,
  PublishSpatialLayoutDto,
  ArchiveSpatialLayoutDto,
} from './dtos';

describe('SpatialLayoutController Security & Delegation Audit', () => {
  let controller: SpatialLayoutController;
  let mockService: jest.Mocked<Partial<SpatialLayoutService>>;

  beforeEach(() => {
    mockService = {
      createLayout: jest.fn(),
      getLayout: jest.fn(),
      getLayoutsByParent: jest.fn(),
      getActiveLayoutByParent: jest.fn(),
      updateLayout: jest.fn(),
      publishLayout: jest.fn(),
      archiveLayout: jest.fn(),
      getRevisions: jest.fn(),
      getRevisionByNumber: jest.fn(),
      deleteLayout: jest.fn(),
    };

    controller = new SpatialLayoutController(
      mockService as SpatialLayoutService,
    );
  });

  function getGuards(target: object): Array<Type<CanActivate>> {
    return (
      (Reflect.getMetadata(GUARDS_METADATA, target) as Array<
        Type<CanActivate>
      >) || []
    );
  }

  it('1. Verifies all controller endpoints have permission guards', () => {
    const endpoints = [
      SpatialLayoutController.prototype.createLayout,
      SpatialLayoutController.prototype.getAllLayouts,
      SpatialLayoutController.prototype.getLayoutsByParent,
      SpatialLayoutController.prototype.getActiveLayoutByParent,
      SpatialLayoutController.prototype.getLayoutById,
      SpatialLayoutController.prototype.updateLayout,
      SpatialLayoutController.prototype.publishLayout,
      SpatialLayoutController.prototype.archiveLayout,
      SpatialLayoutController.prototype.getRevisions,
      SpatialLayoutController.prototype.getRevisionByNumber,
      SpatialLayoutController.prototype.deleteLayout,
    ];

    for (const endpoint of endpoints) {
      const guards = getGuards(endpoint);
      expect(guards.length).toBeGreaterThan(0);
      const guardName = guards[0]?.name || guards[0]?.constructor?.name || '';
      expect(guardName).toContain('PermissionGuard');
    }
  });

  it('2. Delegates createLayout to service with authenticated userId', async () => {
    const dto: CreateSpatialLayoutDto = {
      code: 'CAB-01',
      name: 'Test Cabinet',
      parentLocationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      templateType: 'SMD_DRAWER_CABINET',
      config: { widthMm: 1000 },
    };
    const req = { user: { id: 'user-123' } } as unknown as AuthenticatedRequest;
    const expectedResult = {
      id: 'layout-1',
      ...dto,
      revision: 1,
      status: 'DRAFT',
    } as any;

    (mockService.createLayout as jest.Mock).mockResolvedValue(expectedResult);

    const result = await controller.createLayout(dto, req);
    expect(mockService.createLayout).toHaveBeenCalledWith(dto, 'user-123');
    expect(result).toBe(expectedResult);
  });

  it('3. Delegates getLayoutById to service', async () => {
    const expectedResult = { id: 'layout-1', name: 'Test' } as any;
    (mockService.getLayout as jest.Mock).mockResolvedValue(expectedResult);

    const result = await controller.getLayoutById('layout-1');
    expect(mockService.getLayout).toHaveBeenCalledWith('layout-1');
    expect(result).toBe(expectedResult);
  });

  it('4. Delegates updateLayout to service with expectedRevision and userId', async () => {
    const dto: UpdateSpatialLayoutDto = {
      expectedRevision: 1,
      changeDescription: 'Updated config',
    };
    const req = { user: { id: 'user-456' } } as unknown as AuthenticatedRequest;
    const expectedResult = { id: 'layout-1', revision: 2 } as any;

    (mockService.updateLayout as jest.Mock).mockResolvedValue(expectedResult);

    const result = await controller.updateLayout('layout-1', dto, req);
    expect(mockService.updateLayout).toHaveBeenCalledWith(
      'layout-1',
      dto,
      'user-456',
    );
    expect(result).toBe(expectedResult);
  });

  it('5. Delegates publishLayout to service with overwriteManualSpatialNodes flag', async () => {
    const dto: PublishSpatialLayoutDto = {
      expectedRevision: 2,
      overwriteManualSpatialNodes: true,
      changeDescription: 'Publishing to production',
    };
    const req = { user: { id: 'user-789' } } as unknown as AuthenticatedRequest;
    const expectedResult = {
      id: 'layout-1',
      status: 'PUBLISHED',
      revision: 3,
    } as any;

    (mockService.publishLayout as jest.Mock).mockResolvedValue(expectedResult);

    const result = await controller.publishLayout('layout-1', dto, req);
    expect(mockService.publishLayout).toHaveBeenCalledWith(
      'layout-1',
      dto,
      'user-789',
    );
    expect(result).toBe(expectedResult);
  });

  it('6. Delegates archiveLayout to service', async () => {
    const dto: ArchiveSpatialLayoutDto = {
      expectedRevision: 3,
      changeDescription: 'Archived layout',
    };
    const req = { user: { id: 'user-789' } } as unknown as AuthenticatedRequest;
    const expectedResult = {
      id: 'layout-1',
      status: 'ARCHIVED',
      revision: 4,
    } as any;

    (mockService.archiveLayout as jest.Mock).mockResolvedValue(expectedResult);

    const result = await controller.archiveLayout('layout-1', dto, req);
    expect(mockService.archiveLayout).toHaveBeenCalledWith(
      'layout-1',
      dto,
      'user-789',
    );
    expect(result).toBe(expectedResult);
  });

  it('7. Delegates revisions query with parsed integer revisionNumber', async () => {
    const revisions: Array<{ id: string; revisionNumber: number }> = [
      { id: 'rev-1', revisionNumber: 1 },
    ];
    (mockService.getRevisions as jest.Mock).mockResolvedValue(revisions);
    (mockService.getRevisionByNumber as jest.Mock).mockResolvedValue(
      revisions[0],
    );

    const revList = await controller.getRevisions('layout-1');
    expect(mockService.getRevisions).toHaveBeenCalledWith('layout-1');
    expect(revList).toBe(revisions);

    const singleRev = await controller.getRevisionByNumber('layout-1', 1);
    expect(mockService.getRevisionByNumber).toHaveBeenCalledWith('layout-1', 1);
    expect(singleRev).toBe(revisions[0]);
  });
});
