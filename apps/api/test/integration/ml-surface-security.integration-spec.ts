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
import {
  aiSuggestionFeedback,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import { count, eq, ilike, inArray, or, sql } from '@ananya/database/query';

/**
 * Legacy `/ml/*` surface — authorization (Pass 5).
 *
 * These are HTTP tests, so they prove the guard is attached to the route rather
 * than merely available in the code. Every route on the legacy ML controller is
 * exercised with four identities: none at all, one with no inventory access, one
 * with read-only access, and one that may write.
 *
 * The routes are classified in `ml.controller.ts`. Three classifications are
 * tested differently, and deliberately so:
 *
 *  - **PUBLIC HEALTH** (`GET /ml/health`) must remain reachable without a token.
 *    A liveness probe that needs a session cannot be used by the orchestrator
 *    that starts the container, so this test asserts the *absence* of a guard —
 *    and asserts that what it returns is only reachability flags, so the
 *    exemption stays defensible.
 *  - **AUTHENTICATED READ/COMPUTE** must reject an anonymous caller and a caller
 *    without `Inventory.Read`, and must accept a read-only caller.
 *  - **AUTHENTICATED WRITE** must additionally reject a read-only caller, and the
 *    actor it records must be the session's, never the body's.
 *
 * The tests assert the guard boundary, not the intelligence: where a route would
 * call the Python service, the call is stubbed so the result is deterministic and
 * the suite does not depend on whether the ML container is running.
 */
describe('Legacy ML surface — authorization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let mlService: MlService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  let anonymousToken = '';
  let readerToken = '';
  let writerToken = '';
  /**
   * Administrator identity for the training/export surface.
   *
   * Pass 6 moved `GET /ml/feedback/export`, `GET /ml/training/quarantine` and
   * `POST /ml/training/quarantine/:id/review` behind an administrator-only guard,
   * so the read-only and writer identities no longer reach them.
   */
  let adminToken = '';
  let writerUserId = '';
  let writerEmail = '';

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  /**
   * Every feedback row id, for the one test that must identify what it created.
   *
   * A full id list is acceptable here because it is used once, against a table the
   * dev database keeps small; the alternative (matching on the null actor the
   * component route records) would also match rows other suites left behind.
   */
  async function allFeedbackIds(): Promise<string[]> {
    const rows = await db
      .select({ id: aiSuggestionFeedback.id })
      .from(aiSuggestionFeedback);
    return rows.map((row) => row.id);
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

    // A role with no inventory permissions at all, so 403 is distinguishable from
    // 401 and from success.
    const noInventoryRole = await rolesService.create({
      name: `E2E ML NoInventory ${runId}`,
      description:
        'Authorization fixture: authenticated but no inventory access',
      permissions: ['Reports.Read'],
    });
    const readerRole = await rolesService.create({
      name: `E2E ML Reader ${runId}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E ML Writer ${runId}`,
      description: 'Authorization fixture: feedback and training write access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    // Administrator-only surface (Pass 6): the ML training and dataset-export
    // routes require `Administration.Roles`, which no system role except
    // `Administrator` holds.
    const adminRole = await rolesService.create({
      name: `E2E ML Admin ${runId}`,
      description: 'Authorization fixture: ML administration access',
      permissions: ['Administration.Roles'],
    });
    createdRoleIds.push(
      noInventoryRole.id,
      readerRole.id,
      writerRole.id,
      adminRole.id,
    );

    const noInventory = await usersService.create({
      email: `ml-noinv-${runId}@ananya.local`,
      password: 'NoInventoryPassw0rd!',
      firstName: 'ML',
      lastName: 'NoInventory',
      roleId: noInventoryRole.id,
    });
    const reader = await usersService.create({
      email: `ml-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'ML',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `ml-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'ML',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    const admin = await usersService.create({
      email: `ml-admin-${runId}@ananya.local`,
      password: 'AdminPassw0rd!',
      firstName: 'ML',
      lastName: 'Admin',
      roleId: adminRole.id,
    });
    createdUserIds.push(noInventory.id, reader.id, writer.id, admin.id);
    writerUserId = writer.id;
    writerEmail = writer.email;

    anonymousToken = (await authService.createSessionForUser(noInventory.id))
      .token;
    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
    adminToken = (await authService.createSessionForUser(admin.id)).token;

    // Deterministic compute: the guard boundary is what is under test, not which
    // producer answers or whether the ML container is running.
    stubComputeRoutes();
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Feedback written by these tests is identified by the fixture users' ids, so
    // nothing outside this suite's own rows is removed.
    if (createdUserIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.reviewerId, createdUserIds));
    }
    // Identity-provisioning audit rows written while the fixture roles and users
    // were created (`ROLE_CREATED`/`USER_CREATED`/`LOGIN_SUCCESS`). Scoped by the
    // fixture actor ids and the suite's own run tag, so nothing outside this suite's
    // fixtures is removed — the log is append-only for everything else.
    await db.delete(securityAuditLogs).where(
      or(
        inArray(securityAuditLogs.userId, createdUserIds),
        ilike(securityAuditLogs.userEmail, `%${runId}%`),
        // `ROLE_CREATED` carries no actor at all — only the role id in `details`
        // — so the role ids are the only handle on those rows. Without this they
        // are unattributable and accumulate across every suite run.
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          createdRoleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    );
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    }
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  /**
   * Replaces the outbound model calls with fixed answers.
   *
   * Only the producer entry points are stubbed; the routes, guards, validation and
   * response shapes are the real ones.
   */
  function stubComputeRoutes(): void {
    mlService.suggest = () =>
      Promise.resolve({
        query: 'fixture',
        isDuplicate: false,
        duplicateWarnings: [],
        attributes: {},
        attributeSuggestions: [],
        alternativeCategories: [],
        confidenceLevel: 'MEDIUM' as const,
        isMlActive: false,
        executionTimeMs: 0,
      });

    mlService.suggestAttributeBindings = () =>
      Promise.resolve({
        suggestions: [],
        isMlActive: false,
        executionTimeMs: 0,
      });

    mlService.suggestCategoryAttributes = (() =>
      Promise.resolve({
        suggestions: [],
        isMlActive: false,
        executionTimeMs: 0,
      })) as unknown as MlService['suggestCategoryAttributes'];

    mlService.suggestAttributeConfig = (() =>
      Promise.resolve({
        suggestions: [],
        isMlActive: false,
        executionTimeMs: 0,
      })) as unknown as MlService['suggestAttributeConfig'];

    mlService.detectAttributeDuplicates = (() =>
      Promise.resolve({
        duplicates: [],
        isMlActive: false,
        executionTimeMs: 0,
      })) as unknown as MlService['detectAttributeDuplicates'];

    mlService.suggestEnumValues = (() =>
      Promise.resolve({
        suggestions: [],
        isMlActive: false,
        executionTimeMs: 0,
      })) as unknown as MlService['suggestEnumValues'];

    mlService.auditAttributeLibrary = () =>
      Promise.resolve({
        summary: {
          totalAttributes: 0,
          possibleDuplicates: 0,
          suspiciousBindings: 0,
          missingExpectedAttributes: 0,
          unusedAttributes: 0,
          issuesCount: 0,
        },
        issues: [],
        isMlActive: false,
        executionTimeMs: 0,
      });
  }

  // -------------------------------------------------------------------------
  // PUBLIC HEALTH
  // -------------------------------------------------------------------------

  describe('GET /ml/health — intentionally public', () => {
    it('answers without a token, because a liveness probe cannot require a session', async () => {
      const response = await http().get('/ml/health');
      expect(response.status).toBe(200);

      // The exemption is only defensible while the response stays this narrow:
      // reachability flags, no ERP data, no counts, no version of anything.
      const payload = body<Record<string, unknown>>(response);
      expect(Object.keys(payload).sort()).toEqual([
        'mlServiceEnabled',
        'mlServiceReachable',
        'status',
      ]);
      expect(typeof payload.mlServiceEnabled).toBe('boolean');
      expect(typeof payload.mlServiceReachable).toBe('boolean');
    });
  });

  // -------------------------------------------------------------------------
  // AUTHENTICATED READ / COMPUTE
  // -------------------------------------------------------------------------

  describe('read and compute routes', () => {
    /**
     * Every route classified AUTHENTICATED READ/COMPUTE, with a body that passes
     * validation so a 400 can never be mistaken for a guard decision.
     */
    const readRoutes: Array<{
      method: 'get' | 'post';
      path: string;
      payload?: Record<string, unknown>;
    }> = [
      { method: 'post', path: '/ml/suggest', payload: { query: 'resistor' } },
      {
        method: 'post',
        path: '/ml/attributes/suggest-bindings',
        payload: { attributeName: 'Voltage Rating' },
      },
      {
        method: 'post',
        path: '/ml/attributes/suggest-category-attributes',
        payload: { categoryId: '00000000-0000-4000-8000-000000000000' },
      },
      {
        method: 'post',
        path: '/ml/attributes/suggest-config',
        payload: { name: 'Voltage Rating' },
      },
      {
        method: 'post',
        path: '/ml/attributes/detect-duplicates',
        payload: { name: 'Voltage Rating' },
      },
      {
        method: 'post',
        path: '/ml/attributes/suggest-enum-values',
        payload: {
          attributeCode: 'voltage_rating',
          attributeName: 'Voltage Rating',
        },
      },
      { method: 'post', path: '/ml/attributes/audit', payload: {} },
    ];

    it('rejects an anonymous caller on every read/compute route', async () => {
      for (const route of readRoutes) {
        const response =
          route.method === 'get'
            ? await http().get(route.path)
            : await http()
                .post(route.path)
                .send(route.payload ?? {});

        expect(response.status).toBe(401);
      }
    });

    it('rejects an authenticated caller without inventory access', async () => {
      for (const route of readRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${anonymousToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${anonymousToken}`)
                .send(route.payload ?? {});

        expect(response.status).toBe(403);
      }
    });

    it('allows a read-only caller', async () => {
      for (const route of readRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
                .send(route.payload ?? {});

        // The guard let it through. Asserted as "not a guard refusal" rather than
        // "2xx" so a validation problem with this fixture body is visible as a 400
        // instead of being silently counted as a guard decision.
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      }
    });

    it('reaches the handler with a valid body for every read/compute route', async () => {
      // Proves the payloads above are actually valid, which is what makes the 403
      // assertions above meaningful: a 403 must come from the guard, not from a
      // request that would have been rejected anyway.
      for (const route of readRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
                .send(route.payload ?? {});

        expect(response.status).toBeLessThan(300);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AUTHENTICATED WRITE — feedback
  // -------------------------------------------------------------------------

  describe('feedback writes', () => {
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

    for (const route of ['/ml/feedback', '/ml/attributes/feedback']) {
      it(`rejects an anonymous caller on POST ${route} and records nothing`, async () => {
        const before = await feedbackCountFor(writerUserId);
        const response = await http().post(route).send(feedbackPayload());

        expect(response.status).toBe(401);
        expect(await feedbackCountFor(writerUserId)).toBe(before);
      });

      it(`rejects a read-only caller on POST ${route}`, async () => {
        const response = await http()
          .post(route)
          .set('Authorization', `Bearer ${readerToken}`)
          .send(feedbackPayload());

        expect(response.status).toBe(403);
      });

      it(`records the session identity, not a body-supplied one, on POST ${route}`, async () => {
        const before = await feedbackCountFor(writerUserId);
        const response = await http()
          .post(route)
          .set('Authorization', `Bearer ${writerToken}`)
          .send(feedbackPayload());

        expect(response.status).toBe(201);
        expect(await feedbackCountFor(writerUserId)).toBe(before + 1);

        const rows = await db
          .select({
            reviewerId: aiSuggestionFeedback.reviewerId,
            reviewerEmail: aiSuggestionFeedback.reviewerEmail,
          })
          .from(aiSuggestionFeedback)
          .where(eq(aiSuggestionFeedback.reviewerId, writerUserId))
          .orderBy(aiSuggestionFeedback.createdAt);
        const last = rows[rows.length - 1]!;
        expect(last.reviewerId).toBe(writerUserId);
        expect(last.reviewerEmail).toBe(writerEmail);
      });

      it(`rejects a spoofed reviewer on POST ${route}`, async () => {
        // The global validation pipe runs with `forbidNonWhitelisted`, so an actor
        // field in the body is a 400 rather than a silently ignored value. That is
        // stronger than ignoring it: a caller learns the field is not honoured.
        const response = await http()
          .post(route)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            ...feedbackPayload(),
            reviewerId: '00000000-0000-4000-8000-000000000000',
            reviewerEmail: 'spoofed@ananya.local',
          });

        expect(response.status).toBe(400);
      });
    }
  });

  // -------------------------------------------------------------------------
  // ADMIN ONLY — training and dataset export (Pass 6)
  // -------------------------------------------------------------------------

  describe('training and export administration', () => {
    const REVIEW_ROUTE = '/ml/training/quarantine/some-record/review';
    const adminRoutes: Array<{ method: 'get' | 'post'; path: string }> = [
      { method: 'get', path: '/ml/feedback/export' },
      { method: 'get', path: '/ml/training/quarantine' },
      { method: 'post', path: REVIEW_ROUTE },
    ];

    it('rejects an anonymous caller on every admin route', async () => {
      for (const route of adminRoutes) {
        const response =
          route.method === 'get'
            ? await http().get(route.path)
            : await http().post(route.path).send({ status: 'VERIFIED' });
        expect(response.status).toBe(401);
      }
    });

    it('rejects a read-only caller on every admin route', async () => {
      for (const route of adminRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${readerToken}`)
                .send({ status: 'VERIFIED' });
        expect(response.status).toBe(403);
      }
    });

    it('rejects a component writer: editing components is not training administration', async () => {
      // The substantive change in Pass 6. `Inventory.Update` legitimately edits
      // component master data, and this route can append to the corpus the model is
      // trained from. Those are different capabilities, and the second is
      // materially more dangerous: it changes future model behaviour rather than one
      // row of master data.
      for (const route of adminRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${writerToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${writerToken}`)
                .send({ status: 'VERIFIED' });
        expect(response.status).toBe(403);
      }
    });

    it('rejects an invalid review status before any training write', async () => {
      const response = await http()
        .post(REVIEW_ROUTE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'NOT_A_REAL_STATUS' });

      // Validation runs after the guard, so an authorized caller with a bad body
      // gets a 400 — not a 403, and not a write.
      expect(response.status).toBe(400);
    });

    it('allows an administrator through the guard', async () => {
      for (const route of adminRoutes) {
        const response =
          route.method === 'get'
            ? await http()
                .get(route.path)
                .set('Authorization', `Bearer ${adminToken}`)
            : await http()
                .post(route.path)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'VERIFIED' });
        // The quarantine store does not exist in this checkout, so the service
        // reports that rather than writing. Either way the request reached the
        // handler, which is what the guard boundary is about.
        expect(response.status).toBeLessThan(300);
      }
    });

    it('never fabricates a reviewer identity for an anonymous review', async () => {
      // The service previously fell back to the literal `admin@ananya.internal`.
      // It is guarded now, so that fallback is unreachable over HTTP; this asserts
      // the guard is what prevents it rather than the fallback being harmless.
      const response = await http()
        .post(REVIEW_ROUTE)
        .send({ status: 'VERIFIED' });

      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain(
        'admin@ananya.internal',
      );
    });
  });

  // -------------------------------------------------------------------------
  // The attribute mutation route, re-checked after the Pass 5 audit
  // -------------------------------------------------------------------------

  describe('apply-bindings', () => {
    it('rejects an anonymous caller and a read-only caller', async () => {
      const payload = {
        attributeDefinitionId: '00000000-0000-4000-8000-000000000000',
        categoryId: '00000000-0000-4000-8000-000000000000',
      };

      const anonymous = await http()
        .post('/ml/attributes/apply-bindings')
        .send(payload);
      expect(anonymous.status).toBe(401);

      const readOnly = await http()
        .post('/ml/attributes/apply-bindings')
        .set('Authorization', `Bearer ${readerToken}`)
        .send(payload);
      expect(readOnly.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // The gap this pass did not close, asserted so it cannot be forgotten
  // -------------------------------------------------------------------------

  describe('component-surface aliases (documented gap, not fixed in this pass)', () => {
    it('POST /components/suggest/feedback is now guarded, closing the Pass 5 gap', async () => {
      // Pass 5 pinned this route as an OPEN gap: both it and `POST /ml/feedback`
      // call `MlService.recordFeedback`, so guarding the `/ml/*` alias alone left
      // the write reachable through the component surface.
      //
      // Pass 6 closed it. This test is the replacement for the pinning test — the
      // one Pass 5 said to delete once the route was guarded — and it asserts the
      // closure from the outside: anonymous is refused, and a writer's row carries
      // the SESSION's identity rather than nothing at all.
      const idsBefore = await allFeedbackIds();

      // Every assertion records status AND body. A Nest `Cannot POST …` body means
      // the router never matched the route (registration/module-initialization),
      // whereas a guard or handler refusal names its own reason — and the two have
      // completely different causes. Without the body an intermittent non-401 is
      // undiagnosable, which is exactly how the one-off 404 recorded in Pass 6A
      // stayed unexplained.
      const anonymous = await http()
        .post('/components/suggest/feedback')
        .send({
          items: [
            {
              suggestionType: 'CATEGORY',
              field: 'category',
              userAction: 'ACCEPTED',
            },
          ],
        });
      expect({
        status: anonymous.status,
        body: anonymous.body as unknown,
      }).toMatchObject({ status: 401 });
      expect(await allFeedbackIds()).toEqual(idsBefore);

      const readOnly = await http()
        .post('/components/suggest/feedback')
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
      expect({
        status: readOnly.status,
        body: readOnly.body as unknown,
      }).toMatchObject({ status: 403 });
      expect(await allFeedbackIds()).toEqual(idsBefore);

      const authorized = await http()
        .post('/components/suggest/feedback')
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          items: [
            {
              suggestionType: 'CATEGORY',
              field: 'category',
              userAction: 'ACCEPTED',
            },
          ],
        });
      expect({
        status: authorized.status,
        body: authorized.body as unknown,
      }).toMatchObject({ status: 201 });

      const idsAfter = await allFeedbackIds();
      const created = idsAfter.filter((id) => !idsBefore.includes(id));
      expect(created).toHaveLength(1);

      // The actor is the session's, which is what the route previously failed to
      // record at all.
      const rows = await db
        .select({
          reviewerId: aiSuggestionFeedback.reviewerId,
          reviewerEmail: aiSuggestionFeedback.reviewerEmail,
        })
        .from(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.id, created));
      expect(rows[0]!.reviewerId).toBe(writerUserId);
      expect(rows[0]!.reviewerEmail).toBe(writerEmail);

      // Remove exactly the row this test created.
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.id, created));
    });
  });
});
