import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { AttributesService } from '../../src/attributes/attributes.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { MlService } from '../../src/ml/ml.service';
import { AttributeIntelligenceFindingsService } from '../../src/ml/attribute-findings/attribute-finding.service';
import { AttributeReviewQueueService } from '../../src/ml/attribute-findings/attribute-review-queue.service';
import { AttributeReviewApplyService } from '../../src/ml/attribute-findings/attribute-review-apply.service';
import {
  buildExpectedAttributeState,
  toAttributeIdentitySnapshot,
  toCategorySnapshot,
} from '../../src/ml/attribute-findings/attribute-finding-expected-state';
import { ATTRIBUTE_AUDIT_SOURCES } from '../../src/ml/attribute-findings/attribute-audit.dtos';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeOptions,
  attributeIntelligenceFindings,
  categories,
  categoryAttributes,
  componentAttributeValues,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import {
  and,
  count,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from '@ananya/database/query';

/** Typed view of the response bodies (supertest bodies are `any`). */
interface QueuePageBody {
  items: Array<{
    id: string;
    issueType: string;
    status: string;
    applicationResult: string;
    reviewerId: string | null;
    reviewerEmail: string | null;
    attributeDefinitionId: string | null;
    categoryId: string | null;
    relatedAttributeDefinitionId: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    dismissed: number;
    stale: number;
    byCategory: Record<string, number>;
    byIssueType: Record<string, number>;
    applicationResults: { NOT_APPLIED: number; APPLIED: number };
    readyToApply: number;
  };
}

interface FindingBody {
  id: string;
  status: string;
  reviewerId: string | null;
  reviewerEmail: string | null;
  decisionNotes: string | null;
}

interface MessageBody {
  message?: string | string[];
  statusCode?: number;
}

/**
 * Pass 3: the secured Attribute Intelligence review API.
 *
 * These are HTTP tests, so they prove the guards are actually attached to each
 * route and that the queue's reads come from persisted findings rather than from a
 * re-analysis. Roles, users and sessions are created through the application's own
 * services, so the tokens exercised here are real session tokens.
 *
 * What is deliberately NOT tested here: applying findings (no such route exists),
 * and any attribute mutation by the queue (there is none — a decision records a
 * decision).
 */
describe('Attribute Intelligence review queue — API', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const SOURCE = ATTRIBUTE_AUDIT_SOURCES.DETERMINISTIC;

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let attributesService: AttributesService;
  let categoriesService: CategoriesService;
  let mlService: MlService;
  let findingsService: AttributeIntelligenceFindingsService;
  let applyService: AttributeReviewApplyService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAttributeIds: string[] = [];
  const createdCategoryIds: string[] = [];

  let readerToken = '';
  let writerToken = '';
  let writerUserId = '';
  let writerEmail = '';

  /** Producer stub, so audit routes can be driven deterministically. */
  let stubbedIssues: Array<Record<string, unknown>> = [];
  let producerCalls = 0;
  let originalAudit: MlService['auditAttributeLibrary'];

  /**
   * Finding ids that already existed when this suite started.
   *
   * The audit route is whole-library by design, so it can persist findings for the
   * real library rather than only for this suite's fixtures. Subject-based cleanup
   * cannot see those, so the suite also removes anything created during its run by
   * id diff — which touches nothing it did not create.
   */
  const preExistingFindingIds = new Set<string>();

  /** Resolvable gate so an audit can be held in flight on purpose. */
  let holdAudit: { promise: Promise<void>; release: () => void } | null = null;

  const QUEUE_ROUTE = '/ml/attributes/review-queue';
  const AUDIT_ROUTE = '/ml/attributes/review-queue/audit';
  const MARK_STALE_ROUTE = '/ml/attributes/review-queue/mark-stale';
  const DECISION_ROUTE = (id: string) =>
    `/ml/attributes/review-queue/${id}/decision`;
  const APPLY_BINDINGS_ROUTE = '/ml/attributes/apply-bindings';

  /** Typed HTTP entry point; `getHttpServer()` is untyped, hence the cast. */
  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
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
    attributesService = app.get(AttributesService);
    categoriesService = app.get(CategoriesService);
    mlService = app.get(MlService);
    findingsService = app.get(AttributeIntelligenceFindingsService);
    applyService = app.get(AttributeReviewApplyService);

    for (const row of await db
      .select({ id: attributeIntelligenceFindings.id })
      .from(attributeIntelligenceFindings)) {
      preExistingFindingIds.add(row.id);
    }

    // Intercept the producer: the API tests must not depend on which ML producer
    // answers, only on the fact that a queue READ does not call one.
    originalAudit = mlService.auditAttributeLibrary.bind(mlService);
    mlService.auditAttributeLibrary = (async () => {
      producerCalls += 1;
      if (holdAudit) await holdAudit.promise;
      return {
        summary: {
          totalAttributes: 0,
          possibleDuplicates: 0,
          suspiciousBindings: 0,
          missingExpectedAttributes: 0,
          unusedAttributes: 0,
          issuesCount: stubbedIssues.length,
        },
        issues: stubbedIssues,
        isMlActive: false,
        executionTimeMs: 1,
      };
    }) as unknown as MlService['auditAttributeLibrary'];

    // Three identities: a reader, a writer, and one with no inventory access at all.
    const readerRole = await rolesService.create({
      name: `E2E Attr Queue Reader ${runId}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E Attr Queue Writer ${runId}`,
      description: 'Authorization fixture: attribute edit access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    const outsiderRole = await rolesService.create({
      name: `E2E Attr Queue Outsider ${runId}`,
      description: 'Authorization fixture: no inventory permissions',
      permissions: ['Reports.Read'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id, outsiderRole.id);

    const reader = await usersService.create({
      email: `attrq-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'Attr',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `attrq-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'Attr',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    const outsider = await usersService.create({
      email: `attrq-outsider-${runId}@ananya.local`,
      password: 'OutsiderPassw0rd!',
      firstName: 'Attr',
      lastName: 'Outsider',
      roleId: outsiderRole.id,
    });
    createdUserIds.push(reader.id, writer.id, outsider.id);
    writerUserId = writer.id;
    writerEmail = writer.email;

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
    (app as unknown as { _outsiderToken?: string })._outsiderToken = (
      await authService.createSessionForUser(outsider.id)
    ).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    if (originalAudit) mlService.auditAttributeLibrary = originalAudit;

    // Findings created during this suite, including any the whole-library audit
    // produced for the real library. Removed by id diff so nothing else is touched.
    for (const row of await db
      .select({ id: attributeIntelligenceFindings.id })
      .from(attributeIntelligenceFindings)) {
      if (!preExistingFindingIds.has(row.id)) {
        await db
          .delete(attributeIntelligenceFindings)
          .where(eq(attributeIntelligenceFindings.id, row.id));
      }
    }

    // Findings first (their subjects cascade with the definitions), then feedback
    // (SET NULL subjects, so it must go before the rows it names), then fixtures.
    if (createdAttributeIds.length > 0) {
      await db
        .delete(attributeIntelligenceFindings)
        .where(
          inArray(
            attributeIntelligenceFindings.attributeDefinitionId,
            createdAttributeIds,
          ),
        );
      await db
        .delete(attributeIntelligenceFindings)
        .where(
          inArray(
            attributeIntelligenceFindings.relatedAttributeDefinitionId,
            createdAttributeIds,
          ),
        );
      await db
        .delete(aiSuggestionFeedback)
        .where(
          inArray(
            aiSuggestionFeedback.attributeDefinitionId,
            createdAttributeIds,
          ),
        );
      await db
        .delete(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, createdAttributeIds));
    }
    if (createdCategoryIds.length > 0) {
      await db
        .delete(attributeIntelligenceFindings)
        .where(
          inArray(attributeIntelligenceFindings.categoryId, createdCategoryIds),
        );
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.categoryId, createdCategoryIds));
    }
    // Audit rows written by the apply path this suite now exercises. Scoped by the
    // fixture ACTORS as well as the action, so it cannot reach into another suite's
    // rows — the apply spec writes the same action.
    if (createdUserIds.length > 0) {
      await db
        .delete(securityAuditLogs)
        .where(
          and(
            eq(
              securityAuditLogs.action,
              'ATTRIBUTE_INTELLIGENCE_FINDING_APPLIED',
            ),
            inArray(securityAuditLogs.userId, createdUserIds),
          ),
        );
    }
    for (const categoryId of createdCategoryIds) {
      await categoriesService.delete(categoryId).catch(() => undefined);
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

  beforeEach(() => {
    stubbedIssues = [];
    producerCalls = 0;
    holdAudit = null;
  });

  /**
   * The outsider's session token, minted in `beforeAll`.
   *
   * Throws rather than falling back to `''`. The fallback silently produced an
   * empty bearer token, which the guard reports as `401 Unauthorized` — so a token
   * that was never minted was indistinguishable from a genuine authorization
   * failure, and the test's real assertion (403) failed with a misleading status.
   * Failing loudly keeps the two cases apart.
   */
  const outsiderToken = () => {
    const token = (app as unknown as { _outsiderToken?: string })
      ._outsiderToken;
    if (!token) {
      throw new Error(
        'The outsider session token was never minted — check the fixture setup in beforeAll.',
      );
    }
    return token;
  };

  const createAttribute = async (suffix: string) => {
    const definition = await attributesService.createDefinition({
      code: `apiq_${runId.replace(/[^a-z0-9]/gi, '')}_${suffix}`.slice(0, 100),
      name: `API Queue ${suffix} ${runId}`,
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    });
    createdAttributeIds.push(definition.id);
    return definition;
  };

  const createCategory = async (suffix: string) => {
    const category = await categoriesService.create({
      code: `APIQ-${runId}-${suffix}`.slice(0, 100),
      name: `API Queue ${suffix} ${runId}`,
    });
    createdCategoryIds.push(category.id);
    return category;
  };

  /**
   * Creates a distinct persisted finding for a test.
   *
   * Each call carries a unique fixture marker in the observed state, because the
   * fingerprint covers that state: without it, two calls with the same subject and
   * issue type would resolve to the SAME row, and a test asserting on "its" finding
   * would silently be re-reading an earlier test's decided one.
   */
  let fixtureCounter = 0;
  const persistFinding = async (overrides: Record<string, unknown> = {}) => {
    fixtureCounter += 1;
    const attributeId = (overrides.attributeDefinitionId ??
      (await ensureAttribute())) as string;
    const result = await findingsService.persistFindings([
      {
        issueType: 'UNUSED_ATTRIBUTE',
        attributeDefinitionId: attributeId,
        title: `API fixture finding ${fixtureCounter} ${runId}`,
        description: 'Fixture for the review-queue API.',
        currentValue: {
          bindingCount: fixtureCounter,
          usageBand: 'NO_VALUES_NO_BINDINGS',
          fixtureIndex: fixtureCounter,
        },
        suggestedValue: null,
        confidence: 0.75,
        confidenceLevel: 'MEDIUM',
        evidence: [
          {
            type: 'existing_data',
            description: 'Zero references',
            weight: 0.75,
            source: 'database:component_attribute_values',
          },
        ],
        source: SOURCE,
        intelligenceVersion: 'attribute-audit-v1',
        ...overrides,
      },
    ]);
    return result.findings[0]!;
  };

  /** Lazily creates the default fixture attribute so 'this test has one'. */
  const ensureAttribute = async (): Promise<string> => {
    if (createdAttributeIds.length === 0) {
      await createAttribute('fixture');
    }
    return createdAttributeIds[0]!;
  };

  /**
   * Creates an ACCEPTED `MISSING_EXPECTED_ATTRIBUTE` finding and APPLIES it.
   *
   * Uses the real apply path rather than writing `application_result` directly, so
   * the fixtures the worklist filters are tested against are produced the same way
   * production produces them. Applying through the service (not HTTP) is deliberate:
   * the apply route has its own suite, and this spec is about the queue reading what
   * apply left behind.
   */
  const applyOneFinding = async (suffix: string) => {
    const attribute = await createAttribute(suffix);
    const category = await createCategory(suffix);
    fixtureCounter += 1;

    const persisted = await findingsService.persistFindings([
      {
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        attributeDefinitionId: attribute.id,
        categoryId: category.id,
        attributeCode: attribute.code,
        categoryCode: category.code,
        title: `Applied fixture ${suffix} ${runId}`,
        description: 'Fixture for the applied worklist.',
        currentValue: buildExpectedAttributeState({
          category: toCategorySnapshot(category),
          expectedAttributeCode: attribute.code,
          expectedAttributeName: attribute.name,
          existingAttribute: toAttributeIdentitySnapshot(attribute),
        }) as unknown as Record<string, unknown>,
        suggestedValue: { rule: 'DOMAIN_EXPECTATION' },
        confidence: 0.9,
        confidenceLevel: 'HIGH',
        evidence: [],
        source: SOURCE,
        intelligenceVersion: 'attribute-audit-v1',
        metadata: { fixtureIndex: fixtureCounter },
      },
    ]);
    const finding = persisted.findings[0]!;

    const accepted = await findingsService.recordDecision(
      finding.id,
      { decision: 'ACCEPTED' },
      { id: writerUserId, email: writerEmail },
    );

    const applied = await applyService.applyFinding(
      finding.id,
      {
        action: 'ADD_BINDING',
        expectedFingerprint: accepted.fingerprint,
      },
      { id: writerUserId, email: writerEmail },
    );

    return { attribute, category, finding: applied };
  };

  /** Counts of every attribute table, for the no-mutation assertions. */
  const attributeStateCounts = async () => {
    const [definitions, options, bindings, values, cats] = await Promise.all([
      db.select({ value: count() }).from(attributeDefinitions),
      db.select({ value: count() }).from(attributeOptions),
      db.select({ value: count() }).from(categoryAttributes),
      db.select({ value: count() }).from(componentAttributeValues),
      db.select({ value: count() }).from(categories),
    ]);
    return [
      Number(definitions[0]!.value),
      Number(options[0]!.value),
      Number(bindings[0]!.value),
      Number(values[0]!.value),
      Number(cats[0]!.value),
    ].join(',');
  };

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('rejects an unauthenticated queue read with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().get(QUEUE_ROUTE);
      expect(response.status).toBe(401);
    });

    it('rejects an unauthenticated finding read with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().get(
        `${QUEUE_ROUTE}/00000000-0000-4000-8000-000000000000`,
      );
      expect(response.status).toBe(401);
    });

    it('allows a reader holding Inventory.Read', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(200);
      expect(body<QueuePageBody>(response).items).toBeInstanceOf(Array);
    });

    it('rejects a user without Inventory.Read with 403', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${outsiderToken()}`);
      expect(response.status).toBe(403);
      expect(String(body<MessageBody>(response).message)).toMatch(
        /Inventory\.Read/,
      );
    });

    it('requires Inventory.Update to run an audit', async () => {
      if (!hasDbUrl) return;
      const unauthenticated = await http().post(AUDIT_ROUTE).send({});
      expect(unauthenticated.status).toBe(401);

      const readOnly = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({});
      expect(readOnly.status).toBe(403);
      expect(String(body<MessageBody>(readOnly).message)).toMatch(
        /Inventory\.Update/,
      );

      const authorized = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({});
      expect(authorized.status).toBe(201);
    });

    it('requires Inventory.Update to record a decision', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const unauthenticated = await http()
        .post(DECISION_ROUTE(finding.id))
        .send({ decision: 'ACCEPTED' });
      expect(unauthenticated.status).toBe(401);

      const readOnly = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(readOnly.status).toBe(403);

      // The refusal changed nothing.
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'PENDING',
      );

      const authorized = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(authorized.status).toBe(201);
    });

    it('requires Inventory.Update to mark findings stale', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const unauthenticated = await http()
        .post(MARK_STALE_ROUTE)
        .send({ ids: [finding.id] });
      expect(unauthenticated.status).toBe(401);

      const readOnly = await http()
        .post(MARK_STALE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ ids: [finding.id] });
      expect(readOnly.status).toBe(403);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'PENDING',
      );

      const authorized = await http()
        .post(MARK_STALE_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ ids: [finding.id], reason: 'Fixture staleness' });
      expect(authorized.status).toBe(201);
      expect(body<{ staledCount: number }>(authorized).staledCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Legacy route security
  // -------------------------------------------------------------------------

  describe('legacy /ml/attributes routes', () => {
    it('rejects an unauthenticated apply-bindings with 401 and writes no binding', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('legacy');
      const category = await createCategory('legacy');
      const before = await attributeStateCounts();

      const response = await http()
        .post(APPLY_BINDINGS_ROUTE)
        .send({ attributeId: attribute.id, categoryIds: [category.id] });

      expect(response.status).toBe(401);
      expect(await attributeStateCounts()).toBe(before);

      const bindings = await db
        .select({ id: categoryAttributes.id })
        .from(categoryAttributes)
        .where(
          and(
            eq(categoryAttributes.attributeDefinitionId, attribute.id),
            eq(categoryAttributes.categoryId, category.id),
          ),
        );
      expect(bindings).toHaveLength(0);
    });

    it('rejects a read-only user applying bindings with 403', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('legacy-readonly');
      const category = await createCategory('legacy-readonly');
      const before = await attributeStateCounts();

      const response = await http()
        .post(APPLY_BINDINGS_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ attributeId: attribute.id, categoryIds: [category.id] });

      expect(response.status).toBe(403);
      expect(await attributeStateCounts()).toBe(before);
    });

    it('still allows a writer to apply bindings (behaviour otherwise unchanged)', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('legacy-writer');
      const category = await createCategory('legacy-writer');

      const response = await http()
        .post(APPLY_BINDINGS_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ attributeId: attribute.id, categoryIds: [category.id] });

      expect(response.status).toBe(201);
      expect(body<{ appliedCount: number }>(response).appliedCount).toBe(1);

      const bindings = await db
        .select({ id: categoryAttributes.id })
        .from(categoryAttributes)
        .where(
          and(
            eq(categoryAttributes.attributeDefinitionId, attribute.id),
            eq(categoryAttributes.categoryId, category.id),
          ),
        );
      expect(bindings).toHaveLength(1);
    });

    it('no longer serves the recomputing queue payload', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody & { summary?: unknown }>(response);

      // The persisted shape: pagination metadata and grouped counts.
      expect(page.totalPages).toBeGreaterThanOrEqual(1);
      expect(page.counts).toBeDefined();
      // The legacy shape's `summary`/`audit-N` ids are gone.
      expect(page.summary).toBeUndefined();
      for (const item of page.items) {
        expect(item.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Reviewer identity
  // -------------------------------------------------------------------------

  describe('reviewer identity', () => {
    it('takes the reviewer from the authenticated session', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED', decisionNotes: 'Session identity' });

      expect(response.status).toBe(201);
      const decided = body<FindingBody>(response);
      expect(decided.reviewerId).toBe(writerUserId);
      expect(decided.reviewerEmail).toBe(writerEmail);
      expect(decided.decisionNotes).toBe('Session identity');
    });

    it('rejects a body that tries to assert reviewer identity', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      for (const field of ['reviewerId', 'reviewerEmail', 'reviewerName']) {
        const response = await http()
          .post(DECISION_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ decision: 'ACCEPTED', [field]: 'spoofed-identity' });

        expect(response.status).toBe(400);
      }

      // The finding is untouched by every rejected attempt.
      const reloaded = await findingsService.getFinding(finding.id);
      expect(reloaded.status).toBe('PENDING');
      expect(reloaded.reviewerId).toBeNull();
      expect(reloaded.reviewerEmail).toBeNull();
    });

    it('ignores nothing silently: a spoofed identity is a validation error, not a silent drop', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          decision: 'ACCEPTED',
          reviewerEmail: 'attacker@example.com',
        });

      expect(response.status).toBe(400);
      const messages = body<MessageBody>(response).message;
      expect(JSON.stringify(messages)).toMatch(/reviewerEmail/);
    });
  });

  // -------------------------------------------------------------------------
  // Queue reads
  // -------------------------------------------------------------------------

  describe('queue reads', () => {
    it('does NOT invoke the intelligence producer', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('noproducer');
      await persistFinding({ attributeDefinitionId: attribute.id });

      const list = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      const detail = await http()
        .get(`${QUEUE_ROUTE}/${(await persistenceIds(attribute.id))[0]}`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      // The single most important regression: opening the queue must not analyse.
      expect(producerCalls).toBe(0);

      async function persistenceIds(attributeId: string) {
        const rows = await db
          .select({ id: attributeIntelligenceFindings.id })
          .from(attributeIntelligenceFindings)
          .where(
            eq(
              attributeIntelligenceFindings.attributeDefinitionId,
              attributeId,
            ),
          );
        return rows.map((row) => row.id);
      }
    });

    it('creates no findings as a side effect of reading', async () => {
      if (!hasDbUrl) return;
      const before = await db
        .select({ value: count() })
        .from(attributeIntelligenceFindings);

      await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      await http()
        .get(`${QUEUE_ROUTE}?status=STALE,PENDING&pageSize=5`)
        .set('Authorization', `Bearer ${readerToken}`);

      const after = await db
        .select({ value: count() })
        .from(attributeIntelligenceFindings);
      expect(Number(after[0]!.value)).toBe(Number(before[0]!.value));
    });

    it('filters by attribute, category, issue type, status, confidence and search', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('filters');
      const category = await createCategory('filters');

      const unused = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 3, usageBand: 'NO_VALUES_WITH_BINDINGS' },
      });
      const binding = await persistFinding({
        issueType: 'SUSPICIOUS_BINDING',
        attributeDefinitionId: attribute.id,
        categoryId: category.id,
        currentValue: { bindingExists: true, usageBand: 'ZERO' },
        title: `Searchable title ${runId}`,
      });

      const byAttribute = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&source=${encodeURIComponent(SOURCE)}`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(body<QueuePageBody>(byAttribute).total).toBe(2);

      const byCategory = await http()
        .get(`${QUEUE_ROUTE}?categoryId=${category.id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      const categoryItems = body<QueuePageBody>(byCategory).items;
      expect(categoryItems.some((item) => item.id === binding.id)).toBe(true);

      const byIssueType = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&issueType=UNUSED_ATTRIBUTE`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(body<QueuePageBody>(byIssueType).items).toHaveLength(1);
      expect(body<QueuePageBody>(byIssueType).items[0]!.id).toBe(unused.id);

      const byIssueCategory = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&issueCategory=ATTRIBUTE_BINDING`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(body<QueuePageBody>(byIssueCategory).items).toHaveLength(1);

      const byConfidence = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&confidenceLevel=MEDIUM`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(body<QueuePageBody>(byConfidence).total).toBe(2);

      const bySearch = await http()
        .get(
          `${QUEUE_ROUTE}?search=${encodeURIComponent(`Searchable title ${runId}`)}`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(
        body<QueuePageBody>(bySearch).items.some(
          (item) => item.id === binding.id,
        ),
      ).toBe(true);
    });

    it('rejects an unknown status filter with 400 rather than an empty page', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(`${QUEUE_ROUTE}?status=NOT_A_STATUS`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(400);
    });

    it('rejects an unknown issue category filter with 400', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(`${QUEUE_ROUTE}?issueCategory=NOT_A_CATEGORY`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(400);
    });

    it('paginates with bounded page sizes and reports totals', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('paging');
      for (let index = 0; index < 3; index += 1) {
        await persistFinding({
          attributeDefinitionId: attribute.id,
          currentValue: {
            bindingCount: index,
            usageBand: 'VALUES_WITH_BINDINGS',
          },
          title: `Paged finding ${index} ${runId}`,
        });
      }

      const first = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&page=1&pageSize=2`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      const firstPage = body<QueuePageBody>(first);
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.page).toBe(1);
      expect(firstPage.pageSize).toBe(2);
      expect(firstPage.total).toBe(3);
      expect(firstPage.totalPages).toBe(2);

      const second = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&page=2&pageSize=2`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      const secondPage = body<QueuePageBody>(second);
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);

      // The repository ceiling is enforced, not the requested value.
      const oversize = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&pageSize=5000`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(oversize.status).toBe(400);
    });

    it('returns the whole filtered list when no page size is requested', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('unbounded');
      for (let index = 0; index < 3; index += 1) {
        await persistFinding({
          attributeDefinitionId: attribute.id,
          currentValue: {
            bindingCount: index,
            usageBand: 'VALUES_WITH_BINDINGS',
          },
          title: `Unbounded finding ${index} ${runId}`,
        });
      }

      // Exactly the request the review dialog makes: filters, sort, and no
      // pagination. Every match comes back, and `pageSize` describes the response
      // rather than a page nobody applied.
      const response = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&sortBy=createdAt&sortDirection=desc`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      expect(page.items).toHaveLength(3);
      expect(page.items).toHaveLength(page.total);
      expect(page.pageSize).toBe(3);
      expect(page.totalPages).toBe(1);

      // An empty result must not divide by zero when it reports its own size.
      const none = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&status=STALE`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      const empty = body<QueuePageBody>(none);
      expect(empty.items).toHaveLength(0);
      expect(empty.total).toBe(0);
      expect(empty.totalPages).toBe(1);
    });

    it('reports counts from persisted rows, ignoring the status filter', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('counts');
      const first = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 0, usageBand: 'NO_VALUES_NO_BINDINGS' },
      });
      await persistFinding({
        attributeDefinitionId: attribute.id,
        issueType: 'INCONSISTENT_CONFIG',
        field: 'unit_category',
        currentValue: {
          unitCategory: null,
          usageBand: 'NO_VALUES_NO_BINDINGS',
        },
      });

      await http()
        .post(DECISION_ROUTE(first.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });

      const response = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&status=PENDING`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      const page = body<QueuePageBody>(response);

      // The page honours the status filter...
      expect(page.total).toBe(1);
      expect(page.items.every((item) => item.status === 'PENDING')).toBe(true);
      // ...while the counts describe the whole filtered slice.
      expect(page.counts.total).toBe(2);
      expect(page.counts.pending).toBe(1);
      expect(page.counts.rejected).toBe(1);
      expect(page.counts.byIssueType.UNUSED_ATTRIBUTE).toBe(1);
      expect(page.counts.byIssueType.INCONSISTENT_CONFIG).toBe(1);
      expect(page.counts.byCategory.ATTRIBUTE_USAGE).toBe(1);
    });

    it('sorts by confidence in both directions', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('sorting');
      await persistFinding({
        attributeDefinitionId: attribute.id,
        confidence: 0.4,
        confidenceLevel: 'LOW',
        currentValue: { bindingCount: 1, usageBand: 'VALUES_WITH_BINDINGS' },
        title: `Low confidence ${runId}`,
      });
      await persistFinding({
        attributeDefinitionId: attribute.id,
        confidence: 0.99,
        confidenceLevel: 'HIGH',
        currentValue: { bindingCount: 2, usageBand: 'VALUES_WITH_BINDINGS' },
        title: `High confidence ${runId}`,
      });

      const ascending = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&sortBy=confidence&sortDirection=asc`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(body<QueuePageBody>(ascending).items[0]!.id).toBeDefined();
      const ascItems = body<QueuePageBody>(ascending).items;
      expect(ascItems).toHaveLength(2);

      const descending = await http()
        .get(
          `${QUEUE_ROUTE}?attributeDefinitionId=${attribute.id}&sortBy=confidence&sortDirection=desc`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      const descItems = body<QueuePageBody>(descending).items;

      // The two orderings are exact opposites.
      expect(descItems.map((item) => item.id)).toEqual(
        [...ascItems].reverse().map((item) => item.id),
      );
    });

    it('serves a finding by its stable persisted id and 404s an unknown one', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const response = await http()
        .get(`${QUEUE_ROUTE}/${finding.id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(200);
      expect(body<FindingBody>(response).id).toBe(finding.id);

      const missing = await http()
        .get(`${QUEUE_ROUTE}/00000000-0000-4000-8000-000000000000`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(missing.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  describe('decisions', () => {
    it('records ACCEPTED without mutating any attribute data', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('accept');
      const category = await createCategory('accept');
      const finding = await persistFinding({
        attributeDefinitionId: attribute.id,
        categoryId: category.id,
      });
      const before = await attributeStateCounts();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          decision: 'ACCEPTED',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      const decided = body<FindingBody>(response);
      expect(decided.status).toBe('ACCEPTED');
      expect(decided.reviewerEmail).toBe(writerEmail);

      // The core guarantee of this pass: accepting changes nothing in the library.
      expect(await attributeStateCounts()).toBe(before);
    });

    it('records REJECTED and DISMISSED', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('reject-dismiss');
      const rejected = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 5, usageBand: 'VALUES_WITH_BINDINGS' },
      });
      const dismissed = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 6, usageBand: 'VALUES_WITH_BINDINGS' },
      });

      const rejectResponse = await http()
        .post(DECISION_ROUTE(rejected.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });
      expect(body<FindingBody>(rejectResponse).status).toBe('REJECTED');

      const dismissResponse = await http()
        .post(DECISION_ROUTE(dismissed.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'DISMISSED' });
      expect(body<FindingBody>(dismissResponse).status).toBe('DISMISSED');
    });

    it('rejects an invalid decision value with 400', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();
      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'APPLIED' });
      expect(response.status).toBe(400);
    });

    it('lets exactly one of two competing decisions win', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const [accept, reject] = await Promise.all([
        http()
          .post(DECISION_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ decision: 'ACCEPTED' }),
        http()
          .post(DECISION_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ decision: 'REJECTED' }),
      ]);

      const statuses = [accept.status, reject.status].sort();
      expect(statuses).toEqual([201, 409]);

      const stored = await findingsService.getFinding(finding.id);
      expect(['ACCEPTED', 'REJECTED']).toContain(stored.status);
    });

    it('refuses a second decision on a terminal finding', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      const second = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });

      expect(second.status).toBe(409);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'ACCEPTED',
      );
    });

    it('refuses a decision taken against a stale revision (fingerprint mismatch)', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          decision: 'ACCEPTED',
          expectedFingerprint: 'not-the-current-fingerprint',
        });

      expect(response.status).toBe(409);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'PENDING',
      );
    });

    it('refuses to accept a finding whose expected state no longer holds', async () => {
      if (!hasDbUrl) return;
      const first = await createAttribute('stale-guard');
      const second = await createAttribute('stale-guard-pair');

      // A relationship finding's expected state is both attributes' identity and
      // configuration, so editing either side is exactly what makes it stale. The
      // snapshot is recorded the way the audit producer records it.
      const snapshot = {
        attributeA: {
          id: first.id,
          code: first.code,
          name: first.name,
          dataType: first.dataType,
          unitCategory: first.unitCategory,
          defaultUnit: first.defaultUnit,
          aliases: [],
          groupName: null,
          isActive: true,
        },
        attributeB: {
          id: second.id,
          code: second.code,
          name: second.name,
          dataType: second.dataType,
          unitCategory: second.unitCategory,
          defaultUnit: second.defaultUnit,
          aliases: [],
          groupName: null,
          isActive: true,
        },
        rule: 'LEXICAL_SIMILARITY',
      };
      const finding = await persistFinding({
        issueType: 'POSSIBLE_DUPLICATE',
        attributeDefinitionId: first.id,
        relatedAttributeDefinitionId: second.id,
        currentValue: snapshot,
        suggestedValue: { rule: 'LEXICAL_SIMILARITY' },
        metadata: { expectedState: snapshot },
      });

      // The reviewed attribute is edited after analysis.
      await attributesService.updateDefinition(first.id, {
        name: `Renamed after analysis ${runId}`,
      });

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      expect(response.status).toBe(409);
      expect(String(body<MessageBody>(response).message)).toMatch(/stale/i);

      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('STALE');
      expect(stored.metadata.staleReason).toBeTruthy();
    });

    it('refuses to accept an unused finding once the attribute gains a reference', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('stale-usage-band');
      const category = await createCategory('stale-usage-band');

      // The unused family's rule is the usage band, not the attribute's name:
      // "unused" survives a rename but not gaining a binding. Recorded through
      // `currentValue` alone, which the gate must also honour.
      const finding = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: {
          attribute: {
            id: attribute.id,
            code: attribute.code,
            name: attribute.name,
            dataType: attribute.dataType,
            unitCategory: attribute.unitCategory,
            defaultUnit: attribute.defaultUnit,
            aliases: [],
            groupName: null,
            isActive: true,
          },
          componentValueCount: 0,
          directBindingCount: 0,
          usageBand: 'NO_VALUES_NO_BINDINGS',
        },
      });

      await attributesService.bindCategoryToAttribute(attribute.id, {
        categoryId: category.id,
      });

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      expect(response.status).toBe(409);
      expect(String(body<MessageBody>(response).message)).toMatch(
        /now referenced/i,
      );
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'STALE',
      );
    });

    it('accepts a finding whose expected state still holds', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('stale-negative');
      const finding = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: {
          attribute: {
            id: attribute.id,
            code: attribute.code,
            name: attribute.name,
            dataType: attribute.dataType,
            unitCategory: attribute.unitCategory,
            defaultUnit: attribute.defaultUnit,
            aliases: [],
            groupName: null,
            isActive: true,
          },
          componentValueCount: 0,
          directBindingCount: 0,
          usageBand: 'NO_VALUES_NO_BINDINGS',
        },
      });

      // Nothing changed, so the gate must not refuse the decision.
      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      expect(response.status).toBe(201);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'ACCEPTED',
      );
    });

    it('refuses to accept an explicitly staled finding but allows rejecting it', async () => {
      if (!hasDbUrl) return;
      const finding = await persistFinding();
      await findingsService.markFindingsStale({
        ids: [finding.id],
        reason: 'Fixture staleness',
      });

      const accept = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(accept.status).toBe(409);

      const reject = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });
      expect(reject.status).toBe(201);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'REJECTED',
      );
    });

    it('404s a decision on a finding that does not exist', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .post(DECISION_ROUTE('00000000-0000-4000-8000-000000000000'))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  describe('audit', () => {
    it('persists producer findings and returns the Pass 2 summary', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('audit');
      stubbedIssues = [
        {
          id: 'audit-1',
          type: 'UNUSED_ATTRIBUTE',
          severity: 'INFO',
          attributeId: attribute.id,
          confidence: 0.75,
          confidenceLevel: 'MEDIUM',
          reason: 'No references',
          payload: { usageCount: 0, bindingCount: 0 },
          evidence: [],
        },
      ];

      const response = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({});

      expect(response.status).toBe(201);
      const result = body<{
        source: string;
        intelligenceVersion: string;
        scope: string;
        rawFindingCount: number;
        persistedCount: number;
        createdCount: number;
        refreshedCount: number;
        revivedCount: number;
        staleCount: number;
        skippedCount: number;
        warningCount: number;
        warnings: unknown[];
        byIssueType: Record<string, number>;
        isMlActive: boolean;
        executionTimeMs: number;
      }>(response);

      expect(result.source).toBe(SOURCE);
      expect(result.intelligenceVersion).toBe('attribute-audit-v1');
      expect(result.scope).toBe('WHOLE_LIBRARY');
      expect(result.rawFindingCount).toBe(1);
      expect(result.createdCount).toBe(1);
      expect(result.byIssueType.UNUSED_ATTRIBUTE).toBe(1);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(producerCalls).toBe(1);
    });

    it('is idempotent: a repeat audit creates nothing new', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('audit-idem');
      stubbedIssues = [
        {
          id: 'audit-1',
          type: 'UNUSED_ATTRIBUTE',
          severity: 'INFO',
          attributeId: attribute.id,
          confidence: 0.75,
          confidenceLevel: 'MEDIUM',
          reason: 'No references',
          payload: { usageCount: 0, bindingCount: 0 },
          evidence: [],
        },
      ];

      await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({});
      const second = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({});

      const result = body<{ createdCount: number; refreshedCount: number }>(
        second,
      );
      expect(result.createdCount).toBe(0);
      expect(result.refreshedCount).toBeGreaterThanOrEqual(1);
    });

    it('refuses a second audit while one is in flight', async () => {
      if (!hasDbUrl) return;

      let release: () => void = () => undefined;
      holdAudit = {
        promise: new Promise<void>((resolve) => {
          release = resolve;
        }),
        release: () => release(),
      };

      // supertest requests are lazy: attaching the `.then` is what actually sends
      // the first request and keeps it in flight while the second arrives.
      const first = http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({})
        .then((response) => response);

      try {
        // Give the first request time to enter the guard before the second arrives.
        await new Promise((resolve) => setTimeout(resolve, 250));

        const second = await http()
          .post(AUDIT_ROUTE)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({});
        expect(second.status).toBe(409);
        expect(String(body<MessageBody>(second).message)).toMatch(
          /already running/i,
        );

        holdAudit.release();
        const firstResponse = await first;
        expect(firstResponse.status).toBe(201);

        // The guard is released, so a later audit is accepted again.
        const third = await http()
          .post(AUDIT_ROUTE)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({});
        expect(third.status).toBe(201);
      } finally {
        // Never leave a held audit behind: the guard is process-wide for the app
        // instance, so a stuck one would fail every later audit test.
        holdAudit?.release();
        holdAudit = null;
      }
    });

    it('rejects an unknown body field rather than ignoring it', async () => {
      if (!hasDbUrl) return;
      // A caller passing a scope must be told the audit is whole-library, not left
      // believing a subset of the library was analysed.
      const response = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ scope: 'SELECTED', componentIds: ['anything'] });
      expect(response.status).toBe(400);
    });

    it('refuses audit parameters at the service boundary too', async () => {
      if (!hasDbUrl) return;
      const reviewQueue = app.get(AttributeReviewQueueService);
      await expect(reviewQueue.runAudit({ scope: 'SELECTED' })).rejects.toThrow(
        /takes no parameters/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mark stale
  // -------------------------------------------------------------------------

  describe('mark stale', () => {
    it('never stales a finding a reviewer already decided', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('stale-terminal');
      const decided = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 1, usageBand: 'VALUES_WITH_BINDINGS' },
      });
      const pending = await persistFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 2, usageBand: 'VALUES_WITH_BINDINGS' },
      });

      await http()
        .post(DECISION_ROUTE(decided.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      const response = await http()
        .post(MARK_STALE_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          ids: [decided.id, pending.id],
          reason: 'Explicit maintenance',
        });

      expect(response.status).toBe(201);
      expect(body<{ staledCount: number }>(response).staledCount).toBe(1);
      expect((await findingsService.getFinding(pending.id)).status).toBe(
        'STALE',
      );
      expect((await findingsService.getFinding(decided.id)).status).toBe(
        'ACCEPTED',
      );
    });

    it('rejects a request with no scope with 400', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .post(MARK_STALE_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ reason: 'Nothing to target' });
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Application-result filters and worklists (Pass 5)
  // -------------------------------------------------------------------------

  describe('application result filters', () => {
    it('filters to unapplied findings', async () => {
      if (!hasDbUrl) return;
      const pending = await persistFinding();
      const accepted = await persistFinding();
      await findingsService.recordDecision(
        accepted.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const response = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=NOT_APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      const ids = page.items.map((item) => item.id);
      expect(ids).toContain(pending.id);
      expect(ids).toContain(accepted.id);
      expect(
        page.items.every((item) => item.applicationResult === 'NOT_APPLIED'),
      ).toBe(true);
    });

    it('filters to applied findings, which stay readable', async () => {
      if (!hasDbUrl) return;
      const { finding } = await applyOneFinding('p5-applied');

      const response = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      const ids = page.items.map((item) => item.id);
      // The applied finding did not disappear from the queue: it is a historical
      // record of what changed, not a consumed work item.
      expect(ids).toContain(finding.findingId);
      expect(
        page.items.every((item) => item.applicationResult === 'APPLIED'),
      ).toBe(true);
      // Applying does not change the review status.
      const applied = page.items.find((item) => item.id === finding.findingId)!;
      expect(applied.status).toBe('ACCEPTED');
    });

    it('rejects an unknown application result with 400', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=SOMETHING_ELSE`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(400);
      // The message names the vocabulary, so a client learns the accepted values.
      expect(JSON.stringify(body<unknown>(response))).toContain('NOT_APPLIED');
    });

    it('composes with the status filter', async () => {
      if (!hasDbUrl) return;
      const { finding } = await applyOneFinding('p5-compose-status');

      const response = await http()
        .get(`${QUEUE_ROUTE}?status=ACCEPTED&applicationResult=APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      expect(page.items.map((item) => item.id)).toContain(finding.findingId);
      expect(
        page.items.every(
          (item) =>
            item.status === 'ACCEPTED' && item.applicationResult === 'APPLIED',
        ),
      ).toBe(true);
    });

    it('composes with the issue-type filter', async () => {
      if (!hasDbUrl) return;
      const { finding } = await applyOneFinding('p5-compose-type');

      const applied = await http()
        .get(
          `${QUEUE_ROUTE}?issueType=MISSING_EXPECTED_ATTRIBUTE&applicationResult=APPLIED`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(applied.status).toBe(200);
      expect(
        body<QueuePageBody>(applied).items.map((item) => item.id),
      ).toContain(finding.findingId);

      // The same filter with the other application state must NOT return it.
      const notApplied = await http()
        .get(
          `${QUEUE_ROUTE}?issueType=MISSING_EXPECTED_ATTRIBUTE&applicationResult=NOT_APPLIED`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(
        body<QueuePageBody>(notApplied).items.map((item) => item.id),
      ).not.toContain(finding.findingId);
    });

    it('paginates within an application filter without losing the total', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=NOT_APPLIED&pageSize=1&page=1`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      expect(page.items).toHaveLength(1);
      // The total describes the filter, not the page.
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.totalPages).toBe(Math.max(1, Math.ceil(page.total / 1)));
    });
  });

  describe('application result counts', () => {
    it('reports both application counts from persisted rows', async () => {
      if (!hasDbUrl) return;
      const { finding } = await applyOneFinding('p5-counts');

      const response = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(200);

      const counts = body<QueuePageBody>(response).counts;

      // Cross-checked against the database for BOTH values rather than against the
      // response: an assertion of the form "at least one" cannot tell a correct
      // count from a count that ignores the filter entirely.
      //
      // Deliberately NOT scoped to this suite's source. The request carried no
      // filters, so the API counted the whole table — and in a combined run other
      // specs' findings are in it. A source-scoped cross-check would compare two
      // different questions and pass or fail for the wrong reason.
      const rows = await db
        .select({
          applicationResult: attributeIntelligenceFindings.applicationResult,
          value: count(),
        })
        .from(attributeIntelligenceFindings)
        .groupBy(attributeIntelligenceFindings.applicationResult);
      const expected = Object.fromEntries(
        rows.map((row) => [row.applicationResult, Number(row.value)]),
      );

      expect(counts.applicationResults.APPLIED).toBe(expected.APPLIED ?? 0);
      expect(counts.applicationResults.NOT_APPLIED).toBe(
        expected.NOT_APPLIED ?? 0,
      );
      // The fixture was applied, so it is counted as applied and not as unapplied.
      expect(counts.applicationResults.APPLIED).toBeGreaterThanOrEqual(1);
      expect(finding.applicationResult).toBe('APPLIED');
    });

    it('keeps counts independent of page size and of the current page', async () => {
      if (!hasDbUrl) return;
      const full = await http()
        .get(`${QUEUE_ROUTE}?pageSize=100`)
        .set('Authorization', `Bearer ${readerToken}`);
      const oneRow = await http()
        .get(`${QUEUE_ROUTE}?pageSize=1&page=2`)
        .set('Authorization', `Bearer ${readerToken}`);

      const fullCounts = body<QueuePageBody>(full).counts;
      const oneRowCounts = body<QueuePageBody>(oneRow).counts;

      // A count derived from the loaded page would change here.
      expect(oneRowCounts.applicationResults).toEqual(
        fullCounts.applicationResults,
      );
      expect(oneRowCounts.readyToApply).toBe(fullCounts.readyToApply);
      expect(oneRowCounts.total).toBe(fullCounts.total);
    });

    it('does not let the application filter shrink the application counts', async () => {
      if (!hasDbUrl) return;
      const unfiltered = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      const filtered = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      // The selector's own counts describe the whole slice, so selecting an option
      // cannot change the numbers used to choose between options.
      expect(body<QueuePageBody>(filtered).counts.applicationResults).toEqual(
        body<QueuePageBody>(unfiltered).counts.applicationResults,
      );
    });

    it('preserves the Pass 3 family-count semantics', async () => {
      if (!hasDbUrl) return;
      const unfiltered = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      const statusFiltered = await http()
        .get(`${QUEUE_ROUTE}?status=REJECTED`)
        .set('Authorization', `Bearer ${readerToken}`);
      const applicationFiltered = await http()
        .get(`${QUEUE_ROUTE}?applicationResult=APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      // The status of each read is asserted first, with the body attached. These
      // three requests share one bearer token, so a non-200 here means the read
      // itself was refused — and the body says by what, instead of the failure
      // surfacing as a confusing "cannot read property of undefined" further down.
      for (const [label, response] of [
        ['unfiltered', unfiltered],
        ['status-filtered', statusFiltered],
        ['application-filtered', applicationFiltered],
      ] as const) {
        expect({
          request: label,
          status: response.status,
          body: response.body as unknown,
        }).toMatchObject({ status: 200 });
      }

      const baseline = body<QueuePageBody>(unfiltered).counts;
      // Family counts still ignore the status filter (Pass 3 behaviour)...
      expect(body<QueuePageBody>(statusFiltered).counts.byIssueType).toEqual(
        baseline.byIssueType,
      );
      // ...and now also ignore the application filter, for the same reason.
      expect(
        body<QueuePageBody>(applicationFiltered).counts.byIssueType,
      ).toEqual(baseline.byIssueType);
      // The status counts keep their Pass 3 meaning too.
      expect(body<QueuePageBody>(applicationFiltered).counts.pending).toBe(
        baseline.pending,
      );
    });

    it('reports the ready-to-apply worklist as accepted and unapplied', async () => {
      if (!hasDbUrl) return;
      // One accepted-and-unapplied finding is the only thing that belongs here.
      const ready = await persistFinding();
      await findingsService.recordDecision(
        ready.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const response = await http()
        .get(QUEUE_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`);
      const counts = body<QueuePageBody>(response).counts;

      // The worklist size is the intersection of two dimensions, so it is strictly
      // smaller than either count alone — which is what makes it worth exposing.
      expect(counts.readyToApply).toBeGreaterThanOrEqual(1);
      expect(counts.readyToApply).toBeLessThanOrEqual(counts.accepted);
      expect(counts.readyToApply).toBeLessThanOrEqual(
        counts.applicationResults.NOT_APPLIED,
      );
    });

    it('returns the ready-to-apply worklist itself when both filters are applied', async () => {
      if (!hasDbUrl) return;
      const ready = await persistFinding();
      await findingsService.recordDecision(
        ready.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );
      const { finding: applied } = await applyOneFinding('p5-worklist');

      const response = await http()
        .get(`${QUEUE_ROUTE}?status=ACCEPTED&applicationResult=NOT_APPLIED`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const page = body<QueuePageBody>(response);
      const ids = page.items.map((item) => item.id);
      expect(ids).toContain(ready.id);
      // An applied finding is not awaiting work, so it is not in this list.
      expect(ids).not.toContain(applied.findingId);
      expect(
        page.items.every(
          (item) =>
            item.status === 'ACCEPTED' &&
            item.applicationResult === 'NOT_APPLIED',
        ),
      ).toBe(true);
    });

    it('does not run the producer to answer a worklist query', async () => {
      if (!hasDbUrl) return;
      const before = producerCalls;
      await http()
        .get(`${QUEUE_ROUTE}?applicationResult=APPLIED&status=ACCEPTED`)
        .set('Authorization', `Bearer ${readerToken}`);
      // Reading the worklist is a database read, exactly like every other queue read.
      expect(producerCalls).toBe(before);
    });
  });

  describe('apply eligibility as the queue reports it', () => {
    it('marks an accepted, unapplied finding eligible and an applied one not', async () => {
      if (!hasDbUrl) return;
      const ready = await persistFinding();
      await findingsService.recordDecision(
        ready.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );
      const { finding: applied } = await applyOneFinding('p5-eligibility');

      const page = body<QueuePageBody>(
        await http()
          .get(`${QUEUE_ROUTE}?pageSize=100`)
          .set('Authorization', `Bearer ${readerToken}`),
      );

      const eligible = page.items.find((item) => item.id === ready.id)!;
      expect(eligible.status).toBe('ACCEPTED');
      expect(eligible.applicationResult).toBe('NOT_APPLIED');

      const done = page.items.find((item) => item.id === applied.findingId)!;
      expect(done.status).toBe('ACCEPTED');
      expect(done.applicationResult).toBe('APPLIED');
    });

    it('leaves a pending finding unapplied and a stale finding unapplied', async () => {
      if (!hasDbUrl) return;
      const pending = await persistFinding();
      const toStale = await persistFinding();
      await findingsService.markFindingsStale({
        ids: [toStale.id],
        reason: 'Eligibility fixture',
      });

      const page = body<QueuePageBody>(
        await http()
          .get(`${QUEUE_ROUTE}?pageSize=100`)
          .set('Authorization', `Bearer ${readerToken}`),
      );

      const pendingItem = page.items.find((item) => item.id === pending.id)!;
      expect(pendingItem.status).toBe('PENDING');
      expect(pendingItem.applicationResult).toBe('NOT_APPLIED');

      const staleItem = page.items.find((item) => item.id === toStale.id)!;
      expect(staleItem.status).toBe('STALE');
      expect(staleItem.applicationResult).toBe('NOT_APPLIED');
    });
  });

  // -------------------------------------------------------------------------
  // Authority boundary
  // -------------------------------------------------------------------------

  it('never mutates authoritative attribute data across the whole workflow', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('boundary');
    const category = await createCategory('boundary');
    // The suspicious-binding claim is "this binding exists and looks wrong", so the
    // binding must exist for the finding's expected state to hold at decision time.
    await attributesService.bindCategoryToAttribute(attribute.id, {
      categoryId: category.id,
    });
    stubbedIssues = [
      {
        id: 'audit-boundary',
        type: 'SUSPICIOUS_BINDING',
        severity: 'WARNING',
        attributeId: attribute.id,
        categoryId: category.id,
        confidence: 0.85,
        confidenceLevel: 'HIGH',
        reason: 'Suspicious',
        payload: { usageCount: 0 },
        evidence: [],
      },
    ];
    const before = await attributeStateCounts();

    // Audit (creates findings) → list → detail → accept.
    const auditResponse = await http()
      .post(AUDIT_ROUTE)
      .set('Authorization', `Bearer ${writerToken}`)
      .send({});
    expect(auditResponse.status).toBe(201);
    expect(body<{ createdCount: number }>(auditResponse).createdCount).toBe(1);

    const list = await http()
      .get(`${QUEUE_ROUTE}?categoryId=${category.id}&status=PENDING`)
      .set('Authorization', `Bearer ${readerToken}`);
    const finding = body<QueuePageBody>(list).items[0]!;
    expect(finding).toBeDefined();
    await http()
      .get(`${QUEUE_ROUTE}/${finding.id}`)
      .set('Authorization', `Bearer ${readerToken}`);
    await http()
      .post(DECISION_ROUTE(finding.id))
      .set('Authorization', `Bearer ${writerToken}`)
      .send({ decision: 'ACCEPTED' });

    expect(await attributeStateCounts()).toBe(before);
    expect((await findingsService.getFinding(finding.id)).status).toBe(
      'ACCEPTED',
    );
  });
});
