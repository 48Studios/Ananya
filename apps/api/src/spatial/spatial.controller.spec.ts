/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { SpatialController } from './spatial.controller';
import {
  SpatialService,
  type LocationOperationalView,
} from './spatial.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { CanActivate, Type, ExecutionContext } from '@nestjs/common';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';

describe('SpatialController Security & Authorization Audit', () => {
  let controller: SpatialController;
  let mockSpatialService: jest.Mocked<Partial<SpatialService>>;

  beforeEach(() => {
    mockSpatialService = {
      getLocationOperationalView: jest.fn(),
      getModel: jest.fn(),
      getAllModels: jest.fn(),
      createModel: jest.fn(),
      updateModel: jest.fn(),
      deleteModel: jest.fn(),
      getAnchorsByModel: jest.fn(),
      createAnchor: jest.fn(),
      getAnchor: jest.fn(),
      updateAnchor: jest.fn(),
      deleteAnchor: jest.fn(),
      bulkSaveAnchors: jest.fn(),
      createNode: jest.fn(),
      getNode: jest.fn(),
      getNodeByLocation: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      getLocationMappingContext: jest.fn(),
      getLocationSpatialContext: jest.fn(),
      resolveComponentLocate: jest.fn(),
      resolveLocationLocate: jest.fn(),
    };

    controller = new SpatialController(mockSpatialService as SpatialService);
  });
  it('1. Confirms getLocationOperationalView is guarded with Inventory.Read', () => {
    const targetHandler =
      SpatialController.prototype.getLocationOperationalView;
    const guards = Reflect.getMetadata(GUARDS_METADATA, targetHandler) as
      Array<Type<CanActivate>> | undefined;

    expect(guards).toBeDefined();
    expect(guards!.length).toBeGreaterThan(0);

    const guard = guards![0];
    expect(guard).toBeDefined();
    const guardName = guard ? guard.name || guard.constructor?.name : '';
    expect(guardName).toContain('PermissionGuard');
  });

  describe('Guard Integration & Permission Enforcement for getLocationOperationalView', () => {
    let guardInstance: CanActivate;
    let mockAuthService: { getMeByToken: jest.Mock };

    function buildContext(request: AuthenticatedRequest): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;
    }

    beforeEach(async () => {
      mockAuthService = {
        getMeByToken: jest.fn(),
      };

      const targetHandler =
        SpatialController.prototype.getLocationOperationalView;
      const guards = Reflect.getMetadata(GUARDS_METADATA, targetHandler) as
        Array<Type<CanActivate>> | undefined;
      const GuardClass = guards?.[0];
      if (!GuardClass) {
        throw new Error('Expected GuardClass on getLocationOperationalView');
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GuardClass,
          PermissionsService,
          { provide: AuthService, useValue: mockAuthService },
        ],
      }).compile();

      guardInstance = module.get<CanActivate>(GuardClass);
    });

    it('rejects anonymous request with 401 Unauthorized', async () => {
      const context = buildContext({ headers: {} });
      await expect(guardInstance.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockAuthService.getMeByToken).not.toHaveBeenCalled();
    });

    it('rejects request with invalid/expired token with 401 Unauthorized', async () => {
      mockAuthService.getMeByToken.mockRejectedValue(
        new UnauthorizedException('Session expired or invalid.'),
      );
      const context = buildContext({
        headers: { authorization: 'Bearer invalid-token' },
      });
      await expect(guardInstance.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects authenticated caller without Inventory.Read with 403 Forbidden', async () => {
      mockAuthService.getMeByToken.mockResolvedValue({
        user: {
          id: 'user-auditor',
          email: 'auditor@example.com',
          status: 'ACTIVE',
          roleName: 'Auditor',
        },
        permissions: ['Sales.Read', 'Finance.Read'],
      });
      const context = buildContext({
        headers: { authorization: 'Bearer valid-auditor-token' },
      });
      await expect(guardInstance.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guardInstance.canActivate(context)).rejects.toThrow(
        /Inventory\.Read/,
      );
    });

    it('allows authenticated caller with Inventory.Read and attaches user to request', async () => {
      mockAuthService.getMeByToken.mockResolvedValue({
        user: {
          id: 'user-wh',
          email: 'warehouse@example.com',
          status: 'ACTIVE',
          roleName: 'Warehouse Manager',
        },
        permissions: ['Inventory.Read', 'Locations.Read'],
      });
      const req: AuthenticatedRequest = {
        headers: { authorization: 'Bearer valid-wh-token' },
      };
      const context = buildContext(req);
      const result = await guardInstance.canActivate(context);

      expect(result).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe('user-wh');
      expect(req.user?.permissions).toContain('Inventory.Read');
    });

    it('allows caller with global wildcard or domain wildcard permissions', async () => {
      mockAuthService.getMeByToken.mockResolvedValue({
        user: {
          id: 'user-admin',
          email: 'admin@example.com',
          status: 'ACTIVE',
          roleName: 'Administrator',
        },
        permissions: ['*'],
      });
      const req: AuthenticatedRequest = {
        headers: { authorization: 'Bearer admin-token' },
      };
      const context = buildContext(req);
      const result = await guardInstance.canActivate(context);
      expect(result).toBe(true);
    });

    it('evaluates pre-authenticated user on request directly', async () => {
      // User already populated by upstream middleware
      const contextAllowed = buildContext({
        user: {
          id: 'user-wh',
          email: 'wh@example.com',
          roleName: 'Manager',
          permissions: ['Inventory.Read'],
        },
      });
      expect(await guardInstance.canActivate(contextAllowed)).toBe(true);

      const contextForbidden = buildContext({
        user: {
          id: 'user-guest',
          email: 'guest@example.com',
          roleName: 'Guest',
          permissions: ['Maintenance.Read'],
        },
      });
      await expect(guardInstance.canActivate(contextForbidden)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('2. Confirms all query and mutation routes have explicit permission guards', () => {
    const prototype = SpatialController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (m) => m !== 'constructor' && typeof prototype[m] === 'function',
    );

    expect(methodNames.length).toBeGreaterThanOrEqual(15);

    for (const methodName of methodNames) {
      const handler = prototype[methodName];
      if (!handler) continue;
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
      expect(guards).toBeDefined();
      expect((guards as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('3. Delegates getLocationOperationalView to SpatialService', async () => {
    const mockView: LocationOperationalView = {
      parent: {
        location: {
          id: 'loc-1',
          code: 'CAB-1',
          name: 'Cabinet 1',
          kind: 'cabinet',
          parentId: null,
          isActive: true,
          metadata: {},
        },
        node: null,
        model: null,
        anchors: [],
        mapping: {
          status: 'ROOT',
          isMappingEligible: false,
          hasSpatialNode: false,
          directChildCount: 0,
          mappedDirectChildCount: 0,
          unmappedDirectChildCount: 0,
          containerStatus: 'NONE',
          publishedLayout: null,
          slotMapping: null,
        },
      },
      children: [],
      descendantLocations: [],
      projections: [],
    };

    (
      mockSpatialService.getLocationOperationalView as jest.Mock
    ).mockResolvedValue(mockView);

    const result = await controller.getLocationOperationalView('loc-1');
    expect(result).toBe(mockView);
    expect(mockSpatialService.getLocationOperationalView).toHaveBeenCalledWith(
      'loc-1',
    );
  });
});
