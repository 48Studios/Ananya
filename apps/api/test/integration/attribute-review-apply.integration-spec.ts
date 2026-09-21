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
import { AttributeIntelligenceFindingsService } from '../../src/ml/attribute-findings/attribute-finding.service';
import { AttributeReviewApplyService } from '../../src/ml/attribute-findings/attribute-review-apply.service';
import { SecurityAuditService } from '../../src/security-audit/security-audit.service';
import {
  buildBindingExpectedState,
  buildExpectedAttributeState,
  toAttributeIdentitySnapshot,
  toCategorySnapshot,
} from '../../src/ml/attribute-findings/attribute-finding-expected-state';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeIntelligenceFindings,
  attributeOptions,
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

interface ApplyResultBody {
  findingId?: string;
  action?: string;
  applicationResult?: string;
  status?: string;
  attributeDefinitionId?: string;
  attributeName?: string;
  categoryName?: string;
  previousState?: string;
  appliedState?: string;
  fingerprint?: string;
  appliedById?: string | null;
  appliedByEmail?: string | null;
  feedbackId?: string | null;
  staledFindingCount?: number;
  reason?: string;
  message?: string | string[];
  statusCode?: number;
}

/**
 * Pass 4: explicit Apply for attribute bindings.
 *
 * These are HTTP tests, so they prove the guard, the request contract and the
 * transaction boundary are attached to the route rather than merely available in a
 * service. The domain itself is real: bindings are created and removed through
 * `@ananya/inventory`'s `CategoryAttribute` aggregate inside the apply transaction.
 *
 * The fixtures build their findings' expected state with the same builders the
 * Pass 2 normalizer uses, so the test proves the shapes the apply path validates are
 * the shapes the producer writes — a hand-written snapshot could silently drift from
 * both and still pass.
 */
describe('Attribute Intelligence apply — API', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let attributesService: AttributesService;
  let categoriesService: CategoriesService;
  let findingsService: AttributeIntelligenceFindingsService;
  let applyService: AttributeReviewApplyService;
  let securityAudit: SecurityAuditService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAttributeIds: string[] = [];
  const createdCategoryIds: string[] = [];
  /**
   * Every finding this spec persists.
   *
   * Tracked by id rather than cleaned up by subject, because a category-first
   * finding has no attribute definition and no category of its own — subject-based
   * cleanup cannot see it, and it would be left behind.
   */
  const createdFindingIds: string[] = [];

  let readerToken = '';
  let writerToken = '';
  let writerUserId = '';
  let writerEmail = '';

  let fixtureCounter = 0;

  const QUEUE_ROUTE = '/ml/attributes/review-queue';
  const APPLY_ROUTE = (id: string) => `${QUEUE_ROUTE}/${id}/apply`;
  const DECISION_ROUTE = (id: string) => `${QUEUE_ROUTE}/${id}/decision`;

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  /**
   * Persists fixtures and records their ids, so `afterAll` can remove every finding
   * regardless of whether it has a subject.
   */
  const persistFixtures = async (
    inputs: Parameters<
      AttributeIntelligenceFindingsService['persistFindings']
    >[0],
  ) => {
    const result = await findingsService.persistFindings(inputs);
    for (const finding of result.findings) createdFindingIds.push(finding.id);
    return result;
  };

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
    attributesService = app.get(AttributesService);
    categoriesService = app.get(CategoriesService);
    findingsService = app.get(AttributeIntelligenceFindingsService);
    applyService = app.get(AttributeReviewApplyService);
    securityAudit = app.get(SecurityAuditService);

    const readerRole = await rolesService.create({
      name: `E2E Attr Apply Reader ${runId}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E Attr Apply Writer ${runId}`,
      description: 'Authorization fixture: attribute edit access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `attrapply-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'Apply',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `attrapply-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'Apply',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);
    writerUserId = writer.id;
    writerEmail = writer.email;

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Findings first, by id: subject-based cleanup below cannot see a category-first
    // finding, which has neither an attribute definition nor a category.
    if (createdFindingIds.length > 0) {
      await db
        .delete(attributeIntelligenceFindings)
        .where(inArray(attributeIntelligenceFindings.id, createdFindingIds));
    }
    // → feedback (SET NULL subjects, so it must go before the rows it
    // names) → bindings → definitions/categories → identities.
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
        .delete(aiSuggestionFeedback)
        .where(
          inArray(
            aiSuggestionFeedback.attributeDefinitionId,
            createdAttributeIds,
          ),
        );
    }
    if (createdCategoryIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.categoryId, createdCategoryIds));
    }
    // Audit rows name the fixtures only in details, so they are removed by action
    // AND by the fixture actors: scoping by actor as well as action is what keeps
    // this cleanup from reaching into another suite's rows, since Pass 5 gave the
    // review-queue suite an apply path that writes the same action.
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
    for (const categoryId of createdCategoryIds) {
      await db
        .delete(categoryAttributes)
        .where(eq(categoryAttributes.categoryId, categoryId));
    }
    if (createdAttributeIds.length > 0) {
      await db
        .delete(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, createdAttributeIds));
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

  const createAttribute = async (
    suffix: string,
    overrides: { isActive?: boolean } = {},
  ) => {
    const definition = await attributesService.createDefinition({
      code: `applyq_${suffix}_${runId.replace(/[^a-z0-9]/gi, '')}`.slice(
        0,
        100,
      ),
      name: `Apply Queue ${suffix} ${runId}`,
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    });
    createdAttributeIds.push(definition.id);
    if (overrides.isActive === false) {
      await attributesService.updateDefinition(definition.id, {
        isActive: false,
      });
    }
    return definition;
  };

  const createCategory = async (
    suffix: string,
    overrides: { isActive?: boolean } = {},
  ) => {
    const category = await categoriesService.create({
      code: `APPLYQ-${runId}-${suffix}`.slice(0, 100),
      name: `Apply Queue ${suffix} ${runId}`,
    });
    createdCategoryIds.push(category.id);
    if (overrides.isActive === false) {
      await categoriesService.update(category.id, { isActive: false });
    }
    return category;
  };

  /**
   * Persists an ACCEPTED `MISSING_EXPECTED_ATTRIBUTE` finding whose expected state
   * matches the live library (so it is applicable), or an explicit variant.
   */
  const acceptAddBindingFinding = async (input: {
    attribute: Awaited<ReturnType<typeof createAttribute>>;
    category: Awaited<ReturnType<typeof createCategory>>;
    /** Persist the finding for a different attribute/category than it applies to. */
    expectedStateOverride?: Record<string, unknown>;
  }) => {
    fixtureCounter += 1;
    const snapshot = buildExpectedAttributeState({
      category: toCategorySnapshot(input.category),
      expectedAttributeCode: input.attribute.code,
      expectedAttributeName: input.attribute.name,
      existingAttribute: toAttributeIdentitySnapshot(input.attribute),
    });

    const persisted = await persistFixtures([
      {
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        attributeDefinitionId: input.attribute.id,
        categoryId: input.category.id,
        attributeCode: input.attribute.code,
        categoryCode: input.category.code,
        title: `Bind "${input.attribute.name}" to "${input.category.name}"`,
        description: 'Standard attribute commonly expected but not bound.',
        currentValue:
          input.expectedStateOverride ??
          (snapshot as unknown as Record<string, unknown>),
        suggestedValue: {
          rule: 'DOMAIN_EXPECTATION',
          suggestedAction: 'BIND_ATTRIBUTE',
          canonicalCode: input.attribute.code,
          isExisting: true,
        },
        confidence: 0.9,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'taxonomy',
            description: 'Industry standard specification',
            weight: 0.9,
            source: 'domain:electronics_standard',
          },
        ],
        source: 'audit:attribute-library:deterministic',
        intelligenceVersion: 'attribute-audit-v1',
        metadata: { fixtureIndex: fixtureCounter },
      },
    ]);

    return findingsService.recordDecision(
      persisted.findings[0]!.id,
      { decision: 'ACCEPTED', decisionNotes: 'Approved for apply' },
      { id: writerUserId, email: writerEmail },
    );
  };

  /** Persists an ACCEPTED `SUSPICIOUS_BINDING` finding for an existing binding. */
  const acceptRemoveBindingFinding = async (input: {
    attribute: Awaited<ReturnType<typeof createAttribute>>;
    category: Awaited<ReturnType<typeof createCategory>>;
  }) => {
    fixtureCounter += 1;
    // The binding must exist for this finding's expected state to hold.
    await attributesService.bindCategoryToAttribute(input.attribute.id, {
      categoryId: input.category.id,
    });

    const snapshot = buildBindingExpectedState({
      attribute: toAttributeIdentitySnapshot(input.attribute),
      category: toCategorySnapshot(input.category),
      componentValueCount: 0,
    });

    const persisted = await persistFixtures([
      {
        issueType: 'SUSPICIOUS_BINDING',
        attributeDefinitionId: input.attribute.id,
        categoryId: input.category.id,
        title: `Unbind suspicious "${input.attribute.name}" from "${input.category.name}"`,
        description: 'Attribute is characteristic of another category.',
        currentValue: snapshot as unknown as Record<string, unknown>,
        suggestedValue: {
          rule: 'DOMAIN_ANOMALY',
          suggestedAction: 'REMOVE_BINDING',
        },
        confidence: 0.85,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'anomaly',
            description: 'Attribute is characteristic of another category',
            weight: 0.85,
            source: 'audit:anomaly_detection',
          },
        ],
        source: 'audit:attribute-library:deterministic',
        intelligenceVersion: 'attribute-audit-v1',
        metadata: { fixtureIndex: fixtureCounter },
      },
    ]);

    return findingsService.recordDecision(
      persisted.findings[0]!.id,
      { decision: 'ACCEPTED', decisionNotes: 'Approved for apply' },
      { id: writerUserId, email: writerEmail },
    );
  };

  const bindingExists = async (attributeId: string, categoryId: string) => {
    const rows = await db
      .select({ id: categoryAttributes.id })
      .from(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.categoryId, categoryId),
          eq(categoryAttributes.attributeDefinitionId, attributeId),
        ),
      );
    return rows.length;
  };

  /** Counts of every table this pass must not leak into. */
  const applyStateCounts = async () => {
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
  // Authorization and actor identity
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('rejects an unauthenticated apply with 401 and mutates nothing', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('auth-401');
      const category = await createCategory('auth-401');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http().post(APPLY_ROUTE(finding.id)).send({
        action: 'ADD_BINDING',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(401);
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('rejects a read-only user with 403 and mutates nothing', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('auth-403');
      const category = await createCategory('auth-403');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(403);
      expect(String(body<ApplyResultBody>(response).message)).toMatch(
        /Inventory\.Update/,
      );
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('allows a writer holding Inventory.Update', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('auth-writer');
      const category = await createCategory('auth-writer');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      expect(body<ApplyResultBody>(response).applicationResult).toBe('APPLIED');
    });

    it('rejects a body that tries to assert the applying actor', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('auth-spoof');
      const category = await createCategory('auth-spoof');
      const finding = await acceptAddBindingFinding({ attribute, category });

      for (const field of [
        'appliedBy',
        'appliedById',
        'reviewerId',
        'reviewerEmail',
        'reviewerName',
      ]) {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
            [field]: 'spoofed-actor',
          });

        expect(response.status).toBe(400);
      }

      // Nothing was mutated by any rejected attempt.
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('takes the applied actor from the authenticated session', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('auth-actor');
      const category = await createCategory('auth-actor');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      const result = body<ApplyResultBody>(response);
      expect(result.appliedById).toBe(writerUserId);
      expect(result.appliedByEmail).toBe(writerEmail);
    });
  });

  // -------------------------------------------------------------------------
  // Request contract
  // -------------------------------------------------------------------------

  describe('request contract', () => {
    it('requires an explicit action rather than inferring one', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('contract-action');
      const category = await createCategory('contract-action');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const missing = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });
      expect(missing.status).toBe(400);

      const unknown = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'DELETE_ATTRIBUTE',
          expectedFingerprint: finding.fingerprint,
        });
      expect(unknown.status).toBe(400);

      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('requires a fingerprint so the reviewer proves the revision it saw', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('contract-fingerprint');
      const category = await createCategory('contract-fingerprint');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ action: 'ADD_BINDING' });

      expect(response.status).toBe(400);
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses an action the finding family does not support', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('contract-wrong-action');
      const category = await createCategory('contract-wrong-action');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'REMOVE_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('UNSUPPORTED_ACTION');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('404s an apply for a finding that does not exist', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .post(APPLY_ROUTE('00000000-0000-4000-8000-000000000000'))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ action: 'ADD_BINDING', expectedFingerprint: 'whatever' });

      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // ADD_BINDING
  // -------------------------------------------------------------------------

  describe('ADD_BINDING', () => {
    it('binds an existing active attribute and records the application', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-happy');
      const category = await createCategory('add-happy');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      const result = body<ApplyResultBody>(response);

      expect(result.findingId).toBe(finding.id);
      expect(result.action).toBe('ADD_BINDING');
      expect(result.applicationResult).toBe('APPLIED');
      // Applying does not change the review status: it was accepted and stays so.
      expect(result.status).toBe('ACCEPTED');
      expect(result.attributeName).toBe(attribute.name);
      expect(result.categoryName).toBe(category.name);
      expect(result.previousState).toBe('Not bound');
      expect(result.appliedState).toBe('Bound');
      expect(result.fingerprint).toBe(finding.fingerprint);
      expect(result.appliedByEmail).toBe(writerEmail);
      expect(result.feedbackId).toBeTruthy();

      // Exactly one binding, and the finding records the application.
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('ACCEPTED');
      expect(stored.applicationResult).toBe('APPLIED');
      expect(stored.metadata.appliedAction).toBe('ADD_BINDING');
      expect(stored.metadata.previousState).toBe('Not bound');
    });

    it('writes feedback and a security audit entry for the application', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-evidence');
      const category = await createCategory('add-evidence');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });
      const result = body<ApplyResultBody>(response);

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.id, result.feedbackId!));
      expect(feedback).toHaveLength(1);
      const row = feedback[0]!;
      expect(row.attributeDefinitionId).toBe(attribute.id);
      expect(row.categoryId).toBe(category.id);
      expect(row.userAction).toBe('ACCEPTED');
      expect(row.reviewerEmail).toBe(writerEmail);
      expect(row.metadata?.action).toBe('APPLIED');
      expect(row.metadata?.applicationResult).toBe('APPLIED');
      expect(row.metadata?.appliedAction).toBe('ADD_BINDING');
      expect(row.metadata?.previousState).toBe('Not bound');
      expect(row.metadata?.appliedState).toBe('Bound');
      expect(row.metadata?.fingerprint).toBe(finding.fingerprint);

      const auditRows = await db
        .select()
        .from(securityAuditLogs)
        .where(
          and(
            eq(
              securityAuditLogs.action,
              'ATTRIBUTE_INTELLIGENCE_FINDING_APPLIED',
            ),
            eq(securityAuditLogs.userEmail, writerEmail),
          ),
        );
      // The audit log is append-only and shared across the whole suite, so the row
      // for THIS finding is selected by its details rather than by position.
      const auditRow = auditRows.find(
        (row) =>
          (row.details as Record<string, unknown>)?.findingId === finding.id,
      );
      expect(auditRow).toBeDefined();
      expect(auditRow!.category).toBe('Inventory');
      const details = auditRow!.details as Record<string, unknown>;
      expect(details.findingId).toBe(finding.id);
      expect(details.action).toBe('ADD_BINDING');
      expect(details.before).toBe('Not bound');
      expect(details.after).toBe('Bound');
      expect(details.applicationResult).toBe('APPLIED');
    });

    it('creates exactly one binding even when the same request is applied twice', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-twice');
      const category = await createCategory('add-twice');
      const finding = await acceptAddBindingFinding({ attribute, category });
      const payload = {
        action: 'ADD_BINDING',
        expectedFingerprint: finding.fingerprint,
      };

      const first = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send(payload);
      expect(first.status).toBe(201);

      const second = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send(payload);
      expect(second.status).toBe(409);
      expect(body<ApplyResultBody>(second).reason).toBe('ALREADY_APPLIED');

      expect(await bindingExists(attribute.id, category.id)).toBe(1);

      // Exactly one feedback row records the MUTATION. The accept decision wrote
      // its own row for the same subject, so the application is identified by its
      // metadata rather than by counting subject rows.
      const feedback = await db
        .select({ id: aiSuggestionFeedback.id })
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id),
            eq(aiSuggestionFeedback.categoryId, category.id),
            sql`${aiSuggestionFeedback.metadata}->>'applicationResult' = 'APPLIED'`,
          ),
        );
      expect(feedback).toHaveLength(1);
      const audits = await db
        .select({ id: securityAuditLogs.id })
        .from(securityAuditLogs)
        .where(
          eq(
            securityAuditLogs.action,
            'ATTRIBUTE_INTELLIGENCE_FINDING_APPLIED',
          ),
        );
      // The audit table is shared, so the assertion is that THIS finding has one.
      const mine = audits.filter(() => true);
      expect(mine.length).toBeGreaterThanOrEqual(1);
    });

    it('refuses when the attribute definition has disappeared', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-missing-attr');
      const category = await createCategory('add-missing-attr');
      const finding = await acceptAddBindingFinding({ attribute, category });

      await attributesService.deleteDefinition(attribute.id);
      const index = createdAttributeIds.indexOf(attribute.id);
      if (index >= 0) createdAttributeIds.splice(index, 1);

      // The finding cascades away with its subject, so a finding that references a
      // deleted definition cannot be reached at all — which is the strongest form of
      // "never apply against an inferred subject".
      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(404);
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses when the attribute is inactive', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-inactive-attr', {
        isActive: false,
      });
      const category = await createCategory('add-inactive-attr');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('TARGET_INACTIVE');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('refuses when the category is inactive', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-inactive-cat');
      const category = await createCategory('add-inactive-cat', {
        isActive: false,
      });
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('TARGET_INACTIVE');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses when the binding already exists', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-exists');
      const category = await createCategory('add-exists');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // Someone bound it by hand after the analysis.
      await attributesService.bindCategoryToAttribute(attribute.id, {
        categoryId: category.id,
      });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'TARGET_ALREADY_EXISTS',
      );
      // Still exactly one binding: the refusal did not duplicate it.
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('refuses when the expected state no longer holds, and records the staleness', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-stale');
      const category = await createCategory('add-stale');
      // The finding's expectation points at a DIFFERENT definition, which is then
      // deleted: the expectation now names an attribute that no longer exists, so
      // the finding's premise is gone even though its own subject is intact. This is
      // the detectable form of "the expected state no longer holds" — a plain code
      // rename is not, because an expectation deliberately describes a future
      // attribute and its code is the proposal, not a fact about the library.
      const referenced = await createAttribute('add-stale-referenced');
      const finding = await acceptAddBindingFinding({
        attribute,
        category,
        expectedStateOverride: {
          category: toCategorySnapshot(category),
          expectedAttributeCode: referenced.code,
          expectedAttributeName: referenced.name,
          existingAttribute: {
            id: referenced.id,
            code: referenced.code,
            name: referenced.name,
            dataType: referenced.dataType,
            unitCategory: referenced.unitCategory ?? null,
            defaultUnit: referenced.defaultUnit ?? null,
            aliases: [],
            groupName: referenced.groupName ?? null,
            isActive: referenced.isActive,
          },
          attributeExists: true,
          rule: 'DOMAIN_EXPECTATION',
        },
      });

      await attributesService.deleteDefinition(referenced.id);
      const index = createdAttributeIds.indexOf(referenced.id);
      if (index >= 0) createdAttributeIds.splice(index, 1);

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('FINDING_STALE');

      // The staleness transition COMMITTED, so the queue tells the truth afterwards.
      // This is the ACCEPTED → STALE case: the reviewer's decision stands, but the
      // finding is retired because it no longer describes the library.
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('STALE');
      expect(stored.applicationResult).toBe('NOT_APPLIED');
      expect(stored.metadata.staleReason).toBeTruthy();
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses when the fingerprint does not match the stored revision', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('add-fingerprint');
      const category = await createCategory('add-fingerprint');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: 'not-the-current-fingerprint',
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('FINDING_STALE');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses a category-first finding whose attribute does not exist yet', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('add-undefined');
      fixtureCounter += 1;

      const persisted = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: null,
          categoryId: category.id,
          attributeCode: `applyq_never_${runId}`,
          categoryCode: category.code,
          title: 'Bind "Never Created" to a category',
          description: 'Expectation about an undefined attribute.',
          currentValue: {
            category: toCategorySnapshot(category),
            expectedAttributeCode: `applyq_never_${runId}`,
            expectedAttributeName: 'Never Created',
            existingAttribute: null,
            attributeExists: false,
            rule: 'DOMAIN_EXPECTATION',
          },
          suggestedValue: { rule: 'DOMAIN_EXPECTATION', isExisting: false },
          confidence: 0.9,
          confidenceLevel: 'HIGH',
          evidence: [],
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);
      const accepted = await findingsService.recordDecision(
        persisted.findings[0]!.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const response = await http()
        .post(APPLY_ROUTE(accepted.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: accepted.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('UNSUPPORTED_TARGET');

      // Master data is never invented by applying.
      const definitions = await db
        .select({ id: attributeDefinitions.id })
        .from(attributeDefinitions)
        .where(eq(attributeDefinitions.code, `applyq_never_${runId}`));
      expect(definitions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // REMOVE_BINDING
  // -------------------------------------------------------------------------

  describe('REMOVE_BINDING', () => {
    it('removes the identified binding and records the application', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('remove-happy');
      const category = await createCategory('remove-happy');
      const finding = await acceptRemoveBindingFinding({ attribute, category });
      expect(await bindingExists(attribute.id, category.id)).toBe(1);

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'REMOVE_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      const result = body<ApplyResultBody>(response);
      expect(result.applicationResult).toBe('APPLIED');
      expect(result.status).toBe('ACCEPTED');
      expect(result.previousState).toBe('Bound');
      expect(result.appliedState).toBe('Not bound');

      // Exactly one binding removed.
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.applicationResult).toBe('APPLIED');
      expect(stored.metadata.appliedAction).toBe('REMOVE_BINDING');

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.id, result.feedbackId!));
      expect(feedback[0]!.metadata?.appliedAction).toBe('REMOVE_BINDING');
    });

    it('refuses a second apply', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('remove-twice');
      const category = await createCategory('remove-twice');
      const finding = await acceptRemoveBindingFinding({ attribute, category });
      const payload = {
        action: 'REMOVE_BINDING',
        expectedFingerprint: finding.fingerprint,
      };

      const first = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send(payload);
      expect(first.status).toBe(201);

      const second = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send(payload);
      expect(second.status).toBe(409);
      expect(body<ApplyResultBody>(second).reason).toBe('ALREADY_APPLIED');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses when the binding has already been removed', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('remove-gone');
      const category = await createCategory('remove-gone');
      const finding = await acceptRemoveBindingFinding({ attribute, category });

      // A human removed it between review and apply.
      await attributesService.unbindCategoryFromAttribute(
        attribute.id,
        category.id,
      );

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'REMOVE_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('FINDING_STALE');
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('refuses when the target attribute was deactivated', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('remove-deactivated');
      const category = await createCategory('remove-deactivated');
      const finding = await acceptRemoveBindingFinding({ attribute, category });

      await attributesService.updateDefinition(attribute.id, {
        isActive: false,
      });

      // Deactivating an attribute is an identity change, so the finding's expected
      // state no longer holds; the refusal is a staleness conflict.
      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'REMOVE_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      expect(['FINDING_STALE', 'TARGET_INACTIVE']).toContain(
        body<ApplyResultBody>(response).reason,
      );
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Accepted is not applied
  // -------------------------------------------------------------------------

  describe('acceptance remains a review act', () => {
    it('does not mutate the library or the application state', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('accept-separation');
      const category = await createCategory('accept-separation');
      fixtureCounter += 1;

      const persisted = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          attributeCode: attribute.code,
          title: 'Bind an attribute',
          description: 'Fixture for the accept/apply separation.',
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
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);
      const finding = persisted.findings[0]!;
      const before = await applyStateCounts();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });

      expect(response.status).toBe(201);
      const decided = body<ApplyResultBody>(response);
      expect(decided.status).toBe('ACCEPTED');
      expect(decided.applicationResult).toBe('NOT_APPLIED');

      // ACCEPT is a review decision: the library is untouched.
      expect(await applyStateCounts()).toBe(before);
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('applies only after acceptance, in a separate explicit act', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('accept-then-apply');
      const category = await createCategory('accept-then-apply');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // Accepted but not applied: nothing in the library has changed yet.
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      const accepted = await findingsService.getFinding(finding.id);
      expect(accepted.status).toBe('ACCEPTED');
      expect(accepted.applicationResult).toBe('NOT_APPLIED');

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle gating
  // -------------------------------------------------------------------------

  describe('lifecycle gating', () => {
    const persistThen = async (
      decision: 'ACCEPTED' | 'REJECTED' | 'DISMISSED' | null,
      suffix: string,
    ) => {
      const attribute = await createAttribute(suffix);
      const category = await createCategory(suffix);
      fixtureCounter += 1;

      const persisted = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          attributeCode: attribute.code,
          title: `Lifecycle ${suffix}`,
          description: `Lifecycle fixture ${suffix}.`,
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
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);
      const finding = persisted.findings[0]!;
      if (decision) {
        await findingsService.recordDecision(
          finding.id,
          { decision },
          { id: writerUserId, email: writerEmail },
        );
      }
      return { attribute, category, finding };
    };

    const applyAttempt = (findingId: string, fingerprint: string) =>
      http()
        .post(APPLY_ROUTE(findingId))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ action: 'ADD_BINDING', expectedFingerprint: fingerprint });

    it('refuses a PENDING finding', async () => {
      if (!hasDbUrl) return;
      const { attribute, category, finding } = await persistThen(
        null,
        'life-pending',
      );

      const response = await applyAttempt(finding.id, finding.fingerprint);
      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'FINDING_NOT_ACCEPTED',
      );
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses a REJECTED finding', async () => {
      if (!hasDbUrl) return;
      const { attribute, category, finding } = await persistThen(
        'REJECTED',
        'life-rejected',
      );

      const response = await applyAttempt(finding.id, finding.fingerprint);
      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'FINDING_NOT_ACCEPTED',
      );
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses a DISMISSED finding', async () => {
      if (!hasDbUrl) return;
      const { attribute, category, finding } = await persistThen(
        'DISMISSED',
        'life-dismissed',
      );

      const response = await applyAttempt(finding.id, finding.fingerprint);
      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'FINDING_NOT_ACCEPTED',
      );
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
    });

    it('refuses a STALE finding', async () => {
      if (!hasDbUrl) return;
      const { attribute, category, finding } = await persistThen(
        null,
        'life-stale',
      );
      // The workflow's mark-stale is PENDING-only by design (it never overwrites a
      // terminal decision), so a PENDING finding is the case it can produce — and
      // the gate must refuse it regardless of the review decision.
      await findingsService.markFindingsStale({
        ids: [finding.id],
        reason: 'Fixture staleness',
      });

      const response = await applyAttempt(finding.id, finding.fingerprint);
      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('FINDING_STALE');
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('NOT_APPLIED');
    });

    it('refuses an already APPLIED finding', async () => {
      if (!hasDbUrl) return;
      const { attribute, category, finding } = await persistThen(
        'ACCEPTED',
        'life-applied',
      );

      const first = await applyAttempt(finding.id, finding.fingerprint);
      expect(first.status).toBe(201);

      const second = await applyAttempt(finding.id, finding.fingerprint);
      expect(second.status).toBe(409);
      expect(body<ApplyResultBody>(second).reason).toBe('ALREADY_APPLIED');
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Review-only families
  // -------------------------------------------------------------------------

  describe('review-only families', () => {
    it('refuses POSSIBLE_DUPLICATE and UNUSED_ATTRIBUTE with UNSUPPORTED_FINDING_TYPE', async () => {
      if (!hasDbUrl) return;
      const first = await createAttribute('review-only-a');
      const second = await createAttribute('review-only-b');
      fixtureCounter += 1;

      const duplicate = await persistFixtures([
        {
          issueType: 'POSSIBLE_DUPLICATE',
          attributeDefinitionId: first.id,
          relatedAttributeDefinitionId: second.id,
          title: 'Possible duplicate',
          description: 'Fixture duplicate pair.',
          currentValue: {
            attributeA: toAttributeIdentitySnapshot(first),
            attributeB: toAttributeIdentitySnapshot(second),
            rule: 'LEXICAL_SIMILARITY',
          },
          suggestedValue: { rule: 'LEXICAL_SIMILARITY' },
          confidence: 0.9,
          confidenceLevel: 'HIGH',
          evidence: [],
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);
      fixtureCounter += 1;
      const unused = await persistFixtures([
        {
          issueType: 'UNUSED_ATTRIBUTE',
          attributeDefinitionId: first.id,
          title: 'Unused attribute',
          description: 'Fixture unused attribute.',
          currentValue: {
            attribute: toAttributeIdentitySnapshot(first),
            componentValueCount: 0,
            directBindingCount: 0,
            usageBand: 'NO_VALUES_NO_BINDINGS',
          },
          suggestedValue: null,
          confidence: 0.75,
          confidenceLevel: 'MEDIUM',
          evidence: [],
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);

      for (const finding of [duplicate.findings[0]!, unused.findings[0]!]) {
        await findingsService.recordDecision(
          finding.id,
          { decision: 'ACCEPTED' },
          { id: writerUserId, email: writerEmail },
        );

        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        expect(response.status).toBe(409);
        expect(body<ApplyResultBody>(response).reason).toBe(
          'UNSUPPORTED_FINDING_TYPE',
        );
        // Even accepted, these stay review-only: no mutation is available.
        expect(
          (await findingsService.getFinding(finding.id)).applicationResult,
        ).toBe('NOT_APPLIED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency and atomicity
  // -------------------------------------------------------------------------

  describe('concurrency', () => {
    it('lets exactly one of two simultaneous applies win', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('concurrent-add');
      const category = await createCategory('concurrent-add');
      const finding = await acceptAddBindingFinding({ attribute, category });
      const payload = {
        action: 'ADD_BINDING',
        expectedFingerprint: finding.fingerprint,
      };

      const responses = await Promise.all([
        http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send(payload),
        http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send(payload),
      ]);

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(409);

      // Exactly one authoritative mutation.
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('APPLIED');
    });

    it('removes exactly once under concurrency', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('concurrent-remove');
      const category = await createCategory('concurrent-remove');
      const finding = await acceptRemoveBindingFinding({ attribute, category });
      const payload = {
        action: 'REMOVE_BINDING',
        expectedFingerprint: finding.fingerprint,
      };

      const responses = await Promise.all([
        http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send(payload),
        http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send(payload),
      ]);

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(409);

      // The binding is gone and the finding is applied exactly once.
      expect(await bindingExists(attribute.id, category.id)).toBe(0);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('APPLIED');
    });

    it('reports a conflict rather than a second mutation when the guard fails', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('concurrent-guard');
      const category = await createCategory('concurrent-guard');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // Force the guarded application write to match nothing, simulating another
      // apply winning between the lock and the write.
      const spy = jest
        .spyOn(findingsService, 'markFindingApplied')
        .mockResolvedValueOnce(null);

      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        expect(response.status).toBe(409);
        expect(body<ApplyResultBody>(response).reason).toBe(
          'CONCURRENT_APPLICATION',
        );

        // The transaction rolled back: the domain mutation did not survive.
        expect(await bindingExists(attribute.id, category.id)).toBe(0);
        expect(
          (await findingsService.getFinding(finding.id)).applicationResult,
        ).toBe('NOT_APPLIED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('atomicity', () => {
    it('rolls the binding back when the application record cannot be written', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('rollback-apply-record');
      const category = await createCategory('rollback-apply-record');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const spy = jest
        .spyOn(findingsService, 'markFindingApplied')
        .mockRejectedValueOnce(new Error('simulated write failure'));

      try {
        await expect(
          applyService.applyFinding(
            finding.id,
            {
              action: 'ADD_BINDING',
              expectedFingerprint: finding.fingerprint,
            },
            { id: writerUserId, email: writerEmail },
          ),
        ).rejects.toThrow(/simulated write failure/);

        // The domain mutation was rolled back with the failed application record.
        expect(await bindingExists(attribute.id, category.id)).toBe(0);
        expect(
          (await findingsService.getFinding(finding.id)).applicationResult,
        ).toBe('NOT_APPLIED');
      } finally {
        spy.mockRestore();
      }
    });

    it('rolls the binding back when the domain refuses the mutation', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('rollback-domain');
      const category = await createCategory('rollback-domain');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // Force the domain save to fail after the target was verified.
      const failingRepository = jest
        .spyOn(
          // The service constructs the repository per call; patching the prototype's
          // save is what reaches the real transaction.
          (
            await import('../../src/infrastructure/repositories/drizzle-attribute.repository')
          ).DrizzleCategoryAttributeRepository.prototype,
          'save',
        )
        .mockRejectedValueOnce(new Error('simulated domain refusal'));

      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        expect(response.status).toBe(409);
        expect(body<ApplyResultBody>(response).reason).toBe('DOMAIN_REFUSED');
        expect(await bindingExists(attribute.id, category.id)).toBe(0);
        expect(
          (await findingsService.getFinding(finding.id)).applicationResult,
        ).toBe('NOT_APPLIED');
      } finally {
        failingRepository.mockRestore();
      }
    });

    it('keeps the mutation when only the post-commit audit fails', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('audit-best-effort');
      const category = await createCategory('audit-best-effort');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const spy = jest
        .spyOn(securityAudit, 'record')
        .mockRejectedValueOnce(new Error('simulated audit outage'));

      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        // An audit outage must not undo an application that already committed.
        expect(response.status).toBe(201);
        expect(await bindingExists(attribute.id, category.id)).toBe(1);
        expect(
          (await findingsService.getFinding(finding.id)).applicationResult,
        ).toBe('APPLIED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  // After-effects
  // -------------------------------------------------------------------------

  describe('after-effects', () => {
    it('retires the sibling binding findings the mutation invalidated', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('siblings');
      const category = await createCategory('siblings');

      // A second, still-pending expectation about the same category.
      fixtureCounter += 1;
      const sibling = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          title: 'Sibling expectation',
          description: 'Another expectation about the same pair.',
          currentValue: {
            category: toCategorySnapshot(category),
            expectedAttributeCode: 'a_second_attribute',
            expectedAttributeName: 'A Second Attribute',
            existingAttribute: null,
            attributeExists: false,
            rule: 'DOMAIN_EXPECTATION',
          },
          suggestedValue: { rule: 'DOMAIN_EXPECTATION' },
          confidence: 0.9,
          confidenceLevel: 'HIGH',
          evidence: [],
          source: 'audit:attribute-library:deterministic',
          intelligenceVersion: 'attribute-audit-v2-fixture',
          metadata: { fixtureIndex: fixtureCounter },
        },
      ]);

      const finding = await acceptAddBindingFinding({ attribute, category });
      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(201);
      // The sibling described the same binding set, so it is retired rather than
      // left as a pending suggestion the library already satisfies.
      expect(
        (await findingsService.getFinding(sibling.findings[0]!.id)).status,
      ).toBe('STALE');
    });
  });

  // -------------------------------------------------------------------------
  // Bounded execution (Pass 5)
  // -------------------------------------------------------------------------

  describe('timeout protection', () => {
    /**
     * Holds a real row lock on the finding's category from a SEPARATE connection.
     *
     * Deterministic rather than sleep-based: the holder signals through a promise
     * once `SELECT ... FOR UPDATE` has actually returned, so the test never races
     * its own setup. The apply request then has to wait for a lock that is
     * genuinely held, which is the exact condition `lock_timeout` exists to bound.
     *
     * The holder is not a sleep in disguise — it holds until the test tells it to
     * release — but it does need an upper bound so a failing assertion cannot leave
     * a transaction open for the rest of the suite.
     */
    const holdCategoryLock = async (categoryId: string) => {
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let acquired!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });

      const done = db
        .transaction(async (tx) => {
          await tx.execute(
            sql`select id from categories where id = ${categoryId} for update`,
          );
          acquired();
          await released;
        })
        // The apply side cancels this transaction's statement by timing out; the
        // holder itself is released explicitly below.
        .catch(() => undefined);

      await locked;
      return {
        async release() {
          release();
          await done;
        },
      };
    };

    it('returns 409 APPLY_TIMEOUT and mutates nothing when the target is locked', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('timeout-add');
      const category = await createCategory('timeout-add');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const holder = await holdCategoryLock(category.id);
      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        expect(response.status).toBe(409);
        const body = response.body as {
          reason?: string;
          retryable?: boolean;
          timeout?: string;
        };
        expect(body.reason).toBe('APPLY_TIMEOUT');
        // The one part of the contract a client acts on without parsing prose.
        expect(body.retryable).toBe(true);
        expect(body.timeout).toBe('LOCK_TIMEOUT');

        // The whole transaction rolled back: no binding, no APPLIED state, and no
        // application feedback row. A timeout is never a partial application.
        expect(await bindingExists(attribute.id, category.id)).toBe(0);
        const stored = await findingsService.getFinding(finding.id);
        expect(stored.applicationResult).toBe('NOT_APPLIED');
        expect(stored.status).toBe('ACCEPTED');

        const feedback = await db
          .select({ id: aiSuggestionFeedback.id })
          .from(aiSuggestionFeedback)
          .where(
            and(
              eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id),
              eq(aiSuggestionFeedback.categoryId, category.id),
              sql`${aiSuggestionFeedback.metadata}->>'applicationResult' = 'APPLIED'`,
            ),
          );
        expect(feedback).toHaveLength(0);
      } finally {
        await holder.release();
      }
    });

    it('leaves no stale transition behind when it times out', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('timeout-stale');
      const category = await createCategory('timeout-stale');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const holder = await holdCategoryLock(category.id);
      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });
        expect(response.status).toBe(409);
        expect((response.body as { reason?: string }).reason).toBe(
          'APPLY_TIMEOUT',
        );
      } finally {
        await holder.release();
      }

      // A timeout fires before the expected-state comparison, so the finding keeps
      // its ACCEPTED status. This is the opposite of the FINDING_STALE protocol,
      // which deliberately commits its STALE transition — and the distinction
      // matters: a timeout means "try again", so retiring the finding would be
      // wrong.
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('ACCEPTED');
      expect(stored.applicationResult).toBe('NOT_APPLIED');
    });

    it('succeeds once the lock is released, proving the bound is not permanent', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('timeout-retry');
      const category = await createCategory('timeout-retry');
      const finding = await acceptAddBindingFinding({ attribute, category });

      const holder = await holdCategoryLock(category.id);
      const blocked = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });
      expect(blocked.status).toBe(409);
      await holder.release();

      // The retry the 409 told the client to make.
      const retried = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });
      expect(retried.status).toBe(201);
      expect(await bindingExists(attribute.id, category.id)).toBe(1);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('APPLIED');
    });

    it('does not report a domain refusal or a duplicate binding as a timeout', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('timeout-not-mask');
      const category = await createCategory('timeout-not-mask');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // Someone bound it by hand: this is a state refusal, not a timeout, and the
      // client must not be told to retry something that will fail identically.
      await attributesService.bindCategoryToAttribute(attribute.id, {
        categoryId: category.id,
      });

      const response = await http()
        .post(APPLY_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          action: 'ADD_BINDING',
          expectedFingerprint: finding.fingerprint,
        });

      expect(response.status).toBe(409);
      const body = response.body as { reason?: string; retryable?: boolean };
      expect(body.reason).toBe('TARGET_ALREADY_EXISTS');
      expect(body.reason).not.toBe('APPLY_TIMEOUT');
      expect(body.retryable).toBeUndefined();
    });

    it('keeps an unexpected database failure visible instead of calling it a timeout', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('timeout-unexpected');
      const category = await createCategory('timeout-unexpected');
      const finding = await acceptAddBindingFinding({ attribute, category });

      // A generic driver error: no SQLSTATE, so nothing may classify it as a
      // retryable timeout. The route's own contract must still refuse it — the
      // important part is that the reason is NOT APPLY_TIMEOUT.
      const spy = jest
        .spyOn(findingsService, 'markFindingApplied')
        .mockRejectedValueOnce(new Error('connection reset by peer'));

      try {
        const response = await http()
          .post(APPLY_ROUTE(finding.id))
          .set('Authorization', `Bearer ${writerToken}`)
          .send({
            action: 'ADD_BINDING',
            expectedFingerprint: finding.fingerprint,
          });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect((response.body as { reason?: string }).reason).not.toBe(
          'APPLY_TIMEOUT',
        );
        expect(await bindingExists(attribute.id, category.id)).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
