import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { closeDatabaseConnection, db } from '@ananya/database';
import { securityAuditLogs, userSessions } from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * Session management endpoints used by the profile page.
 *
 * These routes did not exist: the web client called `GET /auth/sessions`,
 * `POST /auth/sessions/:id/revoke` and `POST /auth/revoke-sessions`, all of
 * which returned 404 while the profile page silently swallowed the error.
 *
 * The properties proven here are the ones that make the feature safe:
 *  - a session list never exposes session tokens,
 *  - a user can only revoke their own sessions (another user's id is 404),
 *  - revoking "other sessions" keeps the caller signed in,
 *  - revocations are audit-logged.
 */
describe('Auth sessions API', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('auth-sessions');

  let app: INestApplication;
  let tokenA1 = '';
  let tokenA2 = '';
  let tokenA3 = '';
  let tokenB = '';
  let userAId = '';
  const trackedUserIds: string[] = [];

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

    const authService = app.get(AuthService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);

    const role = await owner.createRole(rolesService, ['Inventory.Read']);
    const userA = await owner.createUser(usersService, role.id, 'session-a');
    const userB = await owner.createUser(usersService, role.id, 'session-b');
    userAId = userA.id;
    trackedUserIds.push(userA.id, userB.id);

    tokenA1 = (await authService.createSessionForUser(userA.id)).token;
    tokenA2 = (await authService.createSessionForUser(userA.id)).token;
    tokenA3 = (await authService.createSessionForUser(userA.id)).token;
    tokenB = (await authService.createSessionForUser(userB.id)).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    if (trackedUserIds.length > 0) {
      await db
        .delete(securityAuditLogs)
        .where(inArray(securityAuditLogs.userId, trackedUserIds));
    }

    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('lists only the caller sessions, flags the current one and never returns tokens', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${tokenA1}`);

    expect(response.status).toBe(200);
    const sessions = response.body as Array<Record<string, unknown>>;
    expect(sessions).toHaveLength(3);

    const current = sessions.filter((session) => session.isCurrent === true);
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBeTruthy();

    for (const session of sessions) {
      expect(session.token).toBeUndefined();
      expect(session.userId).toBeUndefined();
      expect(session.expiresAt).toBeTruthy();
    }

    // Sessions belong to the caller only.
    const otherUserView = await http()
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(otherUserView.status).toBe(200);
    expect(otherUserView.body).toHaveLength(1);
  });

  it('rejects unauthenticated access', async () => {
    if (!hasDbUrl) return;

    expect((await http().get('/auth/sessions')).status).toBe(401);
    expect((await http().post('/auth/revoke-sessions').send({})).status).toBe(
      401,
    );
  });
  it('revokes one of the caller sessions and invalidates only that token', async () => {
    if (!hasDbUrl) return;

    const [target] = await db
      .select({ id: userSessions.id })
      .from(userSessions)
      .where(eq(userSessions.token, tokenA2));
    expect(target?.id).toBeTruthy();

    const revoked = await http()
      .post(`/auth/sessions/${target!.id}/revoke`)
      .set('Authorization', `Bearer ${tokenA1}`)
      .send({});
    expect(revoked.status).toBe(201);
    expect((revoked.body as { success: boolean }).success).toBe(true);

    // The caller stays signed in; the revoked session does not.
    expect(
      (await http().get('/auth/me').set('Authorization', `Bearer ${tokenA1}`))
        .status,
    ).toBe(200);
    expect(
      (await http().get('/auth/me').set('Authorization', `Bearer ${tokenA2}`))
        .status,
    ).toBe(401);
  });

  it("cannot revoke another user's session", async () => {
    if (!hasDbUrl) return;

    const [otherSession] = await db
      .select({ id: userSessions.id })
      .from(userSessions)
      .where(eq(userSessions.token, tokenB));
    expect(otherSession?.id).toBeTruthy();

    const attempt = await http()
      .post(`/auth/sessions/${otherSession!.id}/revoke`)
      .set('Authorization', `Bearer ${tokenA1}`)
      .send({});
    expect(attempt.status).toBe(404);

    // The other user's session is untouched.
    expect(
      (await http().get('/auth/me').set('Authorization', `Bearer ${tokenB}`))
        .status,
    ).toBe(200);
  });

  it('returns 404 for an unknown session id', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post('/auth/sessions/00000000-0000-0000-0000-000000000000/revoke')
      .set('Authorization', `Bearer ${tokenA1}`)
      .send({});
    expect(response.status).toBe(404);
  });

  it('revokes every other session but keeps the caller signed in', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post('/auth/revoke-sessions')
      .set('Authorization', `Bearer ${tokenA1}`)
      .send({});
    expect(response.status).toBe(201);
    expect((response.body as { success: boolean }).success).toBe(true);

    expect(
      (await http().get('/auth/me').set('Authorization', `Bearer ${tokenA1}`))
        .status,
    ).toBe(200);

    const remaining = await http()
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${tokenA1}`);
    const sessions = remaining.body as Array<{ isCurrent: boolean }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.isCurrent).toBe(true);

    expect(
      (await http().get('/auth/me').set('Authorization', `Bearer ${tokenA3}`))
        .status,
    ).toBe(401);
  });

  it('records revocations in the security audit log', async () => {
    if (!hasDbUrl) return;

    const rows = await db
      .select()
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.userId, userAId),
          inArray(securityAuditLogs.action, [
            'SESSION_REVOKED',
            'ALL_OTHER_SESSIONS_REVOKED',
          ]),
        ),
      );

    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
