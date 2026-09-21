import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { MlService } from '../../src/ml/ml.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import { aiSuggestionFeedback } from '@ananya/database/schema';
import { count, eq } from '@ananya/database/query';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * Component catalog API — authorization (Pass 6).
 *
 * `ComponentsController` previously had **no guards on any route**. These are HTTP
 * tests, so they prove the guard is attached to the route rather than merely
 * available in the code.
 *
 * Four identities are used throughout:
 *
 *  - **anonymous** — no token at all
 *  - **no-inventory** — authenticated, but holds no inventory permission
 *  - **reader** — `Inventory.Read` only
 *  - **writer** — `Inventory.Read` + `Inventory.Update`
 *
 * and one more for the delete boundary:
 *
 *  - **deleter** — `Inventory.Read` + `Inventory.Delete`
 *
 * The delete cases are separate on purpose. `Inventory.Delete` is the repository's
 * purpose-built permission for removing components and it is held by no system
 * role except `Administrator`; a writer deliberately does NOT pass it. Pinning that
 * in a test is what makes the boundary a decision rather than an accident.
 *
 * Fixtures are owned by a {@link FixtureOwner}, so the suite removes exactly what
 * it created — including the `ROLE_CREATED` audit rows that carry no actor and are
 * only identifiable through `details->>'roleId'`.
 */
describe('Component catalog — authorization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let mlService: MlService;

  const owner = new FixtureOwner('comp-auth');

  let noInventoryToken = '';
  let readerToken = '';
  let writerToken = '';
  let deleterToken = '';
  let writerUserId = '';
  let writerEmail = '';

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  /** A component payload that passes validation. */
  function componentPayload(suffix: string) {
    return {
      sku: owner.upperCode(suffix.toUpperCase()),
      name: owner.name(`Auth ${suffix}`),
      unit: 'pcs',
    };
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts, so whitelist rejection behaves as it does in production.
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
    mlService = app.get(MlService);

    const noInventoryRole = await owner.createRole(rolesService, [
      'Reports.Read',
    ]);
    const readerRole = await owner.createRole(rolesService, ['Inventory.Read']);
    const writerRole = await owner.createRole(rolesService, [
      'Inventory.Read',
      'Inventory.Update',
    ]);
    const deleterRole = await owner.createRole(rolesService, [
      'Inventory.Read',
      'Inventory.Delete',
    ]);

    const noInventory = await owner.createUser(
      usersService,
      noInventoryRole.id,
      'comp-noinv',
    );
    const reader = await owner.createUser(
      usersService,
      readerRole.id,
      'comp-reader',
    );
    const writer = await owner.createUser(
      usersService,
      writerRole.id,
      'comp-writer',
    );
    const deleter = await owner.createUser(
      usersService,
      deleterRole.id,
      'comp-deleter',
    );

    writerUserId = writer.id;
    writerEmail = writer.email;

    noInventoryToken = (await authService.createSessionForUser(noInventory.id))
      .token;
    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
    deleterToken = (await authService.createSessionForUser(deleter.id)).token;

    // Deterministic compute: the guard boundary is what is under test, not which
    // producer answers or whether the ML container is running.
    mlService.suggest = () =>
      Promise.resolve({
        query: 'fixture',
        isDuplicate: false,
        duplicateWarnings: [],
        attributes: {},
        alternativeCategories: [],
        confidenceLevel: 'MEDIUM' as const,
        isMlActive: false,
        executionTimeMs: 0,
      });
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  describe('reads', () => {
    const readRoutes = ['/components', '/components/sku/preview'];

    it('rejects an anonymous caller', async () => {
      for (const route of readRoutes) {
        expect((await http().get(route)).status).toBe(401);
      }
    });

    it('rejects an authenticated caller with no inventory permission', async () => {
      for (const route of readRoutes) {
        const response = await http()
          .get(route)
          .set('Authorization', `Bearer ${noInventoryToken}`);
        expect(response.status).toBe(403);
      }
    });

    it('allows a read-only caller', async () => {
      for (const route of readRoutes) {
        const response = await http()
          .get(route)
          .set('Authorization', `Bearer ${readerToken}`);
        expect(response.status).toBe(200);
      }
    });

    it('rejects an anonymous detail read and allows a read-only one', async () => {
      const created = await http()
        .post('/components')
        .set('Authorization', `Bearer ${writerToken}`)
        .send(componentPayload('detail'));
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      owner.trackComponent(id);

      expect((await http().get(`/components/${id}`)).status).toBe(401);

      const read = await http()
        .get(`/components/${id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(read.status).toBe(200);
      expect((read.body as { id: string }).id).toBe(id);
    });
  });

  // -------------------------------------------------------------------------
  // Create / update
  // -------------------------------------------------------------------------

  describe('create and update', () => {
    it('rejects an anonymous create', async () => {
      const response = await http()
        .post('/components')
        .send(componentPayload('anon-create'));
      expect(response.status).toBe(401);
    });

    it('rejects a read-only create', async () => {
      const response = await http()
        .post('/components')
        .set('Authorization', `Bearer ${readerToken}`)
        .send(componentPayload('reader-create'));
      expect(response.status).toBe(403);
    });

    it('rejects an anonymous update and allows a writer', async () => {
      const payload = componentPayload('update');
      const created = await http()
        .post('/components')
        .set('Authorization', `Bearer ${writerToken}`)
        .send(payload);
      // The body and payload are part of the assertion so an intermittent non-201
      // is diagnosable from the failure alone.
      expect({
        status: created.status,
        body: created.body as unknown,
        payload,
      }).toMatchObject({ status: 201 });
      const id = (created.body as { id: string }).id;
      owner.trackComponent(id);

      expect(
        (await http().put(`/components/${id}`).send({ name: 'Anonymous edit' }))
          .status,
      ).toBe(401);

      expect(
        (
          await http()
            .put(`/components/${id}`)
            .set('Authorization', `Bearer ${readerToken}`)
            .send({ name: 'Read-only edit' })
        ).status,
      ).toBe(403);

      const updated = await http()
        .put(`/components/${id}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ name: owner.name('Updated by writer') });
      expect(updated.status).toBe(200);
      expect((updated.body as { name: string }).name).toBe(
        owner.name('Updated by writer'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Delete — the `Inventory.Delete` boundary
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('rejects an anonymous delete', async () => {
      const response = await http().delete(
        '/components/00000000-0000-4000-8000-000000000000',
      );
      expect(response.status).toBe(401);
    });

    it('rejects a read-only delete', async () => {
      const response = await http()
        .delete('/components/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(403);
    });

    it('rejects a writer: create/update and delete are different capabilities', async () => {
      // `Inventory.Delete` is the purpose-built permission for removing a
      // component, and a role holding Create+Update does not thereby hold it. This
      // is the boundary that makes the existing permission meaningful instead of
      // dead code.
      const created = await http()
        .post('/components')
        .set('Authorization', `Bearer ${writerToken}`)
        .send(componentPayload('writer-cannot-delete'));
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      owner.trackComponent(id);

      const response = await http()
        .delete(`/components/${id}`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(response.status).toBe(403);

      // Still there.
      const read = await http()
        .get(`/components/${id}`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(read.status).toBe(200);
    });

    it('allows a caller holding Inventory.Delete', async () => {
      const created = await http()
        .post('/components')
        .set('Authorization', `Bearer ${writerToken}`)
        .send(componentPayload('deleter'));
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      owner.trackComponent(id);

      const response = await http()
        .delete(`/components/${id}`)
        .set('Authorization', `Bearer ${deleterToken}`);
      expect(response.status).toBe(200);

      const read = await http()
        .get(`/components/${id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(read.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Suggest
  // -------------------------------------------------------------------------

  describe('suggest', () => {
    it('rejects an anonymous caller', async () => {
      const response = await http()
        .post('/components/suggest')
        .send({ query: 'resistor 10k' });
      expect(response.status).toBe(401);
    });

    it('rejects an authenticated caller with no inventory permission', async () => {
      const response = await http()
        .post('/components/suggest')
        .set('Authorization', `Bearer ${noInventoryToken}`)
        .send({ query: 'resistor 10k' });
      expect(response.status).toBe(403);
    });

    it('allows a read-only caller', async () => {
      // A read that costs money: it reads reference data and can trigger inference,
      // so it needs `Inventory.Read` rather than being open because it "only
      // computes".
      const response = await http()
        .post('/components/suggest')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ query: 'resistor 10k' });
      expect(response.status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // Suggest feedback — the highest-priority gap
  // -------------------------------------------------------------------------

  describe('suggest feedback', () => {
    const ROUTE = '/components/suggest/feedback';

    const feedbackPayload = () => ({
      items: [
        {
          suggestionType: 'CATEGORY',
          field: 'category',
          userAction: 'ACCEPTED',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const feedbackCountFor = async (reviewerId: string): Promise<number> => {
      const rows = await db
        .select({ value: count() })
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.reviewerId, reviewerId));
      return Number(rows[0]?.value ?? 0);
    };

    it('rejects an anonymous caller and records nothing', async () => {
      // This was the gap: the route reaches the same `MlService.recordFeedback`
      // path as `POST /ml/feedback`, which Pass 5 guarded. Guarding the `/ml/*`
      // alias alone left the write reachable here.
      const before = await feedbackCountFor(writerUserId);
      const response = await http().post(ROUTE).send(feedbackPayload());

      expect(response.status).toBe(401);
      expect(await feedbackCountFor(writerUserId)).toBe(before);
    });

    it('rejects a read-only caller', async () => {
      const response = await http()
        .post(ROUTE)
        .set('Authorization', `Bearer ${readerToken}`)
        .send(feedbackPayload());
      expect(response.status).toBe(403);
    });

    it('records the session identity, not a body-supplied one, for a writer', async () => {
      const before = await feedbackCountFor(writerUserId);
      const response = await http()
        .post(ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send(feedbackPayload());

      expect(response.status).toBe(201);
      expect(await feedbackCountFor(writerUserId)).toBe(before + 1);

      const rows = await db
        .select({
          id: aiSuggestionFeedback.id,
          reviewerId: aiSuggestionFeedback.reviewerId,
          reviewerEmail: aiSuggestionFeedback.reviewerEmail,
        })
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.reviewerId, writerUserId))
        .orderBy(aiSuggestionFeedback.createdAt);
      const last = rows[rows.length - 1]!;
      owner.trackFeedback(last.id);

      // Before Pass 6 this route recorded no actor at all, because the controller
      // never passed one.
      expect(last.reviewerId).toBe(writerUserId);
      expect(last.reviewerEmail).toBe(writerEmail);
    });

    it('rejects a spoofed actor', async () => {
      // The global validation pipe runs with `forbidNonWhitelisted`, so an actor
      // field in the body is a 400 rather than a silently ignored value. That is
      // stronger than ignoring it: the caller learns the field is not honoured.
      const response = await http()
        .post(ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          ...feedbackPayload(),
          reviewerId: '00000000-0000-4000-8000-000000000000',
          reviewerEmail: 'spoofed@ananya.local',
          userId: '00000000-0000-4000-8000-000000000000',
          appliedBy: 'spoofed@ananya.local',
        });

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // The ML aliases must not be a way around the component guards
  // -------------------------------------------------------------------------

  describe('the /ml aliases agree with the component routes', () => {
    it('guards both feedback aliases identically', async () => {
      // `/ml/feedback` was guarded in Pass 5 and `/components/suggest/feedback` in
      // Pass 6. Asserting them together is what stops one drifting open again.
      for (const route of ['/ml/feedback', '/components/suggest/feedback']) {
        const anonymous = await http()
          .post(route)
          .send({
            items: [
              {
                suggestionType: 'CATEGORY',
                field: 'category',
                userAction: 'ACCEPTED',
              },
            ],
          });
        expect(anonymous.status).toBe(401);

        const readOnly = await http()
          .post(route)
          .set('Authorization', `Bearer ${readerToken}`)
          .send({
            items: [
              {
                suggestionType: 'CATEGORY',
                field: 'category',
                userAction: 'ACCEPTED',
              },
            ],
          });
        expect(readOnly.status).toBe(403);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Fixture-ownership mechanism
  // -------------------------------------------------------------------------

  describe('fixture ownership', () => {
    it('tracks every fixture it creates', () => {
      const tracked = owner.tracked;
      expect(tracked.roles).toBeGreaterThanOrEqual(4);
      expect(tracked.users).toBeGreaterThanOrEqual(4);
      expect(tracked.components).toBeGreaterThanOrEqual(1);
    });

    it('namespaces every fixture so a leak is identifiable', () => {
      expect(owner.code('X')).toContain(owner.runTag);
      expect(owner.upperCode('x')).toBe(owner.upperCode('x').toUpperCase());
      expect(owner.email('probe')).toContain(owner.runTag);
    });
  });
});
