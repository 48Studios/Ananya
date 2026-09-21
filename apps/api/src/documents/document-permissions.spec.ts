import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../permissions/permissions.service';
import { COMPONENT_WRITE_PERMISSION } from '../auth/component-write.guard';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import {
  DOCUMENT_READ_PERMISSION,
  DOCUMENT_WRITE_PERMISSION,
  DocumentReadGuard,
  DocumentWriteGuard,
} from './document-permissions';

function buildContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

/** Shared harness: both guards differ only in the permission they require. */
function buildGuard(
  guardClass: typeof DocumentReadGuard,
  getMeByToken: jest.Mock,
) {
  return Test.createTestingModule({
    providers: [
      guardClass,
      PermissionsService,
      { provide: AuthService, useValue: { getMeByToken } },
    ],
  }).compile();
}

describe('documentation authorization', () => {
  it('reads use Inventory.Read and writes reuse the component-write permission', () => {
    expect(DOCUMENT_READ_PERMISSION).toBe('Inventory.Read');
    expect(DOCUMENT_WRITE_PERMISSION).toBe('Inventory.Update');
    // Documentation writes must not be easier than component edits.
    expect(DOCUMENT_WRITE_PERMISSION).toBe(COMPONENT_WRITE_PERMISSION);
    expect(DOCUMENT_READ_PERMISSION).not.toBe(DOCUMENT_WRITE_PERMISSION);
  });

  describe('read guard', () => {
    let guard: InstanceType<typeof DocumentReadGuard>;
    let getMeByToken: jest.Mock;

    beforeEach(async () => {
      getMeByToken = jest.fn();
      const module: TestingModule = await buildGuard(
        DocumentReadGuard,
        getMeByToken,
      );
      guard = module.get(DocumentReadGuard);
    });

    it('rejects an unauthenticated request with 401 before any session lookup', async () => {
      await expect(
        guard.canActivate(buildContext({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(getMeByToken).not.toHaveBeenCalled();
    });

    it('rejects an invalid session with 401', async () => {
      getMeByToken.mockRejectedValue(new UnauthorizedException('expired'));
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer expired' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a disabled user with 401', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u1',
          email: 'a@b.c',
          status: 'DISABLED',
          roleName: 'Inventory Manager',
        },
        permissions: ['*'],
      });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('allows a viewer holding Inventory.Read and attaches the principal', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u2',
          email: 'viewer@48studios.local',
          status: 'ACTIVE',
          roleName: 'Viewer',
        },
        permissions: ['Inventory.Read'],
      });
      const request: AuthenticatedRequest = {
        headers: { authorization: 'Bearer token' },
      };

      await expect(guard.canActivate(buildContext(request))).resolves.toBe(
        true,
      );
      expect(request.user).toEqual({
        id: 'u2',
        email: 'viewer@48studios.local',
        roleName: 'Viewer',
        permissions: ['Inventory.Read'],
      });
    });

    it('rejects a caller without the read permission with 403 naming it', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u3',
          email: 'sales@48studios.local',
          status: 'ACTIVE',
          roleName: 'Sales',
        },
        permissions: ['SalesOrders.Read'],
      });

      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('write guard', () => {
    let guard: InstanceType<typeof DocumentWriteGuard>;
    let getMeByToken: jest.Mock;

    beforeEach(async () => {
      getMeByToken = jest.fn();
      const module: TestingModule = await buildGuard(
        DocumentWriteGuard,
        getMeByToken,
      );
      guard = module.get(DocumentWriteGuard);
    });

    it('refuses a read-only user with 403 naming Inventory.Update', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u4',
          email: 'viewer@48studios.local',
          status: 'ACTIVE',
          roleName: 'Viewer',
        },
        permissions: ['Inventory.Read'],
      });

      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toThrow(/Inventory.Update/);
    });

    it('allows a component editor', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u5',
          email: 'engineer@48studios.local',
          status: 'ACTIVE',
          roleName: 'Inventory Manager',
        },
        permissions: ['Inventory.Read', 'Inventory.Update'],
      });

      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).resolves.toBe(true);
    });

    it('allows an administrator through the wildcard permission', async () => {
      getMeByToken.mockResolvedValue({
        user: {
          id: 'u6',
          email: 'admin@48studios.local',
          status: 'ACTIVE',
          roleName: 'Administrator',
        },
        permissions: ['*'],
      });

      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).resolves.toBe(true);
    });
  });
});
