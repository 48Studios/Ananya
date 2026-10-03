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
  locations,
  roles,
  securityAuditLogs,
  spatialLayouts,
  spatialLayoutMappings,
  spatialLayoutRevisions,
  spatialNodes,
  users,
} from '@ananya/database/schema';
import { eq, ilike, inArray, or, sql } from '@ananya/database/query';

/** Typed view of layout response bodies (supertest bodies are `any`). */
interface LayoutResponseBody {
  id?: string;
  code?: string;
  parentLocationId?: string;
  status?: string;
  revision?: number;
  revisionNumber?: number;
  mappings?: unknown[];
  statusCode?: number;
  error?: string;
  message?: string | string[];
}

/**
 * Phase 3.4.1 (audit finding F2): authorization of the Spatial Layout API.
 *
 * These tests drive the real HTTP routes through Supertest with real session
 * tokens issued by the application's own login path, so they prove the guards
 * are actually attached to every route (a service-level test cannot). The
 * permission policy itself is untouched:
 *   - every route requires an authenticated session (401 otherwise),
 *   - reads require `Inventory.Read`,
 *   - creates/updates/publishes/archives/deletes require `Inventory.Update`.
 *
 * Run with the integration command and `DATABASE_URL` set, e.g.:
 *   set -a; source .env; set +a;
 *   pnpm --filter @ananya/api exec jest --config ./test/jest-e2e.json \
 *     --runInBand test/integration/spatial-layout-write-auth.integration-spec.ts
 */
describe('Spatial Layout API — authorization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = `zz34auth${Math.random().toString(36).slice(2, 7)}`;
  const dummyLayoutId = '00000000-0000-0000-0000-000000000000';

  let app: INestApplication;
  let authService: AuthService;

  let readerToken = '';
  let writerToken = '';

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdLayoutIds: string[] = [];

  let parentLocationId = '';
  let childLocationId = '';
  let lifecycleLayoutId = '';

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function responseBody(response: { body: unknown }): LayoutResponseBody {
    return response.body as LayoutResponseBody;
  }

  function responseBodyList(response: { body: unknown }): LayoutResponseBody[] {
    return response.body as LayoutResponseBody[];
  }

  function textOf(message: string | string[] | undefined): string {
    if (Array.isArray(message)) return message.join(', ');
    return message ?? '';
  }

  const layoutPayload = (code: string, layoutParentId: string) => ({
    parentLocationId: layoutParentId,
    code,
    name: `Authorization fixture ${code}`,
    templateType: 'SMD_DRAWER_CABINET',
    config: {
      templateType: 'SMD_DRAWER_CABINET',
      dimensions: { widthMm: 1000, heightMm: 1200, depthMm: 450 },
      wallThicknessMm: 15,
      rows: 2,
      columns: 2,
    },
    mappings: [
      {
        slotId: 'drawer_slot_r0_c0',
        slotCode: 'A01',
        locationId: childLocationId,
      },
    ],
  });

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts so whitelist rejection behaves as it does in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authService = app.get(AuthService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);

    const readerRole = await rolesService.create({
      name: `ZZ34 Auth Reader ${runTag}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `ZZ34 Auth Writer ${runTag}`,
      description: 'Authorization fixture: layout authoring access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `zz34auth-reader-${runTag}@example.test`,
      password: 'ReaderPassw0rd!',
      firstName: 'ZZ34',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `zz34auth-writer-${runTag}@example.test`,
      password: 'WriterPassw0rd!',
      firstName: 'ZZ34',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;

    const [parent] = await db
      .insert(locations)
      .values({
        code: `${runTag}-CAB`,
        name: `Auth Cabinet ${runTag}`,
        kind: 'cabinet',
        isActive: true,
      })
      .returning();
    if (!parent) throw new Error('Failed to create authorization parent');
    parentLocationId = parent.id;
    createdLocationIds.push(parent.id);

    const [child] = await db
      .insert(locations)
      .values({
        code: `${runTag}-DRW`,
        name: `Auth Drawer ${runTag}`,
        kind: 'drawer',
        parentId: parent.id,
        isActive: true,
      })
      .returning();
    if (!child) throw new Error('Failed to create authorization child');
    childLocationId = child.id;
    createdLocationIds.push(child.id);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    for (const layoutId of createdLayoutIds) {
      await db
        .delete(spatialLayoutRevisions)
        .where(eq(spatialLayoutRevisions.layoutId, layoutId));
      await db
        .delete(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, layoutId));
      await db.delete(spatialLayouts).where(eq(spatialLayouts.id, layoutId));
    }

    // The 403 matrix records AUTHORIZATION_DENIED audit rows naming the fixture
    // users by email; role creation records rows naming the role id in details.
    await db
      .delete(securityAuditLogs)
      .where(
        or(
          ilike(
            securityAuditLogs.userEmail,
            `zz34auth-reader-${runTag}@example.test`,
          ),
          ilike(
            securityAuditLogs.userEmail,
            `zz34auth-writer-${runTag}@example.test`,
          ),
        ),
      );
    if (createdRoleIds.length > 0) {
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          createdRoleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    }
    if (createdLocationIds.length > 0) {
      await db
        .delete(spatialNodes)
        .where(inArray(spatialNodes.locationId, createdLocationIds));
      await db.delete(locations).where(eq(locations.id, childLocationId));
      await db.delete(locations).where(eq(locations.id, parentLocationId));
    }

    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  describe('1. Unauthenticated access', () => {
    it('rejects all 11 layout routes with 401', async () => {
      if (!hasDbUrl) return;

      const routes = [
        {
          label: 'POST /spatial/layouts',
          call: () =>
            http()
              .post('/spatial/layouts')
              .send(layoutPayload(`${runTag}-ANON`, parentLocationId)),
        },
        {
          label: 'GET /spatial/layouts',
          call: () => http().get('/spatial/layouts'),
        },
        {
          label: 'GET /spatial/layouts/parent/:parentLocationId',
          call: () => http().get(`/spatial/layouts/parent/${parentLocationId}`),
        },
        {
          label: 'GET /spatial/layouts/parent/:parentLocationId/active',
          call: () =>
            http().get(`/spatial/layouts/parent/${parentLocationId}/active`),
        },
        {
          label: 'GET /spatial/layouts/:id',
          call: () => http().get(`/spatial/layouts/${dummyLayoutId}`),
        },
        {
          label: 'PUT /spatial/layouts/:id',
          call: () =>
            http()
              .put(`/spatial/layouts/${dummyLayoutId}`)
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'POST /spatial/layouts/:id/publish',
          call: () =>
            http()
              .post(`/spatial/layouts/${dummyLayoutId}/publish`)
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'POST /spatial/layouts/:id/archive',
          call: () =>
            http()
              .post(`/spatial/layouts/${dummyLayoutId}/archive`)
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'GET /spatial/layouts/:id/revisions',
          call: () => http().get(`/spatial/layouts/${dummyLayoutId}/revisions`),
        },
        {
          label: 'GET /spatial/layouts/:id/revisions/:revisionNumber',
          call: () =>
            http().get(`/spatial/layouts/${dummyLayoutId}/revisions/1`),
        },
        {
          label: 'DELETE /spatial/layouts/:id',
          call: () => http().delete(`/spatial/layouts/${dummyLayoutId}`),
        },
      ];

      for (const route of routes) {
        const response = await route.call();
        const body = responseBody(response);
        expect([route.label, response.status]).toEqual([route.label, 401]);
        expect(body.statusCode).toBe(401);
        expect(textOf(body.message)).toContain('Authentication');
      }
    });
  });

  describe('2. Inventory.Read-only user (reader)', () => {
    it('denies every write operation with 403 and creates nothing', async () => {
      if (!hasDbUrl) return;

      const writes = [
        {
          label: 'POST /spatial/layouts',
          call: () =>
            http()
              .post('/spatial/layouts')
              .set(auth(readerToken))
              .send(layoutPayload(`${runTag}-READER`, parentLocationId)),
        },
        {
          label: 'PUT /spatial/layouts/:id',
          call: () =>
            http()
              .put(`/spatial/layouts/${dummyLayoutId}`)
              .set(auth(readerToken))
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'POST /spatial/layouts/:id/publish',
          call: () =>
            http()
              .post(`/spatial/layouts/${dummyLayoutId}/publish`)
              .set(auth(readerToken))
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'POST /spatial/layouts/:id/archive',
          call: () =>
            http()
              .post(`/spatial/layouts/${dummyLayoutId}/archive`)
              .set(auth(readerToken))
              .send({ expectedRevision: 1 }),
        },
        {
          label: 'DELETE /spatial/layouts/:id',
          call: () =>
            http()
              .delete(`/spatial/layouts/${dummyLayoutId}`)
              .set(auth(readerToken)),
        },
      ];

      for (const write of writes) {
        const response = await write.call();
        const body = responseBody(response);
        expect([write.label, response.status]).toEqual([write.label, 403]);
        expect(body.statusCode).toBe(403);
        expect(textOf(body.message)).toContain('Inventory.Update');
      }

      // The refused create left nothing behind: the parent still has zero layouts.
      const list = await http()
        .get(`/spatial/layouts/parent/${parentLocationId}`)
        .set(auth(writerToken));
      expect(list.status).toBe(200);
      expect(responseBodyList(list)).toHaveLength(0);
    });
  });

  describe('3. Inventory.Read + Inventory.Update user (writer)', () => {
    it('creates, updates, publishes, and archives a layout', async () => {
      if (!hasDbUrl) return;

      const code = `${runTag}-LIFECYCLE`;

      const created = await http()
        .post('/spatial/layouts')
        .set(auth(writerToken))
        .send(layoutPayload(code, parentLocationId));
      const createdBody = responseBody(created);
      expect(created.status).toBe(201);
      expect(createdBody.id).toBeTruthy();
      expect(createdBody.code).toBe(code);
      expect(createdBody.parentLocationId).toBe(parentLocationId);
      expect(createdBody.status).toBe('DRAFT');
      expect(createdBody.revision).toBe(1);
      expect(createdBody.mappings).toHaveLength(1);

      lifecycleLayoutId = createdBody.id as string;
      createdLayoutIds.push(lifecycleLayoutId);

      const updated = await http()
        .put(`/spatial/layouts/${lifecycleLayoutId}`)
        .set(auth(writerToken))
        .send({ expectedRevision: 1, changeDescription: 'auth spec update' });
      const updatedBody = responseBody(updated);
      expect(updated.status).toBe(200);
      expect(updatedBody.status).toBe('DRAFT');
      expect(updatedBody.revision).toBe(2);

      const published = await http()
        .post(`/spatial/layouts/${lifecycleLayoutId}/publish`)
        .set(auth(writerToken))
        .send({ expectedRevision: 2, changeDescription: 'auth spec publish' });
      const publishedBody = responseBody(published);
      expect(published.status).toBe(200);
      expect(publishedBody.status).toBe('PUBLISHED');
      expect(publishedBody.revision).toBe(3);

      const archived = await http()
        .post(`/spatial/layouts/${lifecycleLayoutId}/archive`)
        .set(auth(writerToken))
        .send({ expectedRevision: 3, changeDescription: 'auth spec archive' });
      const archivedBody = responseBody(archived);
      expect(archived.status).toBe(200);
      expect(archivedBody.status).toBe('ARCHIVED');
      expect(archivedBody.revision).toBe(4);
    });

    it('hard-deletes a never-published draft and then reports it gone', async () => {
      if (!hasDbUrl) return;

      const created = await http()
        .post('/spatial/layouts')
        .set(auth(writerToken))
        .send(layoutPayload(`${runTag}-DELETE`, parentLocationId));
      const createdBody = responseBody(created);
      expect(created.status).toBe(201);
      const draftId = createdBody.id as string;
      createdLayoutIds.push(draftId);

      const deleted = await http()
        .delete(`/spatial/layouts/${draftId}`)
        .set(auth(writerToken));
      expect(deleted.status).toBe(204);

      const gone = await http()
        .get(`/spatial/layouts/${draftId}`)
        .set(auth(writerToken));
      expect(gone.status).toBe(404);
    });
  });

  describe('4. Inventory.Read-only user (reader) — permitted reads', () => {
    it('reads every read route with 200', async () => {
      if (!hasDbUrl) return;

      const all = await http().get('/spatial/layouts').set(auth(readerToken));
      expect(all.status).toBe(200);

      const byParent = await http()
        .get(`/spatial/layouts/parent/${parentLocationId}`)
        .set(auth(readerToken));
      expect(byParent.status).toBe(200);
      const parentLayouts = responseBodyList(byParent);
      expect(parentLayouts.some((l) => l.id === lifecycleLayoutId)).toBe(true);

      const active = await http()
        .get(`/spatial/layouts/parent/${parentLocationId}/active`)
        .set(auth(readerToken));
      // The lifecycle layout was archived, so no published layout remains.
      expect(active.status).toBe(200);

      const byId = await http()
        .get(`/spatial/layouts/${lifecycleLayoutId}`)
        .set(auth(readerToken));
      const byIdBody = responseBody(byId);
      expect(byId.status).toBe(200);
      expect(byIdBody.status).toBe('ARCHIVED');
      expect(byIdBody.revision).toBe(4);

      const revisions = await http()
        .get(`/spatial/layouts/${lifecycleLayoutId}/revisions`)
        .set(auth(readerToken));
      expect(revisions.status).toBe(200);
      expect(responseBodyList(revisions)).toHaveLength(3);

      const revisionByNumber = await http()
        .get(`/spatial/layouts/${lifecycleLayoutId}/revisions/1`)
        .set(auth(readerToken));
      const revisionBody = responseBody(revisionByNumber);
      expect(revisionByNumber.status).toBe(200);
      expect(revisionBody.revisionNumber).toBe(1);
    });
  });
});
