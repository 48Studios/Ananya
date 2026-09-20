import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  ComponentWriteGuard,
  COMPONENT_WRITE_PERMISSION,
  type AuthenticatedRequest,
} from './component-write.guard';

function buildContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ComponentWriteGuard', () => {
  let guard: ComponentWriteGuard;
  let getMeByToken: jest.Mock;

  const activeUser = {
    id: 'user-1',
    email: 'engineer@48studios.local',
    status: 'ACTIVE',
    roleName: 'Inventory Manager',
  };

  beforeEach(async () => {
    getMeByToken = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComponentWriteGuard,
        // The real permissions service is dependency-free, so the permission
        // semantics under test (`*`, exact, `Domain.*`) are the production ones.
        PermissionsService,
        { provide: AuthService, useValue: { getMeByToken } },
      ],
    }).compile();

    guard = module.get(ComponentWriteGuard);
  });

  it('requires Inventory.Update, the existing component-write permission', () => {
    expect(COMPONENT_WRITE_PERMISSION).toBe('Inventory.Update');
  });

  describe('missing or invalid credentials', () => {
    it('rejects a request with no Authorization header', async () => {
      await expect(
        guard.canActivate(buildContext({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(getMeByToken).not.toHaveBeenCalled();
    });

    it('rejects a blank bearer token', async () => {
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer   ' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-bearer authorization value', async () => {
      getMeByToken.mockRejectedValue(new UnauthorizedException('nope'));
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer bad' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an invalid or expired session', async () => {
      getMeByToken.mockRejectedValue(new UnauthorizedException('expired'));
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer expired-token' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a disabled account holding a valid session', async () => {
      getMeByToken.mockResolvedValue({
        user: { ...activeUser, status: 'DISABLED' },
        permissions: ['*'],
      });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('insufficient permission', () => {
    it('rejects a read-only user', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['Inventory.Read', 'Reports.Read'],
      });

      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an empty permission set', async () => {
      getMeByToken.mockResolvedValue({ user: activeUser, permissions: [] });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sufficient permission', () => {
    it('allows a user with Inventory.Update', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['Inventory.Read', 'Inventory.Update'],
      });
      const request: AuthenticatedRequest = {
        headers: { authorization: 'Bearer token' },
      };

      await expect(guard.canActivate(buildContext(request))).resolves.toBe(
        true,
      );
      expect(request.user).toEqual({
        id: 'user-1',
        email: 'engineer@48studios.local',
        roleName: 'Inventory Manager',
        permissions: ['Inventory.Read', 'Inventory.Update'],
      });
    });

    it('allows a wildcard administrator', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['*'],
      });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).resolves.toBe(true);
    });

    it('allows a domain wildcard', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['Inventory.*'],
      });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).resolves.toBe(true);
    });

    it('does not allow an unrelated domain wildcard', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['PurchaseOrders.*'],
      });
      await expect(
        guard.canActivate(
          buildContext({ headers: { authorization: 'Bearer token' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts a lowercase bearer scheme', async () => {
      getMeByToken.mockResolvedValue({
        user: activeUser,
        permissions: ['Inventory.Update'],
      });
      const request: AuthenticatedRequest = {
        headers: { authorization: 'bearer token' },
      };
      await expect(guard.canActivate(buildContext(request))).resolves.toBe(
        true,
      );
      expect(getMeByToken).toHaveBeenCalledWith('token');
    });
  });
});
