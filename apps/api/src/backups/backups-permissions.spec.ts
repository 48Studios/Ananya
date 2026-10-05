import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';

function buildContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('Backups Granular Authorization & Least Privilege', () => {
  let permissionsService: PermissionsService;
  let getMeByToken: jest.Mock;

  const ReadGuard = createPermissionGuard(
    'Administration.Backups.Read',
    'view backups',
  );
  const CreateGuard = createPermissionGuard(
    'Administration.Backups.Create',
    'manage backup jobs',
  );
  const RunGuard = createPermissionGuard(
    'Administration.Backups.Run',
    'execute backups',
  );
  const DeleteGuard = createPermissionGuard(
    'Administration.Backups.Delete',
    'delete backups',
  );
  const PreviewGuard = createPermissionGuard(
    'Administration.Backups.Restore.Preview',
    'preview restore',
  );
  const ExecuteGuard = createPermissionGuard(
    'Administration.Backups.Restore.Execute',
    'execute destructive restore',
  );

  let readGuard: InstanceType<typeof ReadGuard>;
  let createGuard: InstanceType<typeof CreateGuard>;
  let runGuard: InstanceType<typeof RunGuard>;
  let deleteGuard: InstanceType<typeof DeleteGuard>;
  let previewGuard: InstanceType<typeof PreviewGuard>;
  let executeGuard: InstanceType<typeof ExecuteGuard>;

  beforeEach(async () => {
    getMeByToken = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadGuard,
        CreateGuard,
        RunGuard,
        DeleteGuard,
        PreviewGuard,
        ExecuteGuard,
        PermissionsService,
        { provide: AuthService, useValue: { getMeByToken } },
      ],
    }).compile();

    permissionsService = module.get(PermissionsService);
    readGuard = module.get(ReadGuard);
    createGuard = module.get(CreateGuard);
    runGuard = module.get(RunGuard);
    deleteGuard = module.get(DeleteGuard);
    previewGuard = module.get(PreviewGuard);
    executeGuard = module.get(ExecuteGuard);
  });

  describe('0. Permission Registry', () => {
    it('registers all granular backup permissions in PermissionsService', () => {
      expect(permissionsService.getAllPermissions().map((p) => p.code)).toEqual(
        expect.arrayContaining([
          'Administration.Backups.Read',
          'Administration.Backups.Create',
          'Administration.Backups.Run',
          'Administration.Backups.Delete',
          'Administration.Backups.Restore.Preview',
          'Administration.Backups.Restore.Execute',
        ]),
      );
    });
  });

  describe('1. Unauthorized user', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const context = buildContext({ headers: {} });
      await expect(readGuard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(runGuard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(executeGuard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects requests with invalid session token with 401 Unauthorized', async () => {
      getMeByToken.mockResolvedValue(null);
      const context = buildContext({
        headers: { authorization: 'Bearer invalid-token' },
      });
      await expect(readGuard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('2. Read-only user', () => {
    const readOnlyUser = {
      id: 'ro-user',
      email: 'readonly@example.com',
      roleName: 'Auditor',
      permissions: ['Administration.Backups.Read'],
    };

    it('allows read operations', async () => {
      const context = buildContext({ user: readOnlyUser });
      expect(await readGuard.canActivate(context)).toBe(true);
    });

    it('forbids backup creation/run (403)', async () => {
      const context = buildContext({ user: readOnlyUser });
      await expect(runGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(createGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forbids artifact deletion (403)', async () => {
      const context = buildContext({ user: readOnlyUser });
      await expect(deleteGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forbids restore preview and destructive restore (403)', async () => {
      const context = buildContext({ user: readOnlyUser });
      await expect(previewGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(executeGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('3. Backup operator', () => {
    const backupOperator = {
      id: 'backup-op',
      email: 'operator@example.com',
      roleName: 'Backup Operator',
      permissions: [
        'Administration.Backups.Read',
        'Administration.Backups.Create',
        'Administration.Backups.Run',
      ],
    };

    it('allows read, create, and run operations', async () => {
      const context = buildContext({ user: backupOperator });
      expect(await readGuard.canActivate(context)).toBe(true);
      expect(await createGuard.canActivate(context)).toBe(true);
      expect(await runGuard.canActivate(context)).toBe(true);
    });

    it('forbids destructive restore execution (403)', async () => {
      const context = buildContext({ user: backupOperator });
      await expect(executeGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forbids artifact deletion without delete permission (403)', async () => {
      const context = buildContext({ user: backupOperator });
      await expect(deleteGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('4. Restore operator', () => {
    const restoreOperator = {
      id: 'restore-op',
      email: 'restore@example.com',
      roleName: 'Restore Specialist',
      permissions: [
        'Administration.Backups.Read',
        'Administration.Backups.Restore.Preview',
        'Administration.Backups.Restore.Execute',
      ],
    };

    it('allows read, preview, and destructive restore execution', async () => {
      const context = buildContext({ user: restoreOperator });
      expect(await readGuard.canActivate(context)).toBe(true);
      expect(await previewGuard.canActivate(context)).toBe(true);
      expect(await executeGuard.canActivate(context)).toBe(true);
    });

    it('forbids scheduled job creation and deletion (403)', async () => {
      const context = buildContext({ user: restoreOperator });
      await expect(createGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(deleteGuard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('5. Administrator', () => {
    it('allows administrator with wildcard (*) to perform all operations', async () => {
      const admin = {
        id: 'admin-user',
        email: 'admin@example.com',
        roleName: 'Administrator',
        permissions: ['*'],
      };
      const context = buildContext({ user: admin });
      expect(await readGuard.canActivate(context)).toBe(true);
      expect(await createGuard.canActivate(context)).toBe(true);
      expect(await runGuard.canActivate(context)).toBe(true);
      expect(await deleteGuard.canActivate(context)).toBe(true);
      expect(await previewGuard.canActivate(context)).toBe(true);
      expect(await executeGuard.canActivate(context)).toBe(true);
    });

    it('allows administrator with Administration.Settings to access backup routes', async () => {
      const settingsAdmin = {
        id: 'settings-admin',
        email: 'admin2@example.com',
        roleName: 'Administrator',
        permissions: ['Administration.Settings'],
      };
      const context = buildContext({ user: settingsAdmin });
      expect(await readGuard.canActivate(context)).toBe(true);
      expect(await createGuard.canActivate(context)).toBe(true);
      expect(await runGuard.canActivate(context)).toBe(true);
      expect(await deleteGuard.canActivate(context)).toBe(true);
      expect(await previewGuard.canActivate(context)).toBe(true);
      expect(await executeGuard.canActivate(context)).toBe(true);
    });
  });
});
