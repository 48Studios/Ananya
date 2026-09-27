import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  users,
  userSessions,
  securityAuditLogs,
  roles,
} from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import { FixtureOwner } from '../fixtures/fixture-owner';

describe('Security Remediation Phase 1 & 2 (Integration Specs)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;

  const owner = new FixtureOwner('sec-remed');

  let adminToken = '';
  let auditorToken = '';
  let inventoryUserToken = '';
  let userManagerToken = '';

  let adminRole: { id: string; name: string } | undefined;
  let adminUser: { id: string; email: string };
  let auditorUser: { id: string; email: string };
  let inventoryUser: { id: string; email: string };
  let userManagerUser: { id: string; email: string };

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authService = app.get(AuthService);
    rolesService = app.get(RolesService);
    usersService = app.get(UsersService);

    // 1. Roles
    [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Administrator'))
      .limit(1);

    const auditorRole = await owner.createRole(rolesService, [
      'Reports.Read',
      'Reports.Export',
      'Administration.Security',
    ]);
    const inventoryRole = await owner.createRole(rolesService, [
      'Inventory.Read',
      'Inventory.Update',
    ]);
    const userManagerRole = await owner.createRole(rolesService, [
      'Administration.Users',
    ]);

    // 2. Users
    adminUser = await owner.createUser(usersService, adminRole!.id, 'sec-admin');
    auditorUser = await owner.createUser(
      usersService,
      auditorRole.id,
      'sec-auditor',
    );
    inventoryUser = await owner.createUser(
      usersService,
      inventoryRole.id,
      'sec-inv',
    );
    userManagerUser = await owner.createUser(
      usersService,
      userManagerRole.id,
      'sec-usermgr',
    );

    // 3. Sessions
    adminToken = (await authService.createSessionForUser(adminUser.id)).token;
    auditorToken = (await authService.createSessionForUser(auditorUser.id)).token;
    inventoryUserToken = (
      await authService.createSessionForUser(inventoryUser.id)
    ).token;
    userManagerToken = (
      await authService.createSessionForUser(userManagerUser.id)
    ).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    if (owner) {
      await owner.cleanup();
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  describe('1. Global Fail-Closed Authentication Perimeter (SEC-01)', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      if (!hasDbUrl) return;

      const endpoints = [
        { method: 'get', path: '/users' },
        { method: 'get', path: '/roles' },
        { method: 'get', path: '/settings/system' },
        { method: 'post', path: '/settings/organization/reset' },
        { method: 'post', path: '/import-export/bulk-action' },
        { method: 'get', path: '/security/audit' },
      ];

      for (const ep of endpoints) {
        const res = await (http() as any)[ep.method](ep.path);
        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(
          /Authentication is required|invalid or has expired/i,
        );
      }
    });

    it('permits explicitly public endpoints without token', async () => {
      if (!hasDbUrl) return;

      const healthRes = await http().get('/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.status).toBe('ok');

      const setupRes = await http().get('/auth/setup-status');
      expect(setupRes.status).toBe(200);
      expect(typeof setupRes.body.isCompleted).toBe('boolean');
    });
  });

  describe('2. Security Audit Trail & Secret Protection (SEC-03)', () => {
    it('denies audit log access to non-auditors with 403', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get('/security/audit')
        .set('Authorization', `Bearer ${inventoryUserToken}`);
      expect(res.status).toBe(403);
    });

    it('allows audit log access to users with Administration.Security permission', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get('/security/audit')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('never logs plaintext password reset tokens in audit details', async () => {
      if (!hasDbUrl) return;

      await authService.requestPasswordReset({ email: inventoryUser.email });

      const [latestAudit] = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'PASSWORD_RESET_REQUESTED'))
        .orderBy(desc(securityAuditLogs.createdAt))
        .limit(1);

      expect(latestAudit).toBeDefined();
      const details = latestAudit!.details as Record<string, any>;
      expect(details).toBeDefined();
      // Must NOT contain resetToken
      expect(details.resetToken).toBeUndefined();
      // Must contain safe tokenFingerprint
      expect(details.tokenFingerprint).toBeDefined();
      expect(typeof details.tokenFingerprint).toBe('string');
      expect(details.tokenFingerprint.length).toBe(8);
    });
  });

  describe('3. User Management & Admin Reset Password (SEC-02)', () => {
    it('rejects unauthenticated admin password reset', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post(`/users/${inventoryUser.id}/reset-password`)
        .send({ newPassword: 'NewSecurePassword123!' });
      expect(res.status).toBe(401);
    });

    it('denies user without Administration.Users permission', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post(`/users/${inventoryUser.id}/reset-password`)
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({ newPassword: 'NewSecurePassword123!' });
      expect(res.status).toBe(403);
    });

    it('revokes active sessions upon administrative password reset', async () => {
      if (!hasDbUrl) return;

      // Verify inventoryUser has active session
      const sessionsBefore = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, inventoryUser.id));
      expect(sessionsBefore.length).toBeGreaterThan(0);

      // Admin resets inventoryUser's password
      const res = await http()
        .post(`/users/${inventoryUser.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'BrandNewPassword123!' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify sessions are invalidated
      const sessionsAfter = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, inventoryUser.id));
      expect(sessionsAfter.length).toBe(0);

      // Old token must now fail
      const authCheckRes = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${inventoryUserToken}`);
      expect(authCheckRes.status).toBe(401);

      // Refresh token for remaining tests
      inventoryUserToken = (
        await authService.createSessionForUser(inventoryUser.id)
      ).token;
    });

    it('prevents non-Administrators from resetting Administrator accounts', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post(`/users/${adminUser.id}/reset-password`)
        .set('Authorization', `Bearer ${userManagerToken}`)
        .send({ newPassword: 'MaliciousReset123!' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Only Administrators/i);
    });
  });

  describe('4. Invitations Security (SEC-04)', () => {
    it('denies anonymous user invitation creation', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/auth/invitations')
        .send({ email: 'intruder@test.local', role: 'Administrator' });
      expect(res.status).toBe(401);
    });

    it('denies non-Administrators from inviting Administrator role', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/auth/invitations')
        .set('Authorization', `Bearer ${userManagerToken}`)
        .send({ email: 'newadmin@test.local', roleId: adminRole!.id });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(
        /Only Administrators can invite users with the Administrator role/i,
      );
    });
  });

  describe('5. Organization Reset Hardening (SEC-05)', () => {
    it('denies unauthenticated reset requests', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/settings/organization/reset')
        .send({
          confirmText: 'RESET MY ORGANIZATION',
          passwordConfirm: 'wrong',
        });
      expect(res.status).toBe(401);
    });

    it('denies non-admin users even with matching confirmation text', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/settings/organization/reset')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          confirmText: 'RESET MY ORGANIZATION',
          passwordConfirm: 'any',
        });
      expect(res.status).toBe(403);
    });

    it('denies Auditor users who only hold Administration.Security', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/settings/organization/reset')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          confirmText: 'RESET MY ORGANIZATION',
          passwordConfirm: 'any',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('6. Role Management & Privilege Escalation (SEC-11)', () => {
    it('forbids modifying permissions on system roles', async () => {
      if (!hasDbUrl) return;

      const [systemRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'Administrator'))
        .limit(1);

      expect(systemRole).toBeDefined();
      const res = await http()
        .put(`/roles/${systemRole!.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: ['Inventory.Read'] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(
        /System role permissions cannot be modified/i,
      );
    });

    it('forbids non-Administrators from granting wildcard * permissions', async () => {
      if (!hasDbUrl) return;

      // Create a manager with Administration.Roles permission
      const rolesAdminRole = await owner.createRole(rolesService, [
        'Administration.Roles',
      ]);
      const rolesAdminUser = await owner.createUser(
        usersService,
        rolesAdminRole.id,
        'sec-rolesmgr',
      );
      const rolesAdminToken = (
        await authService.createSessionForUser(rolesAdminUser.id)
      ).token;

      const res = await http()
        .post('/roles')
        .set('Authorization', `Bearer ${rolesAdminToken}`)
        .send({
          name: owner.name('Wildcard Escalation'),
          permissions: ['*'],
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(
        /Only Administrators can grant wildcard/i,
      );
    });
  });

  describe('7. Bulk Actions Authorization (SEC-09)', () => {
    it('denies bulk delete on roles to non-Administrators', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/import-export/bulk-action')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          entityType: 'roles',
          action: 'DELETE',
          ids: ['00000000-0000-0000-0000-000000000001'],
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Administration\.Roles/i);
    });

    it('denies bulk delete on components to users without Inventory.Delete', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/import-export/bulk-action')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          entityType: 'components',
          action: 'DELETE',
          ids: ['00000000-0000-0000-0000-000000000001'],
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Inventory\.Delete/i);
    });

    it('rejects bulk action on unknown entity type with 400 (fails closed)', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/import-export/bulk-action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          entityType: 'UnknownResource',
          action: 'DELETE',
          ids: ['00000000-0000-0000-0000-000000000001'],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not supported for unknown entity/i);
    });
  });

  describe('8. Preferences IDOR Hardening (SEC-13)', () => {
    it('always operates on authenticated user regardless of forged userId query parameter', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get(`/preferences/dashboard?userId=${adminUser.id}`)
        .set('Authorization', `Bearer ${inventoryUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(inventoryUser.id);
      expect(res.body.userId).not.toBe(adminUser.id);
    });

    it('rejects unauthenticated preferences access with 401', async () => {
      if (!hasDbUrl) return;

      const res = await http().get('/preferences/dashboard');
      expect(res.status).toBe(401);
    });
  });

  describe('9. Notifications Cross-User Isolation (SEC-14)', () => {
    it('denies marking another user notification as read', async () => {
      if (!hasDbUrl) return;

      // Create a notification intended for admin
      const createRes = await http()
        .post('/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: adminUser.id,
          module: 'Administration',
          type: 'SYSTEM_ALERT',
          title: 'Admin secret alert',
          message: 'Sensitive message',
        });
      expect(createRes.status).toBe(201);
      const notifId = createRes.body.id;

      // Inventory user tries to mark admin's notification as read
      const markRes = await http()
        .patch(`/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${inventoryUserToken}`);

      expect(markRes.status).toBe(404);
      expect(markRes.body.message).toMatch(/not found or access denied/i);
    });

    it('ignores forged userId query parameter and returns only caller notifications', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get(`/notifications?userId=${adminUser.id}`)
        .set('Authorization', `Bearer ${inventoryUserToken}`);

      expect(res.status).toBe(200);
      const items = res.body as Array<{ userId: string }>;
      for (const item of items) {
        expect(item.userId).toBe(inventoryUser.id);
      }
    });
  });

  describe('10. Settings Mutations RBAC (SEC-15)', () => {
    it('denies updating organization settings to users without Administration.Settings', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .put('/settings/organization')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          companyName: 'Hacked Corp',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Administration\.Settings/i);
    });

    it('allows updating organization settings to Administrators', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .put('/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: 'Ananya Hardware Systems',
        });

      expect(res.status).toBe(200);
    });
  });

  describe('11. Search Privacy Boundary (SEC-16)', () => {
    it('omits user accounts and roles from search results for ordinary users', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get(`/search?q=${adminUser.email}`)
        .set('Authorization', `Bearer ${inventoryUserToken}`);

      expect(res.status).toBe(200);
      const results = res.body as Array<{ category: string }>;
      const hasAdminItems = results.some((r) => r.category === 'Administration');
      expect(hasAdminItems).toBe(false);
    });

    it('includes user accounts and roles in search results for Administrators', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get(`/search?q=${adminUser.email}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const results = res.body as Array<{ category: string }>;
      const hasAdminItems = results.some((r) => r.category === 'Administration');
      expect(hasAdminItems).toBe(true);
    });
  });

  describe('12. Complete RBAC Domain Coverage (SEC-21 / Phase 3.5)', () => {
    it('denies sales order creation to users without Sales.Create', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/sales-orders')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          customerId: 'cust-1',
          currency: 'USD',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Sales\.Create/i);
    });

    it('denies journal entry creation to users without Accounting.Create', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/journal-entries')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          date: new Date().toISOString(),
          description: 'Unauthorized Entry',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Accounting\.Create/i);
    });

    it('denies maintenance schedule creation to users without Maintenance.Manage', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/maintenance-schedules')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({
          title: 'Unauthorized Maintenance',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Maintenance\.Manage/i);
    });

    it('denies cycle count mutations to users without Inventory.Adjust', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .post('/cycle-counts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          name: 'Unauthorized Count',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires Inventory\.Adjust/i);
    });
  });
});

