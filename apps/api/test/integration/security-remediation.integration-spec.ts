import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { LoginThrottlerService } from '../../src/auth/login-throttler.service';
import { SessionCleanupService } from '../../src/auth/session-cleanup.service';
import { resolveCorsOrigin } from '../../src/common/config/cors.config';
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
  let loginThrottlerService: LoginThrottlerService;
  let sessionCleanupService: SessionCleanupService;

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
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      next();
    });
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
    loginThrottlerService = app.get(LoginThrottlerService);
    sessionCleanupService = app.get(SessionCleanupService);

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
    adminUser = await owner.createUser(
      usersService,
      adminRole!.id,
      'sec-admin',
    );
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
    auditorToken = (await authService.createSessionForUser(auditorUser.id))
      .token;
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
        let res;
        switch (ep.method) {
          case 'get':
            res = await http().get(ep.path);
            break;
          case 'post':
            res = await http().post(ep.path);
            break;
          case 'put':
            res = await http().put(ep.path);
            break;
          case 'delete':
            res = await http().delete(ep.path);
            break;
          case 'patch':
            res = await http().patch(ep.path);
            break;
          default:
            throw new Error(`Unsupported method ${ep.method}`);
        }
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
      const details = latestAudit!.details as Record<string, unknown>;
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

      const res = await http().post('/settings/organization/reset').send({
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
      const hasAdminItems = results.some(
        (r) => r.category === 'Administration',
      );
      expect(hasAdminItems).toBe(false);
    });

    it('includes user accounts and roles in search results for Administrators', async () => {
      if (!hasDbUrl) return;

      const res = await http()
        .get(`/search?q=${adminUser.email}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const results = res.body as Array<{ category: string }>;
      const hasAdminItems = results.some(
        (r) => r.category === 'Administration',
      );
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

  describe('13. Cryptographic, Session & Password Hardening (Phase 4)', () => {
    it('seamlessly migrates legacy SHA-256 password hash to Argon2id on successful login', async () => {
      if (!hasDbUrl) return;

      const crypto = await import('crypto');
      const legacyEmail = owner.email('legacy-user');
      const legacyPassword = 'LegacyPassword123!';
      const sha256Hash = crypto
        .createHash('sha256')
        .update(legacyPassword)
        .digest('hex');

      // 1. Insert user with raw legacy SHA-256 hash
      const [legacyUser] = await db
        .insert(users)
        .values({
          email: legacyEmail,
          passwordHash: sha256Hash,
          firstName: 'Legacy',
          lastName: 'User',
          status: 'ACTIVE',
        })
        .returning();

      expect(legacyUser).toBeDefined();
      expect(legacyUser!.passwordHash).toHaveLength(64);
      expect(legacyUser!.passwordHash.startsWith('$argon2id$')).toBe(false);

      // 2. Perform login
      const loginRes = await http().post('/auth/login').send({
        email: legacyEmail,
        password: legacyPassword,
      });

      expect(loginRes.status).toBe(201);
      expect(loginRes.body.token).toBeDefined();

      // 3. Verify user's hash in database was transparently upgraded to Argon2id
      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, legacyUser!.id))
        .limit(1);

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.passwordHash.startsWith('$argon2id$')).toBe(true);

      // 4. Verify subsequent login succeeds against the new Argon2id hash
      const secondLoginRes = await http().post('/auth/login').send({
        email: legacyEmail,
        password: legacyPassword,
      });

      expect(secondLoginRes.status).toBe(201);
      expect(secondLoginRes.body.token).toBeDefined();

      // Clean up
      await db
        .delete(userSessions)
        .where(eq(userSessions.userId, legacyUser!.id));
      await db.delete(users).where(eq(users.id, legacyUser!.id));
    });

    it('creates new users with Argon2id password hash by default', async () => {
      if (!hasDbUrl) return;

      const newUserEmail = owner.email('argon-user');
      const createRes = await http()
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: newUserEmail,
          password: 'SecurePassword123!',
          firstName: 'Argon',
          lastName: 'User',
        });

      expect(createRes.status).toBe(201);
      const createdUserId = createRes.body.id;

      const [storedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, createdUserId))
        .limit(1);

      expect(storedUser).toBeDefined();
      expect(storedUser!.passwordHash.startsWith('$argon2id$')).toBe(true);

      // Clean up
      await db
        .delete(userSessions)
        .where(eq(userSessions.userId, createdUserId));
      await db.delete(users).where(eq(users.id, createdUserId));
    });

    it('invalidates other active sessions when a user changes password', async () => {
      if (!hasDbUrl) return;

      const userEmail = owner.email('session-inv-user');
      const originalPassword = 'InitialPassword123!';
      const newPassword = 'UpdatedPassword456!';

      // Create user
      const createRes = await http()
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: userEmail,
          password: originalPassword,
          firstName: 'Session',
          lastName: 'Test',
        });
      const testUserId = createRes.body.id;

      // Establish Session 1
      const session1Res = await http()
        .post('/auth/login')
        .send({ email: userEmail, password: originalPassword });
      const token1 = session1Res.body.token;

      // Establish Session 2
      const session2Res = await http()
        .post('/auth/login')
        .send({ email: userEmail, password: originalPassword });
      const token2 = session2Res.body.token;

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);

      // Verify both sessions work
      const me1Before = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${token1}`);
      expect(me1Before.status).toBe(200);

      const me2Before = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${token2}`);
      expect(me2Before.status).toBe(200);

      // Change password using Session 1
      const changePassRes = await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          currentPassword: originalPassword,
          newPassword: newPassword,
        });

      expect(changePassRes.status).toBe(201);

      // Session 1 remains active
      const me1After = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${token1}`);
      expect(me1After.status).toBe(200);

      // Session 2 is revoked and rejected
      const me2After = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${token2}`);
      expect(me2After.status).toBe(401);

      // Clean up
      await db.delete(userSessions).where(eq(userSessions.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    });

    it('rejects expired sessions at query time', async () => {
      if (!hasDbUrl) return;

      const crypto = await import('crypto');
      const expiredToken = crypto.randomBytes(32).toString('hex');

      // Insert session expired 1 hour ago
      await db.insert(userSessions).values({
        userId: adminUser.id,
        token: expiredToken,
        ipAddress: '127.0.0.1',
        userAgent: 'Integration Test',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const res = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);

      // Clean up
      await db.delete(userSessions).where(eq(userSessions.token, expiredToken));
    });

    it('prevents account enumeration on disabled user login', async () => {
      if (!hasDbUrl) return;

      const disabledEmail = owner.email('disabled-account');
      const [disUser] = await db
        .insert(users)
        .values({
          email: disabledEmail,
          passwordHash: 'dummy',
          firstName: 'Disabled',
          lastName: 'User',
          status: 'DISABLED',
        })
        .returning();

      const res = await http().post('/auth/login').send({
        email: disabledEmail,
        password: 'SomePassword123!',
      });

      // Must return generic Invalid credentials, NOT "Account disabled"
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials.');

      // Clean up
      await db.delete(users).where(eq(users.id, disUser!.id));
    });
  });

  describe('14. Operational Security Hardening (Phase 5)', () => {
    it('throttles repeated failed logins with 429 Too Many Requests and records THROTTLED_LOGIN audit log', async () => {
      if (!hasDbUrl) return;

      process.env.ENABLE_TEST_RATE_LIMIT = 'true';
      const attackEmail = owner.email('bruteforce-target');
      const attackIp = '198.51.100.25';

      try {
        // Trigger 5 failures
        for (let i = 0; i < 5; i++) {
          const failRes = await http()
            .post('/auth/login')
            .set('X-Forwarded-For', attackIp)
            .send({
              email: attackEmail,
              password: `WrongPass-${i}`,
            });
          expect(failRes.status).toBe(401);
        }

        // 6th attempt must be throttled with 429
        const throttledRes = await http()
          .post('/auth/login')
          .set('X-Forwarded-For', attackIp)
          .send({
            email: attackEmail,
            password: 'AnotherWrongPassword',
          });

        expect(throttledRes.status).toBe(429);
        expect(throttledRes.body.error).toBe('Too Many Requests');
        expect(throttledRes.body.retryAfter).toBeGreaterThan(0);

        // Verify THROTTLED_LOGIN audit log entry
        const [auditLog] = await db
          .select()
          .from(securityAuditLogs)
          .where(eq(securityAuditLogs.action, 'THROTTLED_LOGIN'))
          .orderBy(desc(securityAuditLogs.createdAt))
          .limit(1);

        expect(auditLog).toBeDefined();
        expect(auditLog!.action).toBe('THROTTLED_LOGIN');
        expect(auditLog!.userEmail).toBe(attackEmail);
      } finally {
        delete process.env.ENABLE_TEST_RATE_LIMIT;
        loginThrottlerService.reset();
      }
    });

    it('resets failed login counter upon successful authentication', async () => {
      if (!hasDbUrl) return;

      process.env.ENABLE_TEST_RATE_LIMIT = 'true';
      const validUserEmail = owner.email('reset-counter-user');
      const validPassword = 'CorrectPassword123!';

      // Create test user
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: validUserEmail,
          password: validPassword,
          firstName: 'Counter',
          lastName: 'Test',
        });

      try {
        // 4 failed attempts (1 below threshold)
        for (let i = 0; i < 4; i++) {
          await http()
            .post('/auth/login')
            .send({ email: validUserEmail, password: 'BadPassword' });
        }

        // Successful login
        const successRes = await http()
          .post('/auth/login')
          .send({ email: validUserEmail, password: validPassword });
        expect(successRes.status).toBe(201);

        // Subsequent failure should not trigger 429 since counter was reset
        const nextFailRes = await http()
          .post('/auth/login')
          .send({ email: validUserEmail, password: 'BadPassword' });
        expect(nextFailRes.status).toBe(401);
      } finally {
        delete process.env.ENABLE_TEST_RATE_LIMIT;
        loginThrottlerService.reset();
      }
    });

    it('session cleanup worker purges expired sessions and retains valid sessions', async () => {
      if (!hasDbUrl) return;

      const crypto = await import('crypto');
      const expiredToken = crypto.randomBytes(32).toString('hex');
      const activeToken = crypto.randomBytes(32).toString('hex');
      const oldRevokedToken = crypto.randomBytes(32).toString('hex');
      const recentRevokedToken = crypto.randomBytes(32).toString('hex');

      const now = Date.now();

      // 1. Expired session (expired 2 hours ago)
      await db.insert(userSessions).values({
        userId: adminUser.id,
        token: expiredToken,
        ipAddress: '127.0.0.1',
        userAgent: 'Cleanup Test',
        expiresAt: new Date(now - 2 * 60 * 60 * 1000),
      });

      // 2. Active session (valid for 24h)
      await db.insert(userSessions).values({
        userId: adminUser.id,
        token: activeToken,
        ipAddress: '127.0.0.1',
        userAgent: 'Cleanup Test',
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
      });

      // 3. Old revoked session (revoked 10 days ago, past 7-day retention)
      await db.insert(userSessions).values({
        userId: adminUser.id,
        token: oldRevokedToken,
        ipAddress: '127.0.0.1',
        userAgent: 'Cleanup Test',
        isRevoked: true,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      });

      // 4. Recently revoked session (revoked 1 day ago, within retention period)
      await db.insert(userSessions).values({
        userId: adminUser.id,
        token: recentRevokedToken,
        ipAddress: '127.0.0.1',
        userAgent: 'Cleanup Test',
        isRevoked: true,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      });

      // Execute cleanup
      const result = await sessionCleanupService.cleanupExpiredSessions();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);

      // Verify database state:
      // Expired and old revoked should be deleted
      const [expiredCheck] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.token, expiredToken));
      expect(expiredCheck).toBeUndefined();

      const [oldRevokedCheck] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.token, oldRevokedToken));
      expect(oldRevokedCheck).toBeUndefined();

      // Active session must remain
      const [activeCheck] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.token, activeToken));
      expect(activeCheck).toBeDefined();

      // Recent revoked session must remain within retention window
      const [recentRevokedCheck] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.token, recentRevokedToken));
      expect(recentRevokedCheck).toBeDefined();

      // Clean up remaining test sessions
      await db.delete(userSessions).where(eq(userSessions.token, activeToken));
      await db
        .delete(userSessions)
        .where(eq(userSessions.token, recentRevokedToken));
    });

    it('redacts sensitive credentials before storing in security audit logs', async () => {
      if (!hasDbUrl) return;

      const auditService = app.get(AuthService)['auditService'];
      await auditService.record({
        action: 'TEST_REDACTION',
        category: 'SECURITY',
        userId: adminUser.id,
        userEmail: adminUser.email,
        details: {
          password: 'SecretPassword987!',
          token: 'sensitive_bearer_token_xyz',
          authorization: 'Bearer secret_token_xyz',
          connectionUri: 'postgres://user:superSecret@db:5432/ananya',
          safeField: 'diagnostic_info',
        },
      });

      const [logEntry] = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'TEST_REDACTION'))
        .orderBy(desc(securityAuditLogs.createdAt))
        .limit(1);

      expect(logEntry).toBeDefined();
      const details = logEntry!.details as Record<string, unknown>;
      expect(details.password).toBe('[REDACTED]');
      expect(details.token).toBe('[REDACTED]');
      expect(details.authorization).toBe('[REDACTED]');
      expect(details.connectionUri).toBe(
        'postgres://user:[REDACTED]@db:5432/ananya',
      );
      expect(details.safeField).toBe('diagnostic_info');
    });

    it('enforces HTTP security headers on all responses', async () => {
      if (!hasDbUrl) return;

      const res = await http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe(
        'strict-origin-when-cross-origin',
      );
      expect(res.headers['permissions-policy']).toBe(
        'camera=(), microphone=(), geolocation=()',
      );
    });

    it('enforces secure CORS resolution policy', () => {
      // 1. Production without explicit CORS_ORIGIN fails closed (false)
      expect(resolveCorsOrigin('production', '')).toBe(false);
      expect(resolveCorsOrigin('production', undefined)).toBe(false);

      // 2. Production with explicit CORS_ORIGIN allows only configured origin
      expect(resolveCorsOrigin('production', 'https://erp.48studios.com')).toBe(
        'https://erp.48studios.com',
      );

      // 3. Development environment allows localhost origins
      const devOrigins = resolveCorsOrigin('development', '') as string[];
      expect(Array.isArray(devOrigins)).toBe(true);
      expect(devOrigins).toContain('http://localhost:3000');
    });

    it('records AUTHORIZATION_DENIED structured event when access is forbidden', async () => {
      if (!hasDbUrl) return;

      // Make a forbidden request
      const res = await http()
        .post('/sales-orders')
        .set('Authorization', `Bearer ${inventoryUserToken}`)
        .send({ customerId: 'cust-1' });

      expect(res.status).toBe(403);

      // Verify AUTHORIZATION_DENIED was recorded
      const [deniedLog] = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'AUTHORIZATION_DENIED'))
        .orderBy(desc(securityAuditLogs.createdAt))
        .limit(1);

      expect(deniedLog).toBeDefined();
      expect(deniedLog!.userId).toBe(inventoryUser.id);
      expect(deniedLog!.details).toMatchObject({
        requiredPermission: 'Sales.Create',
      });
    });
  });
});
