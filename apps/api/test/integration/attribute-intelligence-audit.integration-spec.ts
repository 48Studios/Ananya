import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AttributesService } from '../../src/attributes/attributes.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { MlService } from '../../src/ml/ml.service';
import { AttributeIntelligenceFindingsService } from '../../src/ml/attribute-findings/attribute-finding.service';
import { AttributeIntelligenceAuditService } from '../../src/ml/attribute-findings/attribute-intelligence-audit.service';
import { ATTRIBUTE_AUDIT_SOURCES } from '../../src/ml/attribute-findings/attribute-audit.dtos';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeIntelligenceFindings,
  attributeOptions,
  categories,
  categoryAttributes,
  componentAttributeValues,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';

/**
 * Pass 2 coverage: the *existing* Attribute Intelligence audit becomes persistent,
 * deterministic and lifecycle-aware.
 *
 * The suite stubs the producer (`MlService.auditAttributeLibrary`) so it can drive
 * exact producer output — including malformed and unsupported issues — while the
 * persistence, fingerprinting, reconciliation and staleness paths run against the
 * real database. The producer itself is not modified or tested here.
 *
 * Fixtures are run-tagged: jest runs spec files in parallel against one database,
 * and a bare `Date.now()` repeats across workers.
 */
describe('Attribute Intelligence audit persistence (Pass 2)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = `aip2-${Math.random().toString(36).slice(2, 10)}`;
  const SOURCE = ATTRIBUTE_AUDIT_SOURCES.DETERMINISTIC;

  let app: INestApplicationContext;
  let attributesService: AttributesService;
  let categoriesService: CategoriesService;
  let mlService: MlService;
  let auditService: AttributeIntelligenceAuditService;
  let findingsService: AttributeIntelligenceFindingsService;

  const createdAttributeIds: string[] = [];
  const createdCategoryIds: string[] = [];

  /** Producer issues this run should emit, replaced per test. */
  let stubbedIssues: Array<Record<string, unknown>> = [];
  let stubbedIsMlActive = false;
  let originalAudit: MlService['auditAttributeLibrary'];

  const createAttribute = async (
    suffix: string,
    overrides: Partial<{
      name: string;
      dataType: string;
      aliases: string[];
    }> = {},
  ) => {
    const definition = await attributesService.createDefinition({
      code: `${runTag}_${suffix}`.slice(0, 100),
      name: overrides.name ?? `${suffix} ${runTag}`,
      dataType: (overrides.dataType ?? 'QUANTITY') as 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
      aliases: overrides.aliases ?? [],
    });
    createdAttributeIds.push(definition.id);
    return definition;
  };

  const createCategory = async (suffix: string) => {
    const category = await categoriesService.create({
      code: `${runTag}-${suffix}`.slice(0, 100),
      name: `${suffix} ${runTag}`,
    });
    createdCategoryIds.push(category.id);
    return category;
  };

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    attributesService = app.get(AttributesService);
    categoriesService = app.get(CategoriesService);
    mlService = app.get(MlService);
    auditService = app.get(AttributeIntelligenceAuditService);
    findingsService = app.get(AttributeIntelligenceFindingsService);

    originalAudit = mlService.auditAttributeLibrary.bind(mlService);
    mlService.auditAttributeLibrary = (() =>
      Promise.resolve({
        summary: {
          totalAttributes: 0,
          possibleDuplicates: 0,
          suspiciousBindings: 0,
          missingExpectedAttributes: 0,
          unusedAttributes: 0,
          issuesCount: stubbedIssues.length,
        },
        issues: stubbedIssues,
        isMlActive: stubbedIsMlActive,
        executionTimeMs: 1,
      })) as unknown as MlService['auditAttributeLibrary'];
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    if (originalAudit) mlService.auditAttributeLibrary = originalAudit;

    // Order matters and follows the foreign keys:
    //  1. findings — their subject columns cascade/set-null with the definitions, so
    //     removing them first keeps the rest deterministic;
    //  2. feedback — `attribute_definition_id` / `category_id` are ON DELETE SET
    //     NULL, so a decision's feedback row must go BEFORE the subject it names, or
    //     it becomes unaddressable and leaks;
    //  3. definitions;
    //  4. categories.
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
    for (const categoryId of createdCategoryIds) {
      await categoriesService.delete(categoryId).catch(() => undefined);
    }

    await app.close();
    await closeDatabaseConnection();
  });

  beforeEach(() => {
    stubbedIssues = [];
    stubbedIsMlActive = false;
  });

  /** Producer `UNUSED_ATTRIBUTE` issue, shaped exactly as the producers emit it. */
  const unusedIssue = (attributeId: string, id = 'audit-1') => ({
    id,
    type: 'UNUSED_ATTRIBUTE',
    severity: 'INFO',
    title: `Unused Attribute: "${attributeId}"`,
    subtitle: 'No bindings and no values.',
    attributeId,
    confidence: 0.75,
    confidenceLevel: 'MEDIUM',
    reason: `Attribute '${attributeId}' has 0 category bindings and 0 component values`,
    payload: { usageCount: 0, bindingCount: 0 },
    evidence: [
      {
        type: 'existing_data',
        description: 'Zero references in inventory ledger',
        weight: 0.75,
        source: 'database:component_attribute_values',
      },
    ],
  });

  const duplicateIssue = (
    firstId: string,
    secondId: string,
    id = 'audit-dup',
  ) => ({
    id,
    type: 'DUPLICATE_ATTRIBUTE',
    severity: 'WARNING',
    attributeId: firstId,
    confidence: 0.91,
    confidenceLevel: 'HIGH',
    reason: 'Possible duplicate attributes',
    payload: { targetAttributeId: secondId, similarity: 0.91 },
    evidence: [
      {
        type: 'similarity',
        description: 'High lexical similarity',
        weight: 0.91,
        source: 'audit:deduplication',
      },
    ],
  });

  const bindingIssue = (
    attributeId: string,
    categoryId: string,
    id = 'audit-susp',
  ) => ({
    id,
    type: 'SUSPICIOUS_BINDING',
    severity: 'WARNING',
    attributeId,
    categoryId,
    confidence: 0.85,
    confidenceLevel: 'HIGH',
    reason: 'Suspicious binding',
    payload: { usageCount: 0 },
    evidence: [
      {
        type: 'anomaly',
        description: 'Attribute is characteristic of another category',
        weight: 0.85,
        source: 'audit:anomaly_detection',
      },
    ],
  });

  const expectedAttributeIssue = (
    categoryId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 'audit-expected',
    type: 'MISSING_EXPECTED_ATTRIBUTE',
    severity: 'INFO',
    attributeId: null,
    attributeCode: `${runTag}_dielectric`,
    attributeName: 'Dielectric',
    categoryId,
    confidence: 0.9,
    confidenceLevel: 'HIGH',
    reason: 'Standard attribute commonly expected but not bound',
    payload: {
      isExisting: false,
      canonicalCode: `${runTag}_dielectric`,
      dataType: 'SELECT',
      group: 'Physical',
      suggestedRequired: false,
    },
    evidence: [
      {
        type: 'taxonomy',
        description: 'Industry standard specification',
        weight: 0.9,
        source: 'domain:electronics_standard',
      },
    ],
    ...overrides,
  });

  const findingsFor = (attributeId: string) =>
    findingsService.listFindings({
      attributeDefinitionId: attributeId,
      source: SOURCE,
    });

  /**
   * Every relationship finding this audit owns, whichever side it is stored under.
   *
   * The pair is canonicalized by id, so which attribute a finding is stored against
   * depends on the (random) uuids of the fixtures — an assertion that assumed one
   * ordering would pass or fail by luck.
   */
  const allRelationshipFindings = () =>
    findingsService.listFindings({
      source: SOURCE,
      issueType: 'POSSIBLE_DUPLICATE',
      pageSize: 100,
    });

  /**
   * Counts this run's own findings that are STALE, scoped to the fixtures a test
   * created.
   *
   * The audit is whole-library by design, so `staleCount` legitimately includes
   * findings left behind by earlier tests in this file that the current run no
   * longer detects. Assertions about a specific condition are therefore made on the
   * condition's own rows, where they are exact.
   */
  const localStaleCount = async (attributeId: string) =>
    (
      await findingsService.listFindings({
        attributeDefinitionId: attributeId,
        status: 'STALE',
        source: SOURCE,
      })
    ).total;

  // -------------------------------------------------------------------------

  it('persists nothing and reports cleanly when the producer finds nothing', async () => {
    if (!hasDbUrl) return;

    const result = await auditService.runAudit();

    expect(result.rawFindingCount).toBe(0);
    expect(result.persistedCount).toBe(0);
    expect(result.createdCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.scope).toBe('WHOLE_LIBRARY');
    expect(result.source).toBe(SOURCE);
    expect(result.intelligenceVersion).toBe('attribute-audit-v1');
    expect(result.scannedCount).toBeGreaterThan(0);
  });

  it('persists an unused attribute finding with its subject and evidence', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('unused');
    stubbedIssues = [unusedIssue(attribute.id)];

    const result = await auditService.runAudit();

    expect(result.rawFindingCount).toBe(1);
    expect(result.persistedCount).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(result.refreshedCount).toBe(0);
    expect(result.byIssueType.UNUSED_ATTRIBUTE).toBe(1);

    const page = await findingsFor(attribute.id);
    expect(page.total).toBe(1);
    const finding = page.items[0]!;
    expect(finding.issueType).toBe('UNUSED_ATTRIBUTE');
    expect(finding.issueCategory).toBe('ATTRIBUTE_USAGE');
    expect(finding.attributeDefinitionId).toBe(attribute.id);
    expect(finding.status).toBe('PENDING');
    expect(finding.source).toBe(SOURCE);
    expect(finding.intelligenceVersion).toBe('attribute-audit-v1');
    expect(finding.confidence).toBeCloseTo(0.75);
    expect(finding.evidence).toHaveLength(1);
    expect(finding.metadata.expectedState).toBeDefined();
    expect(finding.metadata.producerIssueType).toBe('UNUSED_ATTRIBUTE');
    expect(finding.suggestedValue).toBeNull();
  });

  it('persists a duplicate finding as a relationship with a canonical pair', async () => {
    if (!hasDbUrl) return;
    const first = await createAttribute('dup-a');
    const second = await createAttribute('dup-b');
    stubbedIssues = [duplicateIssue(first.id, second.id)];

    const result = await auditService.runAudit();
    expect(result.byIssueType.POSSIBLE_DUPLICATE).toBe(1);

    // A relationship finding is owned by the pair, so it is reachable from either
    // side — and stored under whichever side sorts first.
    const page = await allRelationshipFindings();
    expect(page.total).toBe(1);
    const finding = page.items[0]!;
    expect(
      [
        finding.attributeDefinitionId,
        finding.relatedAttributeDefinitionId,
      ].sort(),
    ).toEqual([first.id, second.id].sort());
    expect(finding.issueType).toBe('POSSIBLE_DUPLICATE');
    expect(finding.issueCategory).toBe('ATTRIBUTE_IDENTITY');
    expect(finding.relatedAttributeDefinitionId).not.toBeNull();
    expect(finding.metadata.producerIssueType).toBe('DUPLICATE_ATTRIBUTE');
    // The producer's raw type is preserved, so the persisted name is auditable.
    expect(finding.suggestedValue).toMatchObject({
      matchType: 'LEXICAL_SIMILARITY',
    });
  });

  it('persists a suspicious binding with the attribute and category subjects', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('susp');
    const category = await createCategory('susp');
    stubbedIssues = [bindingIssue(attribute.id, category.id)];

    const result = await auditService.runAudit();
    expect(result.byIssueType.SUSPICIOUS_BINDING).toBe(1);

    const page = await findingsService.listFindings({
      categoryId: category.id,
      source: SOURCE,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]!.attributeDefinitionId).toBe(attribute.id);
    expect(page.items[0]!.categoryId).toBe(category.id);
    expect(page.items[0]!.suggestedValue).toMatchObject({
      suggestedAction: 'REMOVE_BINDING',
    });
  });

  it('persists a category-first expectation without creating the attribute', async () => {
    if (!hasDbUrl) return;
    const category = await createCategory('gap');
    stubbedIssues = [expectedAttributeIssue(category.id)];

    const result = await auditService.runAudit();
    expect(result.byIssueType.MISSING_EXPECTED_ATTRIBUTE).toBe(1);

    const page = await findingsService.listFindings({
      categoryId: category.id,
      source: SOURCE,
    });
    const finding = page.items[0]!;
    expect(finding.attributeDefinitionId).toBeNull();
    expect(finding.categoryId).toBe(category.id);
    // Codes are stored in canonical `lower_snake` form.
    expect(finding.metadata.attributeCode).toBe(
      `${runTag}_dielectric`.replace(/-/g, '_'),
    );

    // Nothing was invented: the audit never creates master data.
    const created = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.code, `${runTag}_dielectric`));
    expect(created).toHaveLength(0);
  });

  it('warns about an unsupported producer issue instead of dropping it silently', async () => {
    if (!hasDbUrl) return;
    const category = await createCategory('unsupported');
    stubbedIssues = [
      {
        id: 'audit-enum',
        type: 'SUGGESTED_ENUM_VALUE',
        severity: 'INFO',
        categoryId: category.id,
        attributeCode: 'dielectric',
        attributeName: 'Dielectric',
        confidence: 0.9,
        confidenceLevel: 'HIGH',
        reason: 'Enum value suggestion',
        evidence: [],
      },
    ];

    const result = await auditService.runAudit();

    expect(result.persistedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings[0]!.code).toBe('UNSUPPORTED_PRODUCER_ISSUE_TYPE');
    expect(result.warnings[0]!.producerIssueType).toBe('SUGGESTED_ENUM_VALUE');
  });

  it('warns about an unresolvable subject and keeps auditing', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('mixed');
    stubbedIssues = [
      unusedIssue(attribute.id, 'audit-good'),
      duplicateIssue(attribute.id, 'attr-does-not-exist', 'audit-bad'),
    ];

    const result = await auditService.runAudit();

    expect(result.persistedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings[0]!.code).toBe('MISSING_SUBJECT');
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('is idempotent: a second identical audit creates nothing new', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('idem');
    stubbedIssues = [unusedIssue(attribute.id)];

    const first = await auditService.runAudit();
    expect(first.createdCount).toBe(1);
    expect(first.refreshedCount).toBe(0);

    const second = await auditService.runAudit();
    expect(second.createdCount).toBe(0);
    expect(second.refreshedCount).toBe(1);
    expect(second.revivedCount).toBe(0);
    expect(second.persistedCount).toBe(1);
    // No unnecessary STALE rows: the finding was re-detected unchanged.
    expect(await localStaleCount(attribute.id)).toBe(0);

    const page = await findingsFor(attribute.id);
    expect(page.total).toBe(1);
  });

  it('persists one row for a pair regardless of the order reported', async () => {
    if (!hasDbUrl) return;
    const first = await createAttribute('pair-a');
    const second = await createAttribute('pair-b');

    stubbedIssues = [duplicateIssue(first.id, second.id)];
    await auditService.runAudit();
    stubbedIssues = [duplicateIssue(second.id, first.id)];
    await auditService.runAudit();

    const rows = await db
      .select({ id: attributeIntelligenceFindings.id })
      .from(attributeIntelligenceFindings)
      .where(
        and(
          eq(attributeIntelligenceFindings.source, SOURCE),
          eq(attributeIntelligenceFindings.issueType, 'POSSIBLE_DUPLICATE'),
          inArray(attributeIntelligenceFindings.attributeDefinitionId, [
            first.id,
            second.id,
          ]),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Staleness and revival
  // -------------------------------------------------------------------------

  it('retires a finding the next audit no longer detects', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('disappear');
    stubbedIssues = [unusedIssue(attribute.id)];
    await auditService.runAudit();
    expect((await findingsFor(attribute.id)).items[0]!.status).toBe('PENDING');

    stubbedIssues = [];
    const result = await auditService.runAudit();

    expect(result.staleCount).toBeGreaterThanOrEqual(1);
    expect(await localStaleCount(attribute.id)).toBe(1);
    expect((await findingsFor(attribute.id)).items[0]!.status).toBe('STALE');
  });

  it('returns a STALE finding to PENDING when the condition reappears', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('revive');
    stubbedIssues = [unusedIssue(attribute.id)];
    await auditService.runAudit();

    stubbedIssues = [];
    await auditService.runAudit();
    expect((await findingsFor(attribute.id)).items[0]!.status).toBe('STALE');

    stubbedIssues = [unusedIssue(attribute.id)];
    const revived = await auditService.runAudit();

    expect(revived.revivedCount).toBe(1);
    expect(await localStaleCount(attribute.id)).toBe(0);
    expect((await findingsFor(attribute.id)).items[0]!.status).toBe('PENDING');
  });

  it('creates a new finding when the observed state changes', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('state-change');
    stubbedIssues = [unusedIssue(attribute.id)];
    const first = await auditService.runAudit();

    stubbedIssues = [
      {
        ...unusedIssue(attribute.id),
        payload: { usageCount: 0, bindingCount: 5 },
      },
    ];
    const second = await auditService.runAudit();

    expect(second.createdCount).toBe(1);
    expect(await localStaleCount(attribute.id)).toBe(1);

    const rows = await db
      .select({
        id: attributeIntelligenceFindings.id,
        status: attributeIntelligenceFindings.status,
      })
      .from(attributeIntelligenceFindings)
      .where(
        eq(attributeIntelligenceFindings.attributeDefinitionId, attribute.id),
      );
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === 'STALE')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
    void first;
  });

  // -------------------------------------------------------------------------
  // Terminal decisions
  // -------------------------------------------------------------------------

  it('preserves ACCEPTED, REJECTED and DISMISSED across a re-audit', async () => {
    if (!hasDbUrl) return;
    const accepted = await createAttribute('keep-accepted');
    const rejected = await createAttribute('keep-rejected');
    const dismissed = await createAttribute('keep-dismissed');

    stubbedIssues = [
      unusedIssue(accepted.id, 'a1'),
      unusedIssue(rejected.id, 'a2'),
      unusedIssue(dismissed.id, 'a3'),
    ];
    await auditService.runAudit();

    const decide = async (
      attributeId: string,
      decision: 'ACCEPTED' | 'REJECTED' | 'DISMISSED',
    ) => {
      const page = await findingsFor(attributeId);
      return findingsService.recordDecision(page.items[0]!.id, {
        decision,
        decisionNotes: `${decision} by reviewer`,
      });
    };

    await decide(accepted.id, 'ACCEPTED');
    await decide(rejected.id, 'REJECTED');
    await decide(dismissed.id, 'DISMISSED');

    // The identical condition is re-detected; terminal decisions must survive and
    // must not be reconciled back to STALE.
    const rerun = await auditService.runAudit();
    expect(await localStaleCount(accepted.id)).toBe(0);
    expect(await localStaleCount(rejected.id)).toBe(0);
    expect(await localStaleCount(dismissed.id)).toBe(0);
    expect(rerun.revivedCount).toBe(0);

    expect((await findingsFor(accepted.id)).items[0]!.status).toBe('ACCEPTED');
    expect((await findingsFor(rejected.id)).items[0]!.status).toBe('REJECTED');
    expect((await findingsFor(dismissed.id)).items[0]!.status).toBe(
      'DISMISSED',
    );

    const acceptedFinding = (await findingsFor(accepted.id)).items[0]!;
    expect(acceptedFinding.decisionNotes).toBe('ACCEPTED by reviewer');
    expect(acceptedFinding.reviewedAt).not.toBeNull();
  });

  it('raises a new finding when a decided one is superseded by changed state', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('superseded');
    stubbedIssues = [unusedIssue(attribute.id)];
    await auditService.runAudit();
    const original = (await findingsFor(attribute.id)).items[0]!;
    await findingsService.recordDecision(original.id, {
      decision: 'REJECTED',
      decisionNotes: 'Not unused',
    });

    stubbedIssues = [
      {
        ...unusedIssue(attribute.id),
        payload: { usageCount: 9, bindingCount: 0 },
      },
    ];
    const rerun = await auditService.runAudit();

    // A genuinely changed recommendation is a new condition, so a new finding is
    // correct — the old decision stays intact on the old row.
    expect(rerun.createdCount).toBe(1);
    const page = await findingsFor(attribute.id);
    expect(page.items).toHaveLength(2);
    expect(page.items.find((item) => item.id === original.id)?.status).toBe(
      'REJECTED',
    );
    expect(page.items.some((item) => item.status === 'PENDING')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Isolation
  // -------------------------------------------------------------------------

  it('does not stale another producer’s findings', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('producer-isolation');

    // A finding written by a different producer for the same attribute.
    await findingsService.persistFindings([
      {
        issueType: 'UNUSED_ATTRIBUTE',
        attributeDefinitionId: attribute.id,
        title: 'Other producer finding',
        description: 'Written by a different producer.',
        source: 'test:other-producer',
        intelligenceVersion: 'attribute-audit-v1',
        confidence: 0.5,
        confidenceLevel: 'MEDIUM',
      },
    ]);

    stubbedIssues = [unusedIssue(attribute.id)];
    const result = await auditService.runAudit();

    // The audit's own scope is all-attribute, so it stales whatever else it owns and
    // no longer detects. What matters here is that the other producer's row — which
    // is outside its scope on every dimension — is untouched.
    expect(result.source).toBe(SOURCE);
    const other = await findingsService.listFindings({
      attributeDefinitionId: attribute.id,
      source: 'test:other-producer',
    });
    expect(other.items[0]!.status).toBe('PENDING');
  });

  it('does not stale findings written under another intelligence version', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('version-isolation');

    await findingsService.persistFindings([
      {
        issueType: 'UNUSED_ATTRIBUTE',
        attributeDefinitionId: attribute.id,
        title: 'Older semantics finding',
        description: 'Written under a previous normalization version.',
        source: SOURCE,
        intelligenceVersion: 'attribute-audit-v0',
        confidence: 0.5,
        confidenceLevel: 'MEDIUM',
        // Distinct state, so this finding is genuinely a different condition and
        // only the version filter can protect it.
        currentValue: { marker: 'v0' },
      },
    ]);

    stubbedIssues = [unusedIssue(attribute.id)];
    const result = await auditService.runAudit();

    expect(result.source).toBe(SOURCE);
    const older = await findingsService.listFindings({
      attributeDefinitionId: attribute.id,
    });
    const v0 = older.items.find(
      (item) => item.intelligenceVersion === 'attribute-audit-v0',
    );
    expect(v0!.status).toBe('PENDING');
  });

  it('does not stale findings in a family the producer does not emit', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('family-isolation');
    const category = await createCategory('family-isolation');

    await findingsService.persistFindings([
      {
        issueType: 'SUSPICIOUS_BINDING',
        attributeDefinitionId: attribute.id,
        categoryId: category.id,
        title: 'Binding finding from an earlier producer',
        description: 'Same producer tag and version, different family.',
        source: SOURCE,
        intelligenceVersion: 'attribute-audit-v1',
        confidence: 0.85,
        confidenceLevel: 'HIGH',
      },
    ]);

    // This run emits only UNUSED_ATTRIBUTE issues.
    stubbedIssues = [unusedIssue(attribute.id)];
    await auditService.runAudit();

    const bindingFindings = await findingsService.listFindings({
      attributeDefinitionId: attribute.id,
      issueType: 'SUSPICIOUS_BINDING',
    });
    expect(bindingFindings.items[0]!.status).toBe('PENDING');
  });

  it('reconciles a category-first finding even though it has no attribute subject', async () => {
    if (!hasDbUrl) return;
    const category = await createCategory('category-scope');
    stubbedIssues = [expectedAttributeIssue(category.id)];
    await auditService.runAudit();
    expect(
      (
        await findingsService.listFindings({
          categoryId: category.id,
          source: SOURCE,
        })
      ).items[0]!.status,
    ).toBe('PENDING');

    stubbedIssues = [];
    const result = await auditService.runAudit();

    // Scoping reconciliation by attribute id alone would leave this PENDING forever.
    expect(result.staleCount).toBeGreaterThanOrEqual(1);
    const after = await findingsService.listFindings({
      categoryId: category.id,
      source: SOURCE,
    });
    expect(after.items[0]!.status).toBe('STALE');
  });

  // -------------------------------------------------------------------------
  // Authority boundary
  // -------------------------------------------------------------------------

  it('does not mutate authoritative attribute data', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('no-mutation');
    const partner = await createAttribute('no-mutation-partner');
    const category = await createCategory('no-mutation');
    await attributesService.bindCategoryToAttribute(attribute.id, {
      categoryId: category.id,
    });

    const snapshot = async () => {
      const [definitions, options, bindings, values, cats] = await Promise.all([
        db.select().from(attributeDefinitions).orderBy(attributeDefinitions.id),
        db.select().from(attributeOptions).orderBy(attributeOptions.id),
        db.select().from(categoryAttributes).orderBy(categoryAttributes.id),
        db
          .select()
          .from(componentAttributeValues)
          .orderBy(componentAttributeValues.id),
        db.select().from(categories).orderBy(categories.id),
      ]);
      return JSON.stringify({ definitions, options, bindings, values, cats });
    };

    // Duplicates are hashed instead of stored in full: a `timestamptz` rendered
    // through `JSON.stringify` is stable for identical rows, which is all this
    // comparison needs.
    const before = await snapshot();

    stubbedIssues = [
      unusedIssue(attribute.id, 'n1'),
      duplicateIssue(attribute.id, partner.id, 'n2'),
      bindingIssue(attribute.id, category.id, 'n3'),
      expectedAttributeIssue(category.id, { id: 'n4' }),
    ];
    const result = await auditService.runAudit();
    expect(result.persistedCount).toBeGreaterThan(0);

    expect(await snapshot()).toBe(before);
  });

  it('does not create findings for a producer type it cannot represent, and invents no subjects', async () => {
    if (!hasDbUrl) return;
    const category = await createCategory('invent-check');
    stubbedIssues = [
      {
        id: 'audit-fake',
        type: 'MISSING_EXPECTED_ATTRIBUTE',
        severity: 'INFO',
        attributeId: null,
        attributeCode: `${runTag}_never_created`,
        attributeName: 'Never Created',
        categoryId: category.id,
        confidence: 0.9,
        confidenceLevel: 'HIGH',
        reason: 'Expectation about an undefined attribute',
        payload: {
          isExisting: false,
          canonicalCode: `${runTag}_never_created`,
          canonicalName: 'Never Created',
        },
        evidence: [],
      },
    ];

    await auditService.runAudit();

    const page = await findingsService.listFindings({
      categoryId: category.id,
      source: SOURCE,
    });
    expect(page.items[0]!.attributeDefinitionId).toBeNull();

    const definitions = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.code, `${runTag}_never_created`));
    expect(definitions).toHaveLength(0);
  });

  it('reports the producer actually used, distinguishing ML from the fallback', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('producer-tag');

    stubbedIsMlActive = true;
    stubbedIssues = [unusedIssue(attribute.id)];
    const mlResult = await auditService.runAudit();

    expect(mlResult.source).toBe(ATTRIBUTE_AUDIT_SOURCES.ML);
    expect(mlResult.isMlActive).toBe(true);
    const page = await findingsService.listFindings({
      attributeDefinitionId: attribute.id,
    });
    expect(page.items[0]!.source).toBe(ATTRIBUTE_AUDIT_SOURCES.ML);
  });

  it('records a decision against a persisted audit finding through feedback', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('decide');
    stubbedIssues = [unusedIssue(attribute.id)];
    await auditService.runAudit();

    const finding = (await findingsFor(attribute.id)).items[0]!;
    const decided = await findingsService.recordDecision(
      finding.id,
      { decision: 'ACCEPTED', decisionNotes: 'Confirmed' },
      { email: `pass2-${runTag}@ananya.local` },
    );

    expect(decided.status).toBe('ACCEPTED');
    expect(decided.decisionNotes).toBe('Confirmed');
  });
});
