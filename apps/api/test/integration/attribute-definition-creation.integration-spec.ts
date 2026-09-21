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
import {
  buildExpectedAttributeState,
  toCategorySnapshot,
  toAttributeIdentitySnapshot,
} from '../../src/ml/attribute-findings/attribute-finding-expected-state';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeIntelligenceFindings,
  attributeOptions,
  categories,
  categoryAttributes,
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
  attributeCode?: string;
  attributeName?: string;
  categoryId?: string;
  categoryName?: string;
  previousState?: string;
  appliedState?: string;
  fingerprint?: string;
  appliedById?: string | null;
  feedbackId?: string | null;
  bindingId?: string | null;
  createdDefinition?: {
    id: string;
    code: string;
    name: string;
    dataType: string;
    unitCategory: string | null;
    defaultUnit: string | null;
    optionCount: number;
  } | null;
  reason?: string;
  message?: string | string[];
  statusCode?: number;
}

const APPLIED_FEEDBACK_PREDICATE = sql`${aiSuggestionFeedback.metadata}->>'applicationResult' = 'APPLIED'`;

/**
 * Pass 7: explicit creation of an attribute definition from a
 * `MISSING_EXPECTED_ATTRIBUTE` finding.
 *
 * These are HTTP tests, so they prove the guard, the request contract and the
 * transaction boundary are attached to the route rather than merely available in a
 * service. The domain is real: the definition, its options and the category binding
 * are written through `@ananya/inventory`'s aggregates inside the apply transaction.
 *
 * Three properties are the point of the suite, and each is asserted on the database
 * rather than on the response:
 *
 *  1. **The proposal comes from the finding.** The request carries an action and a
 *     fingerprint only, and a body that tries to supply a code, name, data type or
 *     option is rejected by the validation pipe before the service runs.
 *  2. **Nothing partial survives.** Every refusal is asserted to have left zero
 *     definitions, zero options, zero bindings and `NOT_APPLIED` finding state.
 *  3. **Creation is not repeatable.** A second apply, a concurrent apply, and an
 *     apply after someone else created the definition all end with exactly one
 *     definition in the library.
 *
 * Findings are persisted with the same expected-state builders the Pass 2 normalizer
 * uses, so the test proves the shapes the apply path validates are the shapes the
 * producer writes.
 */
describe('Attribute definition creation — apply', () => {
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

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAttributeIds: string[] = [];
  const createdCategoryIds: string[] = [];
  /** Findings are tracked by id: a category-first finding has no other handle. */
  const createdFindingIds: string[] = [];

  let readerToken = '';
  let writerToken = '';
  let writerUserId = '';
  let writerEmail = '';

  let fixtureCounter = 0;

  const QUEUE_ROUTE = '/ml/attributes/review-queue';
  const APPLY_ROUTE = (id: string) => `${QUEUE_ROUTE}/${id}/apply`;

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  const persistFixtures = async (
    inputs: Parameters<
      AttributeIntelligenceFindingsService['persistFindings']
    >[0],
  ) => {
    const result = await findingsService.persistFindings(inputs);
    for (const finding of result.findings) createdFindingIds.push(finding.id);
    return result;
  };

  /** Adopts a definition created over HTTP, so cleanup can see it. */
  const adoptDefinitions = (ids: Array<string | undefined>) => {
    for (const id of ids) {
      if (id) createdAttributeIds.push(id);
    }
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

    const readerRole = await rolesService.create({
      name: `E2E Attr Create Reader ${runId}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E Attr Create Writer ${runId}`,
      description: 'Authorization fixture: attribute edit access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `attrcreate-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'Create',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `attrcreate-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'Create',
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

    /*
     * Cleanup is THREE deterministic scopes, and the combination matters:
     *
     *  1. **By id** — every finding this suite persisted, whatever shape it has. A
     *     category-first finding has no definition and its own category is one of
     *     the fixtures, so id is the only handle on it.
     *  2. **By code namespace** — every definition created by an apply, found by the
     *     suite's own run tag rather than by a handle a test was supposed to
     *     register. This is what closes the leak class the first version of this
     *     suite had: a test whose assertion failed *after* a successful apply never
     *     reached its `adoptDefinitions` call, and the created definition stayed
     *     behind. A failing test must not be able to leak a fixture.
     *  3. **Feedback by finding id** — the decision path writes its own feedback row
     *     whose subject columns are `SET NULL` when the finding is deleted, so a
     *     subject-based delete afterwards cannot see it. Removing it *before* the
     *     findings is the only order that works.
     */
    const namespace = runId.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const ownedDefinitions = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(ilike(attributeDefinitions.code, `%${namespace}%`));
    const definitionIds = [
      ...new Set([
        ...createdAttributeIds,
        ...ownedDefinitions.map((row) => row.id),
      ]),
    ];

    const ownedFindings = await db
      .select({ id: attributeIntelligenceFindings.id })
      .from(attributeIntelligenceFindings)
      .where(
        or(
          inArray(attributeIntelligenceFindings.id, createdFindingIds),
          definitionIds.length > 0
            ? inArray(
                attributeIntelligenceFindings.attributeDefinitionId,
                definitionIds,
              )
            : undefined,
          createdCategoryIds.length > 0
            ? inArray(
                attributeIntelligenceFindings.categoryId,
                createdCategoryIds,
              )
            : undefined,
        ),
      );
    const findingIds = [
      ...new Set([...createdFindingIds, ...ownedFindings.map((row) => row.id)]),
    ];

    if (findingIds.length > 0) {
      await db.delete(aiSuggestionFeedback).where(
        sql`${aiSuggestionFeedback.metadata}->>'findingId' IN (${sql.join(
          findingIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      await db
        .delete(attributeIntelligenceFindings)
        .where(inArray(attributeIntelligenceFindings.id, findingIds));
    }
    if (definitionIds.length > 0) {
      // Subject-based feedback, before the subjects it names.
      await db
        .delete(aiSuggestionFeedback)
        .where(
          inArray(aiSuggestionFeedback.attributeDefinitionId, definitionIds),
        );
      await db
        .delete(categoryAttributes)
        .where(
          inArray(categoryAttributes.attributeDefinitionId, definitionIds),
        );
      await db
        .delete(attributeOptions)
        .where(inArray(attributeOptions.attributeDefinitionId, definitionIds));
      await db
        .delete(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, definitionIds));
    }
    if (createdCategoryIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.categoryId, createdCategoryIds));
      await db
        .delete(categoryAttributes)
        .where(inArray(categoryAttributes.categoryId, createdCategoryIds));
    }
    // Audit rows name the fixtures only in `details`, so they are removed by action
    // AND by the fixture actors. Scoping by both keeps this from reaching another
    // suite's apply rows, which carry the same action.
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
      await categoriesService.delete(categoryId).catch(() => undefined);
    }
    await db.delete(securityAuditLogs).where(
      or(
        inArray(securityAuditLogs.userId, createdUserIds),
        ilike(securityAuditLogs.userEmail, `%${runId}%`),
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

  // -------------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------------

  /**
   * A code namespace unique to this suite and fixture.
   *
   * Already in the canonical `lower_snake` form the domain stores, so a fixture's
   * proposed code and the row the apply path creates are the same string. A hyphen
   * here would be normalized to `_` on write and every lookup would silently miss.
   */
  const codeFor = (suffix: string) =>
    `${suffix}_${runId}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 100);

  const createCategory = async (suffix: string) => {
    const category = await categoriesService.create({
      code: `CRTQ-${runId}-${suffix}`.slice(0, 100),
      name: `Create Queue ${suffix} ${runId}`,
    });
    createdCategoryIds.push(category.id);
    return category;
  };

  /** An existing definition, for collision and binding cases. */
  const createExistingDefinition = async (
    suffix: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const definition = await attributesService.createDefinition({
      code: codeFor(suffix),
      name: `Create Queue ${suffix} ${runId}`,
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
      ...overrides,
    });
    createdAttributeIds.push(definition.id);
    return definition;
  };

  interface ProposalOverrides {
    canonicalCode?: string;
    canonicalName?: string;
    dataType?: string | null;
    unitCategory?: string | null;
    defaultUnit?: string | null;
    groupName?: string | null;
    options?: unknown;
    isExisting?: unknown;
    omitData?: boolean;
  }

  /**
   * Persists and ACCEPTS a category-first `MISSING_EXPECTED_ATTRIBUTE` finding.
   *
   * `isExisting: false` and no `attributeDefinitionId` is exactly the shape the
   * producer writes when the library has no such attribute, which is the state that
   * resolves to `CREATE_DEFINITION`.
   */
  const acceptCreationFinding = async (input: {
    suffix: string;
    category: { id: string; code: string; name: string; isActive?: boolean };
    proposal?: ProposalOverrides;
    status?: 'PENDING' | 'REJECTED' | 'DISMISSED';
    /** Persist without recording any decision, so the finding stays PENDING. */
    skipAccept?: boolean;
  }) => {
    fixtureCounter += 1;
    const overrides = input.proposal ?? {};
    const canonicalCode = overrides.canonicalCode ?? codeFor(input.suffix);

    const expectedState = buildExpectedAttributeState({
      category: toCategorySnapshot({
        id: input.category.id,
        code: input.category.code,
        name: input.category.name,
        isActive: input.category.isActive ?? true,
      }),
      expectedAttributeCode: canonicalCode,
      expectedAttributeName:
        overrides.canonicalName ?? `Proposed ${input.suffix}`,
      existingAttribute: null,
    });

    const suggested: Record<string, unknown> = {
      rule: 'DOMAIN_EXPECTATION',
      suggestedAction: 'BIND_ATTRIBUTE',
      canonicalCode,
      canonicalName: overrides.canonicalName ?? `Proposed ${input.suffix}`,
      isExisting: overrides.isExisting ?? false,
      isRequired: false,
    };
    // `in` rather than `??`: a test that passes an explicit `null` means "the
    // producer declared nothing", which is a different case from omitting the field.
    const withDefault = <T>(
      key: keyof ProposalOverrides,
      fallback: T,
    ): T | null => (key in overrides ? (overrides[key] as T | null) : fallback);
    suggested.dataType =
      overrides.omitData === true
        ? undefined
        : (withDefault('dataType', 'QUANTITY') ?? undefined);
    suggested.unitCategory = withDefault('unitCategory', 'Resistance');
    suggested.defaultUnit = withDefault('defaultUnit', 'ohm');
    suggested.groupName = withDefault('groupName', 'Electrical');
    if (suggested.dataType === undefined) delete suggested.dataType;
    if (overrides.options !== undefined) suggested.options = overrides.options;

    const persisted = await persistFixtures([
      {
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        attributeDefinitionId: null,
        categoryId: input.category.id,
        attributeCode: canonicalCode,
        categoryCode: input.category.code,
        title: `Expect "${suggested.canonicalName as string}" for "${input.category.name}"`,
        description:
          'Standard attribute commonly expected but not in the library.',
        currentValue: expectedState as unknown as Record<string, unknown>,
        suggestedValue: suggested,
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
        source: 'audit:attribute-library:ml',
        intelligenceVersion: 'attribute-audit-v1',
        metadata: { fixtureIndex: fixtureCounter },
      },
    ]);

    const finding = persisted.findings[0]!;
    // The metadata the normalizer writes alongside `currentValue`; the apply path
    // reads either, and writing both is what the producer does.
    await db
      .update(attributeIntelligenceFindings)
      .set({
        metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || ${JSON.stringify(
          { expectedState },
        )}::jsonb`,
      })
      .where(eq(attributeIntelligenceFindings.id, finding.id));

    if (input.skipAccept) {
      return findingsService.getFinding(finding.id);
    }

    if (input.status && input.status !== 'PENDING') {
      await findingsService.recordDecision(
        finding.id,
        { decision: input.status, decisionNotes: 'Fixture: terminal decision' },
        { id: writerUserId, email: writerEmail },
      );
      return findingsService.getFinding(finding.id);
    }

    return findingsService.recordDecision(
      finding.id,
      { decision: 'ACCEPTED', decisionNotes: 'Approved for apply' },
      { id: writerUserId, email: writerEmail },
    );
  };

  const applyCreation = (
    findingId: string,
    fingerprint: string,
    token?: string,
  ) => {
    const call = http().post(APPLY_ROUTE(findingId));
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  /**
   * Asserts a status, reporting the response body when it differs.
   *
   * A bare `toBe(201)` says nothing about *why* a request failed, and for this route
   * a 401 is ambiguous: `Authentication is required…` means no token reached the
   * guard, while `Your session is invalid or has expired…` means the session lookup
   * failed. Pass 6B adopted this convention after an unreproducible 401 in a
   * shared-database run; without the body the next occurrence is equally
   * undiagnosable.
   */
  const expectStatus = (
    response: { status: number; body: unknown },
    expected: number,
    label: string,
  ) => {
    const actual = `${label}: ${response.status} ${JSON.stringify(response.body)}`;
    expect(actual).toBe(
      `${label}: ${expected} ${JSON.stringify(response.body)}`,
    );
  };

  /** How many definitions exist with this code — the duplicate proof. */
  const definitionCount = async (code: string) => {
    const rows = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.code, code));
    return rows.length;
  };

  const optionCount = async (definitionId: string) => {
    const rows = await db
      .select({ id: attributeOptions.id })
      .from(attributeOptions)
      .where(eq(attributeOptions.attributeDefinitionId, definitionId));
    return rows.length;
  };

  const bindingCount = async (definitionId: string, categoryId: string) => {
    const rows = await db
      .select({ id: categoryAttributes.id })
      .from(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.categoryId, categoryId),
          eq(categoryAttributes.attributeDefinitionId, definitionId),
        ),
      );
    return rows.length;
  };

  /** Every table this suite must not leak into, as one comparable string. */
  const creationStateCounts = async () => {
    const [definitions, options, bindings, cats] = await Promise.all([
      db.select({ value: count() }).from(attributeDefinitions),
      db.select({ value: count() }).from(attributeOptions),
      db.select({ value: count() }).from(categoryAttributes),
      db.select({ value: count() }).from(categories),
    ]);
    return [
      Number(definitions[0]!.value),
      Number(options[0]!.value),
      Number(bindings[0]!.value),
      Number(cats[0]!.value),
    ].join(',');
  };

  const appliedFeedbackRows = async (definitionId: string) => {
    const rows = await db
      .select({ id: aiSuggestionFeedback.id })
      .from(aiSuggestionFeedback)
      .where(
        and(
          eq(aiSuggestionFeedback.attributeDefinitionId, definitionId),
          APPLIED_FEEDBACK_PREDICATE,
        ),
      );
    return rows.length;
  };

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('creating a definition from a finding', () => {
    it('creates the proposed definition, binds it, and records the application', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('happy');
      const finding = await acceptCreationFinding({
        suffix: 'happy',
        category,
      });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(201);
      const result = body<ApplyResultBody>(response);
      expect(result.action).toBe('CREATE_DEFINITION');
      expect(result.applicationResult).toBe('APPLIED');
      expect(result.status).toBe('ACCEPTED');
      expect(result.createdDefinition).toBeTruthy();
      expect(result.createdDefinition?.code).toBe(codeFor('happy'));
      expect(result.createdDefinition?.dataType).toBe('QUANTITY');
      expect(result.createdDefinition?.unitCategory).toBe('Resistance');
      expect(result.createdDefinition?.defaultUnit).toBe('ohm');
      expect(result.bindingId).toBeTruthy();
      expect(result.appliedById).toBe(writerUserId);

      adoptDefinitions([result.createdDefinition?.id]);

      // The definition exists, exactly once, with the proposal's values.
      const created = await attributesService.getDefinitionById(
        result.createdDefinition!.id,
      );
      expect(created.code).toBe(codeFor('happy'));
      expect(created.name).toBe('Proposed happy');
      expect(created.dataType).toBe('QUANTITY');
      expect(created.unitCategory).toBe('Resistance');
      expect(created.defaultUnit).toBe('ohm');
      expect(created.groupName).toBe('Electrical');
      expect(created.isActive).toBe(true);
      expect(await definitionCount(codeFor('happy'))).toBe(1);

      // The binding the expectation asked for exists exactly once.
      expect(
        await bindingCount(result.createdDefinition!.id, category.id),
      ).toBe(1);

      // The finding records acceptance AND application, in that combination.
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('ACCEPTED');
      expect(stored.applicationResult).toBe('APPLIED');
      expect(stored.metadata.createdDefinition).toMatchObject({
        id: result.createdDefinition!.id,
      });

      // Feedback and audit both name the created definition.
      expect(await appliedFeedbackRows(result.createdDefinition!.id)).toBe(1);
      const audit = await db
        .select({
          id: securityAuditLogs.id,
          details: securityAuditLogs.details,
        })
        .from(securityAuditLogs)
        .where(
          and(
            eq(
              securityAuditLogs.action,
              'ATTRIBUTE_INTELLIGENCE_FINDING_APPLIED',
            ),
            eq(securityAuditLogs.userId, writerUserId),
            sql`${securityAuditLogs.details}->>'findingId' = ${finding.id}`,
          ),
        );
      expect(audit).toHaveLength(1);
      expect(audit[0]!.details).toMatchObject({
        action: 'CREATE_DEFINITION',
        createdDefinition: { code: codeFor('happy') },
      });

      // Exactly one definition, one binding and one category were added.
      const after = await creationStateCounts();
      const beforeCounts = before.split(',').map(Number);
      const afterCounts = after.split(',').map(Number);
      expect(afterCounts[0]! - beforeCounts[0]!).toBe(1);
      expect(afterCounts[2]! - beforeCounts[2]!).toBe(1);
      expect(afterCounts[1]! - beforeCounts[1]!).toBe(0);
      expect(afterCounts[3]! - beforeCounts[3]!).toBe(0);
    });

    it('creates the options a SELECT proposal declares', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('options');
      const finding = await acceptCreationFinding({
        suffix: 'options',
        category,
        proposal: {
          dataType: 'SELECT',
          unitCategory: null,
          defaultUnit: null,
          options: [
            { code: 'SMD', label: 'SMD / SMT' },
            { code: 'TH-Axial', label: 'Through Hole (Axial)', sortOrder: 2 },
          ],
        },
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(201);
      const result = body<ApplyResultBody>(response);
      adoptDefinitions([result.createdDefinition?.id]);
      expect(result.createdDefinition?.optionCount).toBe(2);
      expect(await optionCount(result.createdDefinition!.id)).toBe(2);

      const options = await db
        .select({ code: attributeOptions.code, label: attributeOptions.label })
        .from(attributeOptions)
        .where(
          eq(
            attributeOptions.attributeDefinitionId,
            result.createdDefinition!.id,
          ),
        );
      expect(options.map((option) => option.code).sort()).toEqual([
        'SMD',
        'TH-Axial',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('proposal validation', () => {
    const expectRefused = async (input: {
      suffix: string;
      proposal: ProposalOverrides;
    }) => {
      const category = await createCategory(input.suffix);
      const finding = await acceptCreationFinding({
        suffix: input.suffix,
        category,
        proposal: input.proposal,
      });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      const result = body<ApplyResultBody>(response);
      expect(result.reason).toBe('INVALID_PROPOSAL');
      expect(typeof result.message).toBe('string');

      // Nothing was written, and the finding is still approved and unapplied — a
      // malformed proposal is a producer defect, not a stale finding.
      expect(await creationStateCounts()).toBe(before);
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.applicationResult).toBe('NOT_APPLIED');
      expect(stored.status).toBe('ACCEPTED');
      expect(
        await definitionCount(
          input.proposal.canonicalCode ?? codeFor(input.suffix),
        ),
      ).toBe(0);

      return result.message as string;
    };

    it('refuses a proposal with no data type', async () => {
      const message = await expectRefused({
        suffix: 'no-type',
        proposal: { omitData: true },
      });
      expect(message).toMatch(/data type/i);
    });

    it('refuses an unknown data type', async () => {
      const message = await expectRefused({
        suffix: 'bad-type',
        proposal: { dataType: 'MAGIC' },
      });
      expect(message).toMatch(/not one of the library's types/i);
    });

    it('refuses a code that is not a canonical identifier', async () => {
      const message = await expectRefused({
        suffix: 'bad-code',
        proposal: { canonicalCode: '2n2222 transistor' },
      });
      expect(message).toMatch(/not a valid attribute code/i);
    });

    it('refuses an empty name', async () => {
      const message = await expectRefused({
        suffix: 'bad-name',
        proposal: { canonicalName: '   ' },
      });
      expect(message).toMatch(/does not carry a name|not usable/i);
    });

    it('refuses a unit category on a data type that cannot carry one', async () => {
      const message = await expectRefused({
        suffix: 'unit-on-select',
        proposal: {
          dataType: 'SELECT',
          unitCategory: 'Resistance',
          defaultUnit: 'ohm',
        },
      });
      expect(message).toMatch(/cannot declare a unit category/i);
    });

    it('refuses a default unit from another dimension', async () => {
      const message = await expectRefused({
        suffix: 'unit-dimension',
        proposal: { unitCategory: 'Temperature', defaultUnit: 'ohm' },
      });
      expect(message).toMatch(
        /measures Resistance, but the proposal declares/i,
      );
    });

    it('refuses a default unit without a unit category', async () => {
      const message = await expectRefused({
        suffix: 'unit-orphan',
        proposal: { unitCategory: null, defaultUnit: 'ohm' },
      });
      expect(message).toMatch(/needs the dimension it belongs to/i);
    });

    it('refuses options on a data type that has no option set', async () => {
      const message = await expectRefused({
        suffix: 'options-on-quantity',
        proposal: { options: [{ code: 'A', label: 'A' }] },
      });
      expect(message).toMatch(/cannot have a closed option set/i);
    });

    it('refuses a duplicate option code', async () => {
      const message = await expectRefused({
        suffix: 'duplicate-options',
        proposal: {
          dataType: 'SELECT',
          unitCategory: null,
          defaultUnit: null,
          options: [
            { code: 'SMD', label: 'SMD / SMT' },
            { code: 'SMD', label: 'Surface Mount' },
          ],
        },
      });
      expect(message).toMatch(/twice/i);
    });

    it('refuses an option with no label', async () => {
      const message = await expectRefused({
        suffix: 'empty-option',
        proposal: {
          dataType: 'SELECT',
          unitCategory: null,
          defaultUnit: null,
          options: [{ code: 'SMD', label: '   ' }],
        },
      });
      expect(message).toMatch(/empty code or label/i);
    });
  });

  // -------------------------------------------------------------------------
  // Target state
  // -------------------------------------------------------------------------

  describe('target state', () => {
    it('refuses a category that was deleted, and creates nothing', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('gone-category');
      const finding = await acceptCreationFinding({
        suffix: 'gone-category',
        category,
      });

      // `attribute_intelligence_findings.category_id` is ON DELETE SET NULL, so a
      // deleted category leaves the finding with no category at all rather than a
      // dangling reference — which is what the refusal below reports. The
      // `TARGET_NOT_FOUND` branch is the defence for a category that disappears
      // inside the transaction, and is unreachable from here by construction.
      await db.delete(categories).where(eq(categories.id, category.id));
      createdCategoryIds.splice(createdCategoryIds.indexOf(category.id), 1);

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('UNSUPPORTED_TARGET');
      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount(codeFor('gone-category'))).toBe(0);
    });

    it('refuses an inactive category, and creates nothing', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('inactive-category');
      const finding = await acceptCreationFinding({
        suffix: 'inactive-category',
        category,
      });
      await categoriesService.update(category.id, { isActive: false });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('TARGET_INACTIVE');
      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount(codeFor('inactive-category'))).toBe(0);
    });

    it('retires the finding instead of duplicating a definition created after analysis', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('collision-code');
      const finding = await acceptCreationFinding({
        suffix: 'collision-code',
        category,
      });

      // Another actor creates the definition between analysis and apply.
      const existing = await createExistingDefinition('collision-code');
      expect(existing.code).toBe(codeFor('collision-code'));

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      const result = body<ApplyResultBody>(response);
      expect(result.reason).toBe('TARGET_ALREADY_EXISTS');

      // No second definition, no binding, no partial write.
      expect(await definitionCount(codeFor('collision-code'))).toBe(1);
      expect(await bindingCount(existing.id, category.id)).toBe(0);
      expect(await creationStateCounts()).toBe(before);

      // The finding's premise moved, so it is retired rather than left applicable
      // forever, and it is NOT marked applied.
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('STALE');
      expect(stored.applicationResult).toBe('NOT_APPLIED');
      expect(stored.metadata.staleReason).toEqual(
        expect.stringContaining('already exists'),
      );
    });

    it('treats an existing definition’s alias as an existing attribute', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('collision-alias');
      const finding = await acceptCreationFinding({
        suffix: 'collision-alias',
        category,
      });

      // Same identity under a different code: only the alias matches.
      const existing = await createExistingDefinition('collision-alias-owner', {
        aliases: [codeFor('collision-alias')],
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'TARGET_ALREADY_EXISTS',
      );
      expect(await definitionCount(codeFor('collision-alias'))).toBe(0);
      expect(await bindingCount(existing.id, category.id)).toBe(0);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'STALE',
      );
    });

    it('treats a matching name under another code as an existing attribute', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('collision-name');
      const finding = await acceptCreationFinding({
        suffix: 'collision-name',
        category,
        proposal: { canonicalName: `Proposed collision-name ${runId}` },
      });

      await createExistingDefinition('collision-name-owner', {
        name: `Proposed collision-name ${runId}`,
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'TARGET_ALREADY_EXISTS',
      );
      expect(await definitionCount(codeFor('collision-name'))).toBe(0);
    });

    it('refuses to create when two definitions already claim the proposed identity', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('collision-ambiguous');
      const finding = await acceptCreationFinding({
        suffix: 'collision-ambiguous',
        category,
      });

      // Two definitions claiming the same key is the audit's ambiguity case.
      await createExistingDefinition('collision-ambiguous-owner', {
        name: `Ambiguous A ${runId}`,
        aliases: [codeFor('collision-ambiguous')],
      });
      await createExistingDefinition('collision-ambiguous-other', {
        name: `Ambiguous B ${runId}`,
        aliases: [codeFor('collision-ambiguous')],
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'TARGET_ALREADY_EXISTS',
      );
      expect(await definitionCount(codeFor('collision-ambiguous'))).toBe(0);
    });

    it('refuses a finding whose attribute is neither resolvable nor absent', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('ambiguous-subject');
      // The producer claimed the attribute exists, but supplied no definition id —
      // the audit's `AMBIGUOUS_SUBJECT` shape. Neither bind nor create is right.
      const finding = await acceptCreationFinding({
        suffix: 'ambiguous-subject',
        category,
        proposal: { isExisting: true },
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('UNSUPPORTED_TARGET');
      expect(await definitionCount(codeFor('ambiguous-subject'))).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    const expectLifecycleRefusal = async (input: {
      suffix: string;
      status?: 'PENDING' | 'REJECTED' | 'DISMISSED';
      skipAccept?: boolean;
      action?: string;
      fingerprint?: 'wrong';
      token?: string;
      expectedReason: string;
      expectedStatus: number;
    }) => {
      const category = await createCategory(input.suffix);
      const finding = await acceptCreationFinding({
        suffix: input.suffix,
        category,
        status: input.status,
        skipAccept: input.skipAccept,
      });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        input.fingerprint === 'wrong'
          ? 'not-the-fingerprint'
          : finding.fingerprint,
        input.token ?? writerToken,
      ).send({
        action: input.action ?? 'CREATE_DEFINITION',
        expectedFingerprint:
          input.fingerprint === 'wrong'
            ? 'not-the-fingerprint'
            : finding.fingerprint,
      });

      expect(response.status).toBe(input.expectedStatus);
      const result = body<ApplyResultBody>(response);
      if (input.expectedStatus === 409) {
        expect(result.reason).toBe(input.expectedReason);
      }

      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount(codeFor(input.suffix))).toBe(0);
      return response;
    };

    it('refuses a PENDING finding: acceptance is required first', async () => {
      await expectLifecycleRefusal({
        suffix: 'pending',
        skipAccept: true,
        expectedReason: 'FINDING_NOT_ACCEPTED',
        expectedStatus: 409,
      });
    });

    it('refuses a REJECTED finding', async () => {
      await expectLifecycleRefusal({
        suffix: 'rejected',
        status: 'REJECTED',
        expectedReason: 'FINDING_NOT_ACCEPTED',
        expectedStatus: 409,
      });
    });

    it('refuses a DISMISSED finding', async () => {
      await expectLifecycleRefusal({
        suffix: 'dismissed',
        status: 'DISMISSED',
        expectedReason: 'FINDING_NOT_ACCEPTED',
        expectedStatus: 409,
      });
    });

    it('refuses a STALE finding', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('stale');
      const finding = await acceptCreationFinding({
        suffix: 'stale',
        category,
      });
      await findingsService.markFindingStaleInTransaction(
        finding.id,
        'Fixture: retired before apply',
      );

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('FINDING_STALE');
      expect(await definitionCount(codeFor('stale'))).toBe(0);
    });

    it('refuses an already-applied finding', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('applied');
      const finding = await acceptCreationFinding({
        suffix: 'applied',
        category,
      });

      const first = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });
      expect(first.status).toBe(201);
      adoptDefinitions([body<ApplyResultBody>(first).createdDefinition?.id]);

      const second = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(second.status).toBe(409);
      expect(body<ApplyResultBody>(second).reason).toBe('ALREADY_APPLIED');
      // Still exactly one definition and one binding after two applies.
      expect(await definitionCount(codeFor('applied'))).toBe(1);
    });

    it('refuses the wrong action for a creation finding', async () => {
      await expectLifecycleRefusal({
        suffix: 'wrong-action',
        action: 'ADD_BINDING',
        expectedReason: 'UNSUPPORTED_ACTION',
        expectedStatus: 409,
      });
    });

    it('refuses CREATE_DEFINITION for a finding whose definition already exists', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('bind-not-create');
      const attribute = await createExistingDefinition('bind-not-create');

      const expectedState = buildExpectedAttributeState({
        category: toCategorySnapshot({
          id: category.id,
          code: category.code,
          name: category.name,
          isActive: true,
        }),
        expectedAttributeCode: attribute.code,
        expectedAttributeName: attribute.name,
        existingAttribute: toAttributeIdentitySnapshot(attribute),
      });

      const persisted = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          attributeCode: attribute.code,
          categoryCode: category.code,
          title: `Bind "${attribute.name}"`,
          description: 'Standard attribute commonly expected but not bound.',
          currentValue: expectedState as unknown as Record<string, unknown>,
          suggestedValue: {
            rule: 'DOMAIN_EXPECTATION',
            suggestedAction: 'BIND_ATTRIBUTE',
            canonicalCode: attribute.code,
            canonicalName: attribute.name,
            isExisting: true,
          },
          source: 'audit:attribute-library:ml',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { expectedState, fixtureIndex: ++fixtureCounter },
        },
      ]);
      const finding = await findingsService.recordDecision(
        persisted.findings[0]!.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe('UNSUPPORTED_ACTION');
      expect(await definitionCount(attribute.code)).toBe(1);
    });

    it('refuses a fingerprint that does not match the stored revision', async () => {
      await expectLifecycleRefusal({
        suffix: 'bad-fingerprint',
        fingerprint: 'wrong',
        expectedReason: 'FINDING_STALE',
        expectedStatus: 409,
      });
    });

    it('refuses CREATE_DEFINITION for review-only families', async () => {
      if (!hasDbUrl) return;
      const attribute = await createExistingDefinition('review-only');
      const persisted = await persistFixtures([
        {
          issueType: 'UNUSED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          title: 'Unused attribute',
          description: 'No component values and no bindings.',
          currentValue: { usageBand: 'NO_VALUES_NO_BINDINGS' },
          suggestedValue: null,
          source: 'audit:attribute-library:ml',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { fixtureIndex: ++fixtureCounter },
        },
      ]);
      const finding = await findingsService.recordDecision(
        persisted.findings[0]!.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'UNSUPPORTED_FINDING_TYPE',
      );
      expect(await creationStateCounts()).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // Security
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('rejects an anonymous apply and creates nothing', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('anon');
      const finding = await acceptCreationFinding({ suffix: 'anon', category });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(401);
      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount(codeFor('anon'))).toBe(0);
    });

    it('rejects a read-only user and creates nothing', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('readonly');
      const finding = await acceptCreationFinding({
        suffix: 'readonly',
        category,
      });

      const before = await creationStateCounts();

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        readerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(403);
      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount(codeFor('readonly'))).toBe(0);
    });

    it('rejects a body that tries to supply the definition itself', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('spoof-proposal');
      const finding = await acceptCreationFinding({
        suffix: 'spoof-proposal',
        category,
      });

      const before = await creationStateCounts();

      // The request contract has no definition fields at all, so a caller cannot
      // substitute a code, name, type or unit for the proposal under review.
      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
        code: 'attacker_code',
        name: 'Attacker supplied name',
        dataType: 'TEXT',
        unitCategory: 'Resistance',
        options: [{ code: 'X', label: 'X' }],
        categoryId: category.id,
        sortOrder: 1,
      });

      expect(response.status).toBe(400);
      expect(await creationStateCounts()).toBe(before);
      expect(await definitionCount('attacker_code')).toBe(0);
      expect(await definitionCount(codeFor('spoof-proposal'))).toBe(0);
    });

    it('rejects a body that tries to assert the applying actor', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('spoof-actor');
      const finding = await acceptCreationFinding({
        suffix: 'spoof-actor',
        category,
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
        reviewerId: '00000000-0000-4000-8000-000000000001',
        reviewerEmail: 'spoofed@ananya.local',
        appliedBy: 'someone-else',
        createdBy: 'someone-else',
      });

      expect(response.status).toBe(400);
      expect(await definitionCount(codeFor('spoof-actor'))).toBe(0);
    });

    it('rejects an action outside the contract', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('bad-action');
      const finding = await acceptCreationFinding({
        suffix: 'bad-action',
        category,
      });

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'DELETE_EVERYTHING',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(400);
      expect(await definitionCount(codeFor('bad-action'))).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency and idempotency
  // -------------------------------------------------------------------------

  describe('concurrency', () => {
    it('creates one definition when the same finding is applied twice in sequence', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('repeat');
      const finding = await acceptCreationFinding({
        suffix: 'repeat',
        category,
      });

      const first = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });
      expectStatus(first, 201, 'repeat: first apply');
      const created = body<ApplyResultBody>(first).createdDefinition!;
      adoptDefinitions([created.id]);

      const second = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });
      expectStatus(second, 409, 'repeat: second apply');

      // Scenario A: exactly one definition, one binding, one application record.
      expect(await definitionCount(codeFor('repeat'))).toBe(1);
      expect(await bindingCount(created.id, category.id)).toBe(1);
      expect(await appliedFeedbackRows(created.id)).toBe(1);
      expect(
        (await findingsService.getFinding(finding.id)).applicationResult,
      ).toBe('APPLIED');
    });

    it('creates one definition when two applies run simultaneously', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('concurrent');
      const finding = await acceptCreationFinding({
        suffix: 'concurrent',
        category,
      });

      // Scenario B: both requests are in flight at once. The finding row lock
      // serialises them, so one applies and the other observes the committed result.
      const [first, second] = await Promise.all([
        applyCreation(finding.id, finding.fingerprint, writerToken).send({
          action: 'CREATE_DEFINITION',
          expectedFingerprint: finding.fingerprint,
        }),
        applyCreation(finding.id, finding.fingerprint, writerToken).send({
          action: 'CREATE_DEFINITION',
          expectedFingerprint: finding.fingerprint,
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);

      const success = body<ApplyResultBody>(
        first.status === 201 ? first : second,
      );
      const failure = body<ApplyResultBody>(
        first.status === 201 ? second : first,
      );
      adoptDefinitions([success.createdDefinition?.id]);

      // The loser gets a deterministic conflict, never a second creation.
      expect(failure.reason).toBe('ALREADY_APPLIED');

      expect(await definitionCount(codeFor('concurrent'))).toBe(1);
      expect(
        await bindingCount(success.createdDefinition!.id, category.id),
      ).toBe(1);
      expect(await appliedFeedbackRows(success.createdDefinition!.id)).toBe(1);
    });

    it('retires the finding when another actor creates the definition first', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('race-created');
      const finding = await acceptCreationFinding({
        suffix: 'race-created',
        category,
      });

      // Scenario C: the definition appears between analysis and apply.
      const existing = await createExistingDefinition('race-created');

      const response = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(response.status).toBe(409);
      expect(body<ApplyResultBody>(response).reason).toBe(
        'TARGET_ALREADY_EXISTS',
      );

      // No duplicate definition, no binding created behind the reviewer's back, and
      // the finding is retired rather than left applicable.
      expect(await definitionCount(codeFor('race-created'))).toBe(1);
      expect(await bindingCount(existing.id, category.id)).toBe(0);
      const stored = await findingsService.getFinding(finding.id);
      expect(stored.status).toBe('STALE');
      expect(stored.applicationResult).toBe('NOT_APPLIED');
    });

    it('leaves no definition behind when the application runs concurrently with a binding', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('concurrent-binding');
      const creationFinding = await acceptCreationFinding({
        suffix: 'concurrent-binding',
        category,
      });

      // An unrelated binding finding for the same category, applied at the same
      // time: the two transactions both lock the category, so they serialise rather
      // than interleave. The attribute's identity is deliberately unrelated to the
      // proposed code, so this proves serialisation rather than a collision.
      const attribute = await createExistingDefinition('existing-for-binding');
      const expectedState = buildExpectedAttributeState({
        category: toCategorySnapshot({
          id: category.id,
          code: category.code,
          name: category.name,
          isActive: true,
        }),
        expectedAttributeCode: attribute.code,
        expectedAttributeName: attribute.name,
        existingAttribute: toAttributeIdentitySnapshot(attribute),
      });
      const persisted = await persistFixtures([
        {
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          attributeCode: attribute.code,
          categoryCode: category.code,
          title: `Bind "${attribute.name}"`,
          description: 'Standard attribute commonly expected but not bound.',
          currentValue: expectedState as unknown as Record<string, unknown>,
          suggestedValue: {
            rule: 'DOMAIN_EXPECTATION',
            suggestedAction: 'BIND_ATTRIBUTE',
            canonicalCode: attribute.code,
            canonicalName: attribute.name,
            isExisting: true,
          },
          source: 'audit:attribute-library:ml',
          intelligenceVersion: 'attribute-audit-v1',
          metadata: { expectedState, fixtureIndex: ++fixtureCounter },
        },
      ]);
      const bindingFinding = await findingsService.recordDecision(
        persisted.findings[0]!.id,
        { decision: 'ACCEPTED' },
        { id: writerUserId, email: writerEmail },
      );

      const [creation, binding] = await Promise.all([
        applyCreation(
          creationFinding.id,
          creationFinding.fingerprint,
          writerToken,
        ).send({
          action: 'CREATE_DEFINITION',
          expectedFingerprint: creationFinding.fingerprint,
        }),
        applyCreation(
          bindingFinding.id,
          bindingFinding.fingerprint,
          writerToken,
        ).send({
          action: 'ADD_BINDING',
          expectedFingerprint: bindingFinding.fingerprint,
        }),
      ]);

      expect(creation.status).toBe(201);
      expect(binding.status).toBe(201);
      const created = body<ApplyResultBody>(creation).createdDefinition!;
      adoptDefinitions([created.id]);

      expect(await definitionCount(codeFor('concurrent-binding'))).toBe(1);
      expect(await bindingCount(created.id, category.id)).toBe(1);
      expect(await bindingCount(attribute.id, category.id)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Rollback and timeout
  // -------------------------------------------------------------------------

  describe('rollback and bounded execution', () => {
    it('removes the created definition when the application record cannot be written', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('rollback');
      const finding = await acceptCreationFinding({
        suffix: 'rollback',
        category,
      });

      const before = await creationStateCounts();

      // The failure is injected after the definition, its options and its binding
      // were written, which is what proves the whole application is one transaction.
      const spy = jest
        .spyOn(findingsService, 'markFindingApplied')
        .mockRejectedValueOnce(new Error('simulated write failure'));

      try {
        await expect(
          applyService.applyFinding(
            finding.id,
            {
              action: 'CREATE_DEFINITION',
              expectedFingerprint: finding.fingerprint,
            },
            { id: writerUserId, email: writerEmail },
          ),
        ).rejects.toThrow(/simulated write failure/);

        // Nothing survived: no definition, no option, no binding, no feedback, and
        // the finding is still approved and unapplied.
        expect(await creationStateCounts()).toBe(before);
        expect(await definitionCount(codeFor('rollback'))).toBe(0);
        expect(await bindingCount(category.id, category.id)).toBe(0);
        const stored = await findingsService.getFinding(finding.id);
        expect(stored.applicationResult).toBe('NOT_APPLIED');
        expect(stored.status).toBe('ACCEPTED');
      } finally {
        spy.mockRestore();
      }
    });

    it('rolls the binding back when the binding write is refused', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('rollback-binding');
      const finding = await acceptCreationFinding({
        suffix: 'rollback-binding',
        category,
      });

      const before = await creationStateCounts();

      // The binding is the LAST write, so a failure here must take the definition
      // and its options down with it.
      const module =
        await import('../../src/infrastructure/repositories/drizzle-attribute.repository');
      const spy = jest
        .spyOn(module.DrizzleCategoryAttributeRepository.prototype, 'save')
        .mockRejectedValueOnce(new Error('simulated binding failure'));

      try {
        const response = await applyCreation(
          finding.id,
          finding.fingerprint,
          writerToken,
        ).send({
          action: 'CREATE_DEFINITION',
          expectedFingerprint: finding.fingerprint,
        });

        expect(response.status).toBe(409);
        expect(body<ApplyResultBody>(response).reason).toBe('DOMAIN_REFUSED');
        expect(await creationStateCounts()).toBe(before);
        expect(await definitionCount(codeFor('rollback-binding'))).toBe(0);
        const stored = await findingsService.getFinding(finding.id);
        expect(stored.applicationResult).toBe('NOT_APPLIED');
        expect(stored.status).toBe('ACCEPTED');
      } finally {
        spy.mockRestore();
      }
    });

    /**
     * Holds a real row lock on the category from a SEPARATE connection.
     *
     * Deterministic rather than sleep-based: the holder signals through a promise
     * once `SELECT ... FOR UPDATE` has actually returned, so the test never races its
     * own setup. A creation application must lock the category it binds into, so this
     * is the exact contention the apply transaction's `lock_timeout` bounds.
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
        .catch(() => undefined);

      await locked;
      return {
        async release() {
          release();
          await done;
        },
      };
    };

    it('returns 409 APPLY_TIMEOUT and creates nothing when the category is locked', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('timeout');
      const finding = await acceptCreationFinding({
        suffix: 'timeout',
        category,
      });

      const before = await creationStateCounts();
      const holder = await holdCategoryLock(category.id);
      try {
        const response = await applyCreation(
          finding.id,
          finding.fingerprint,
          writerToken,
        ).send({
          action: 'CREATE_DEFINITION',
          expectedFingerprint: finding.fingerprint,
        });

        expect(response.status).toBe(409);
        const result = body<
          ApplyResultBody & { retryable?: boolean; timeout?: string }
        >(response);
        expect(result.reason).toBe('APPLY_TIMEOUT');
        expect(result.retryable).toBe(true);
        expect(result.timeout).toBe('LOCK_TIMEOUT');

        // A timeout is never a partial creation and never a stale transition.
        expect(await creationStateCounts()).toBe(before);
        expect(await definitionCount(codeFor('timeout'))).toBe(0);
        const stored = await findingsService.getFinding(finding.id);
        expect(stored.status).toBe('ACCEPTED');
        expect(stored.applicationResult).toBe('NOT_APPLIED');
      } finally {
        await holder.release();
      }
    });

    it('succeeds once the lock is released, proving the bound is not permanent', async () => {
      if (!hasDbUrl) return;
      const category = await createCategory('timeout-retry');
      const finding = await acceptCreationFinding({
        suffix: 'timeout-retry',
        category,
      });

      const holder = await holdCategoryLock(category.id);
      const blocked = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });
      expect(blocked.status).toBe(409);
      await holder.release();

      const retry = await applyCreation(
        finding.id,
        finding.fingerprint,
        writerToken,
      ).send({
        action: 'CREATE_DEFINITION',
        expectedFingerprint: finding.fingerprint,
      });

      expect(retry.status).toBe(201);
      const result = body<ApplyResultBody>(retry);
      adoptDefinitions([result.createdDefinition?.id]);
      expect(await definitionCount(codeFor('timeout-retry'))).toBe(1);
      expect(
        await bindingCount(result.createdDefinition!.id, category.id),
      ).toBe(1);
    });
  });
});
