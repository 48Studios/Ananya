import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AttributesService } from '../../src/attributes/attributes.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { AttributeIntelligenceFindingsService } from '../../src/ml/attribute-findings/attribute-finding.service';
import { buildAttributeFindingFingerprint } from '../../src/ml/attribute-findings/attribute-finding.fingerprint';
import type { PersistAttributeFindingInput } from '../../src/ml/attribute-findings/attribute-finding.dtos';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  attributeIntelligenceFindings,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';

/**
 * Attribute Intelligence findings substrate (Pass 1).
 *
 * Covers the persisted model end to end against a real database: subject
 * combinations, fingerprint idempotency, lifecycle, guarded decisions, feedback
 * telemetry, queue reads, filtering/pagination, staleness primitives and
 * reconciliation.
 *
 * Explicitly NOT covered here, because they are not part of this pass: detection
 * rules, attribute/category/option mutation, HTTP endpoints, and any authorization
 * change.
 *
 * Fixtures are run-tagged (jest runs spec files in parallel against one database,
 * and `Date.now()` repeats across workers, so identical codes would collide).
 */
describe('Attribute Intelligence findings (persistence + lifecycle)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = `af-${Math.random().toString(36).slice(2, 10)}`;
  const reviewer = { email: `attribute-findings-${runTag}@ananya.local` };

  let app: INestApplicationContext;
  let attributesService: AttributesService;
  let categoriesService: CategoriesService;
  let findingsService: AttributeIntelligenceFindingsService;

  const createdAttributeIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdFindingIds: string[] = [];
  const createdFeedbackIds: string[] = [];

  /** Creates a throwaway attribute definition and tracks it for cleanup. */
  const createAttribute = async (
    suffix: string,
    overrides: Partial<{
      name: string;
      dataType: 'TEXT' | 'NUMBER' | 'QUANTITY' | 'SELECT';
      unitCategory: string;
      defaultUnit: string;
      aliases: string[];
    }> = {},
  ) => {
    const definition = await attributesService.createDefinition({
      code: `${runTag}_${suffix}`.slice(0, 100),
      name: overrides.name ?? `Pass1 ${suffix} ${runTag}`,
      dataType: overrides.dataType ?? 'QUANTITY',
      unitCategory: overrides.unitCategory ?? 'Resistance',
      defaultUnit: overrides.defaultUnit ?? 'ohm',
      aliases: overrides.aliases ?? [],
    });
    createdAttributeIds.push(definition.id);
    return definition;
  };

  const createCategory = async (suffix: string) => {
    const category = await categoriesService.create({
      code: `${runTag}-${suffix}`.slice(0, 100),
      name: `Pass1 ${suffix} ${runTag}`,
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
    findingsService = app.get(AttributeIntelligenceFindingsService);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Order matters, and it follows the foreign keys:
    //
    //  1. findings — the subject columns cascade/set-null with the definitions, so
    //     deleting them first keeps the remaining deletes deterministic;
    //  2. feedback — `attribute_definition_id` / `category_id` are ON DELETE SET
    //     NULL, so a decision's feedback row must be removed BEFORE the subject it
    //     names, or it becomes unaddressable;
    //  3. definitions;
    //  4. categories.
    //
    // Findings and feedback are matched by subject as well as by tracked id,
    // because not every test records the rows it creates (a concurrency race, for
    // example, only knows which finding it decided).
    if (createdFindingIds.length > 0) {
      await db
        .delete(attributeIntelligenceFindings)
        .where(inArray(attributeIntelligenceFindings.id, createdFindingIds));
    }
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

      if (createdFeedbackIds.length > 0) {
        await db
          .delete(aiSuggestionFeedback)
          .where(inArray(aiSuggestionFeedback.id, createdFeedbackIds));
      }
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
    for (const categoryId of createdCategoryIds) {
      await categoriesService.delete(categoryId).catch(() => undefined);
    }

    await app.close();
    await closeDatabaseConnection();
  });

  const buildFinding = (
    overrides: Partial<PersistAttributeFindingInput> = {},
  ): PersistAttributeFindingInput => ({
    issueType: 'UNUSED_ATTRIBUTE',
    attributeDefinitionId: createdAttributeIds[0],
    title: `Unused attribute ${runTag}`,
    description:
      'This attribute has no category bindings and no component values.',
    currentValue: { bindingCount: 0, componentValueCount: 0 },
    suggestedValue: { action: 'RETIRE' },
    confidence: 0.75,
    confidenceLevel: 'MEDIUM',
    evidence: [
      {
        type: 'existing_data',
        description: 'Zero references in the attribute library',
        weight: 0.75,
        source: 'database:component_attribute_values',
      },
    ],
    source: `test:attribute-findings:${runTag}`,
    modelVersion: '1.0.0',
    intelligenceVersion: 'attribute-library-v1',
    ...overrides,
  });

  it('persists a finding with a single attribute subject', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('single');

    const result = await findingsService.persistFindings([
      buildFinding({ attributeDefinitionId: attribute.id }),
    ]);

    expect(result.persistedCount).toBe(1);
    const [finding] = result.findings;
    createdFindingIds.push(finding!.id);

    expect(finding!.attributeDefinitionId).toBe(attribute.id);
    expect(finding!.relatedAttributeDefinitionId).toBeNull();
    expect(finding!.categoryId).toBeNull();
    expect(finding!.optionId).toBeNull();
    expect(finding!.issueType).toBe('UNUSED_ATTRIBUTE');
    expect(finding!.issueCategory).toBe('ATTRIBUTE_USAGE');
    expect(finding!.status).toBe('PENDING');
    expect(finding!.confidence).toBeCloseTo(0.75);
    expect(finding!.confidenceLevel).toBe('MEDIUM');
    expect(finding!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(finding!.evidence).toHaveLength(1);
    expect(finding!.reviewerId).toBeNull();
    expect(finding!.reviewedAt).toBeNull();

    // The persisted row is readable back through the public service contract.
    const reloaded = await findingsService.getFinding(finding!.id);
    expect(reloaded.fingerprint).toBe(finding!.fingerprint);
    expect(reloaded.createdAt).toBe(finding!.createdAt);
  });

  it('persists a relationship subject with both attribute sides', async () => {
    if (!hasDbUrl) return;
    const first = await createAttribute('rel-a');
    const second = await createAttribute('rel-b');

    const result = await findingsService.persistFindings([
      buildFinding({
        issueType: 'POSSIBLE_DUPLICATE',
        attributeDefinitionId: first.id,
        relatedAttributeDefinitionId: second.id,
        title: `Possible duplicate ${runTag}`,
        description: `"${first.name}" and "${second.name}" look like the same property.`,
        suggestedValue: {
          matchType: 'TOKEN_SIMILARITY',
          canonicalSide: first.id,
        },
        field: 'identity',
      }),
    ]);

    const [finding] = result.findings;
    createdFindingIds.push(finding!.id);

    expect(finding!.issueCategory).toBe('ATTRIBUTE_IDENTITY');
    expect(finding!.attributeDefinitionId).not.toBeNull();
    expect(finding!.relatedAttributeDefinitionId).not.toBeNull();
    expect(finding!.field).toBe('identity');
  });

  it('canonicalizes relationship pair ordering so a mirrored finding is not created', async () => {
    if (!hasDbUrl) return;
    const first = await createAttribute('pair-a');
    const second = await createAttribute('pair-b');

    const forward = await findingsService.persistFindings([
      buildFinding({
        issueType: 'POSSIBLE_DUPLICATE',
        attributeDefinitionId: first.id,
        relatedAttributeDefinitionId: second.id,
        suggestedValue: { matchType: 'TOKEN_SIMILARITY' },
      }),
    ]);
    const reversed = await findingsService.persistFindings([
      buildFinding({
        issueType: 'POSSIBLE_DUPLICATE',
        attributeDefinitionId: second.id,
        relatedAttributeDefinitionId: first.id,
        suggestedValue: { matchType: 'TOKEN_SIMILARITY' },
      }),
    ]);

    const forwardFinding = forward.findings[0]!;
    createdFindingIds.push(forwardFinding.id);

    // One row, not two: the pair — not the walk order — is the identity.
    expect(reversed.findings[0]!.id).toBe(forwardFinding.id);
    expect(forwardFinding.fingerprint).toBe(reversed.findings[0]!.fingerprint);

    const rows = await db
      .select({ id: attributeIntelligenceFindings.id })
      .from(attributeIntelligenceFindings)
      .where(
        eq(
          attributeIntelligenceFindings.fingerprint,
          forwardFinding.fingerprint,
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('persists an attribute/category binding subject', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('binding');
    const category = await createCategory('binding');

    const result = await findingsService.persistFindings([
      buildFinding({
        issueType: 'SUGGESTED_BINDING',
        attributeDefinitionId: attribute.id,
        categoryId: category.id,
        title: `Bind "${attribute.name}" to "${category.name}"`,
        description: 'The domain expectation and usage support this binding.',
        suggestedValue: { isRequired: false, isExisting: true },
        confidence: 0.9,
        confidenceLevel: 'HIGH',
      }),
    ]);

    const [finding] = result.findings;
    createdFindingIds.push(finding!.id);

    expect(finding!.issueCategory).toBe('ATTRIBUTE_BINDING');
    expect(finding!.attributeDefinitionId).toBe(attribute.id);
    expect(finding!.categoryId).toBe(category.id);
  });

  it('persists a category-first finding whose attribute is not defined yet', async () => {
    if (!hasDbUrl) return;
    const category = await createCategory('gap');
    // Run-tagged so the assertion below is about THIS code and cannot be
    // confused with a standard code that already exists in the library.
    const undefinedCode = `${runTag}_dielectric`;

    const result = await findingsService.persistFindings([
      buildFinding({
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        attributeDefinitionId: null,
        categoryId: category.id,
        attributeCode: undefinedCode,
        title: `"${category.name}" is missing Dielectric`,
        description:
          'Dielectric is a standard specification for this category but is not bound.',
        suggestedValue: {
          isExisting: false,
          canonicalCode: undefinedCode,
          dataType: 'SELECT',
        },
      }),
    ]);

    const [finding] = result.findings;
    createdFindingIds.push(finding!.id);

    expect(finding!.attributeDefinitionId).toBeNull();
    expect(finding!.categoryId).toBe(category.id);
    expect(finding!.metadata.attributeCode).toBe(undefinedCode);

    // Nothing was invented: persisting a finding never creates a definition.
    const rows = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.code, undefinedCode));
    expect(rows).toHaveLength(0);
  });

  it('refuses a subject that cannot be reviewed, before writing anything', async () => {
    if (!hasDbUrl) return;

    await expect(
      findingsService.persistFindings([
        buildFinding({
          issueType: 'SUGGESTED_BINDING',
          attributeDefinitionId: createdAttributeIds[0],
          // No category: the binding subject is incomplete.
          title: 'Incomplete binding subject',
        }),
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an unknown issue type', async () => {
    if (!hasDbUrl) return;

    await expect(
      findingsService.persistFindings([
        buildFinding({ issueType: 'SEMANTIC_MAGIC' }),
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an issue category that contradicts the taxonomy', async () => {
    if (!hasDbUrl) return;

    await expect(
      findingsService.persistFindings([
        buildFinding({
          issueType: 'UNUSED_ATTRIBUTE',
          issueCategory: 'ATTRIBUTE_ENUM',
        }),
      ]),
    ).rejects.toThrow(/belongs to issue category/);
  });

  it('refuses a finding that references a definition which does not exist', async () => {
    if (!hasDbUrl) return;

    await expect(
      findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: '00000000-0000-4000-8000-000000000000',
        }),
      ]),
    ).rejects.toThrow(/not found/);
  });

  describe('idempotency', () => {
    it('refreshes the existing row instead of duplicating it', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('idem');

      const first = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          confidence: 0.5,
          confidenceLevel: 'LOW',
        }),
      ]);
      const finding = first.findings[0]!;
      createdFindingIds.push(finding.id);

      const second = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          confidence: 0.8,
          confidenceLevel: 'HIGH',
          evidence: [
            {
              type: 'existing_data',
              description: 'Recomputed usage snapshot',
              weight: 0.8,
              source: 'database:component_attribute_values',
            },
          ],
          metadata: { recomputed: true },
        }),
      ]);

      expect(second.findings).toHaveLength(1);
      expect(second.findings[0]!.id).toBe(finding.id);
      expect(second.findings[0]!.fingerprint).toBe(finding.fingerprint);
      // The snapshot is refreshed...
      expect(second.findings[0]!.confidence).toBeCloseTo(0.8);
      expect(second.findings[0]!.confidenceLevel).toBe('HIGH');
      expect(second.findings[0]!.evidence).toHaveLength(1);
      expect(second.findings[0]!.metadata.recomputed).toBe(true);
      // ...and the row count is unchanged.
      expect(second.persistedCount).toBe(1);
    });

    it('creates a new row when the observed state changes', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('state');

      const before = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          currentValue: { bindingCount: 0, componentValueCount: 0 },
        }),
      ]);
      createdFindingIds.push(before.findings[0]!.id);

      const after = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          currentValue: { bindingCount: 2, componentValueCount: 0 },
        }),
      ]);
      createdFindingIds.push(after.findings[0]!.id);

      expect(after.findings[0]!.id).not.toBe(before.findings[0]!.id);
      expect(after.findings[0]!.fingerprint).not.toBe(
        before.findings[0]!.fingerprint,
      );
    });

    it('collapses identical findings within one batch', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('batch');

      const result = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);

      expect(result.findings).toHaveLength(1);
      createdFindingIds.push(result.findings[0]!.id);
    });
  });

  describe('lifecycle', () => {
    it('records ACCEPTED with reviewer identity from the session context', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('accept');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      const decided = await findingsService.recordDecision(
        finding.id,
        { decision: 'ACCEPTED', decisionNotes: 'Confirmed by the engineer' },
        { id: undefined, email: reviewer.email },
      );

      expect(decided.status).toBe('ACCEPTED');
      expect(decided.reviewerEmail).toBe(reviewer.email);
      expect(decided.reviewedAt).not.toBeNull();
      expect(decided.decisionNotes).toBe('Confirmed by the engineer');
      expect(decided.metadata.decision).toBe('ACCEPTED');
    });

    it('records REJECTED and DISMISSED', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('reject-dismiss');

      const rejectedSeed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          currentValue: { bindingCount: 0 },
        }),
      ]);
      const rejected = await findingsService.recordDecision(
        rejectedSeed.findings[0]!.id,
        { decision: 'REJECTED', decisionNotes: 'Still in use' },
        reviewer,
      );
      createdFindingIds.push(rejected.id);
      expect(rejected.status).toBe('REJECTED');

      const dismissedSeed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          currentValue: { bindingCount: 1 },
        }),
      ]);
      const dismissed = await findingsService.recordDecision(
        dismissedSeed.findings[0]!.id,
        { decision: 'DISMISSED' },
        reviewer,
      );
      createdFindingIds.push(dismissed.id);
      expect(dismissed.status).toBe('DISMISSED');
      expect(dismissed.metadata.decision).toBe('DISMISSED');
    });

    it('refuses a second decision on a terminal finding', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('terminal');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(finding.id, {
        decision: 'ACCEPTED',
      });
      await expect(
        findingsService.recordDecision(finding.id, { decision: 'REJECTED' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a decision made against a different revision', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('fingerprint-guard');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await expect(
        findingsService.recordDecision(finding.id, {
          decision: 'ACCEPTED',
          expectedFingerprint: 'not-the-current-fingerprint',
        }),
      ).rejects.toThrow(/changed since it was loaded/i);
    });

    it('refuses to accept a stale finding but allows rejecting it', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('stale');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      const staled = await findingsService.markFindingsStale({
        ids: [finding.id],
        reason: 'the attribute was edited',
      });
      expect(staled.staledCount).toBe(1);

      const stale = await findingsService.getFinding(finding.id);
      expect(stale.status).toBe('STALE');
      expect(stale.metadata.staleReason).toBe('the attribute was edited');

      await expect(
        findingsService.recordDecision(finding.id, { decision: 'ACCEPTED' }),
      ).rejects.toThrow(/stale/i);

      const rejected = await findingsService.recordDecision(finding.id, {
        decision: 'REJECTED',
        decisionNotes: 'Superseded',
      });
      expect(rejected.status).toBe('REJECTED');
    });

    it('returns a STALE finding to PENDING when the same condition is detected again', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('revive');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.markFindingsStale({ ids: [finding.id] });
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'STALE',
      );

      const refreshed = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);

      expect(refreshed.findings[0]!.id).toBe(finding.id);
      expect(refreshed.findings[0]!.status).toBe('PENDING');
    });

    it('never overwrites a terminal decision on re-analysis', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('terminal-preserved');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(finding.id, {
        decision: 'ACCEPTED',
        decisionNotes: 'Approved by the engineer',
      });

      const reanalyzed = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);

      expect(reanalyzed.findings[0]!.status).toBe('ACCEPTED');
      expect(reanalyzed.findings[0]!.decisionNotes).toBe(
        'Approved by the engineer',
      );
      expect(reanalyzed.findings[0]!.reviewedAt).not.toBeNull();
    });
  });

  describe('decision concurrency', () => {
    it('lets exactly one of two competing decisions succeed', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('race');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      const results = await Promise.allSettled([
        findingsService.recordDecision(finding.id, {
          decision: 'ACCEPTED',
        }),
        findingsService.recordDecision(finding.id, {
          decision: 'REJECTED',
        }),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const settled = await findingsService.getFinding(finding.id);
      expect(['ACCEPTED', 'REJECTED']).toContain(settled.status);
    });
  });

  describe('feedback telemetry', () => {
    it('appends an ai_suggestion_feedback row per decision', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('feedback');
      const category = await createCategory('feedback');
      const created = await findingsService.persistFindings([
        buildFinding({
          issueType: 'SUGGESTED_BINDING',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(
        finding.id,
        { decision: 'ACCEPTED', decisionNotes: 'Bind it' },
        { id: undefined, email: reviewer.email },
      );

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.suggestionType, 'SUGGESTED_BINDING'),
            eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id),
            eq(aiSuggestionFeedback.categoryId, category.id),
          ),
        );
      const matching = feedback.find(
        (row) => row.metadata?.findingId === finding.id,
      );
      expect(matching).toBeDefined();
      createdFeedbackIds.push(matching!.id);

      expect(matching!.userAction).toBe('ACCEPTED');
      expect(matching!.componentId).toBeNull();
      expect(matching!.attributeDefinitionId).toBe(attribute.id);
      expect(matching!.categoryId).toBe(category.id);
      // The finding has no `field`, so the feedback field falls back to a stable
      // identifier derived from the issue type (feedback requires a non-empty one).
      expect(matching!.field).toBe('suggested_binding');
      expect(matching!.reviewerEmail).toBe(reviewer.email);
      expect(matching!.confidenceLevel).toBe('HIGH');
      expect(matching!.metadata?.findingTable).toBe(
        'attribute_intelligence_findings',
      );
      expect(matching!.metadata?.issueCategory).toBe('ATTRIBUTE_BINDING');
    });

    it('records DISMISSED as a rejected feedback action carrying the decision', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('feedback-dismiss');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(
        finding.id,
        { decision: 'DISMISSED', decisionNotes: 'Not now' },
        reviewer,
      );

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id),
            eq(aiSuggestionFeedback.userAction, 'REJECTED'),
          ),
        );
      const matching = feedback.find(
        (row) => row.metadata?.findingId === finding.id,
      );
      expect(matching).toBeDefined();
      createdFeedbackIds.push(matching!.id);

      // The feedback ledger has no DISMISSED action, so the distinction is
      // carried in metadata rather than by widening the global vocabulary.
      expect(matching!.metadata?.decision).toBe('DISMISSED');
      expect(matching!.field).toBe('unused_attribute');
    });

    it('records an acceptance carrying a reviewer value as EDITED', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('feedback-edited');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(
        finding.id,
        { decision: 'ACCEPTED', finalValue: { action: 'KEEP' } },
        reviewer,
      );

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id),
            eq(aiSuggestionFeedback.userAction, 'EDITED'),
          ),
        );
      const matching = feedback.find(
        (row) => row.metadata?.findingId === finding.id,
      );
      expect(matching).toBeDefined();
      createdFeedbackIds.push(matching!.id);
      expect(matching!.finalValue).toEqual({ action: 'KEEP' });
    });

    it('does not record feedback when a decision is refused', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('feedback-refused');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.markFindingsStale({ ids: [finding.id] });

      await expect(
        findingsService.recordDecision(finding.id, { decision: 'ACCEPTED' }),
      ).rejects.toThrow(ConflictException);

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.attributeDefinitionId, attribute.id));
      expect(
        feedback.filter((row) => row.metadata?.findingId === finding.id),
      ).toHaveLength(0);
    });
  });

  describe('queue reads', () => {
    it('filters by status, subject, issue type and category, and paginates', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('queue');
      const category = await createCategory('queue');
      const source = `test:attribute-findings:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          issueType: 'UNUSED_ATTRIBUTE',
          currentValue: { bindingCount: 0, usageBand: 'NO_VALUES_NO_BINDINGS' },
        }),
        buildFinding({
          attributeDefinitionId: attribute.id,
          issueType: 'INCONSISTENT_CONFIG',
          field: 'unit_category',
          currentValue: { unitCategory: null },
          suggestedValue: { unitCategory: 'Resistance' },
        }),
        buildFinding({
          issueType: 'SUGGESTED_BINDING',
          attributeDefinitionId: attribute.id,
          categoryId: category.id,
          currentValue: { bound: false },
        }),
      ]);
      for (const finding of seed.findings) createdFindingIds.push(finding.id);

      const byAttribute = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        source,
      });
      expect(byAttribute.summary.total).toBe(3);
      expect(byAttribute.total).toBe(3);

      const byType = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        issueType: 'UNUSED_ATTRIBUTE',
        source,
      });
      expect(byType.total).toBe(1);
      expect(byType.items[0]!.issueType).toBe('UNUSED_ATTRIBUTE');

      const byCategory = await findingsService.listFindings({
        categoryId: category.id,
        source,
      });
      expect(byCategory.total).toBe(1);
      expect(byCategory.items[0]!.issueType).toBe('SUGGESTED_BINDING');

      const byIssueCategory = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        issueCategory: 'ATTRIBUTE_CONFIG',
        source,
      });
      expect(byIssueCategory.total).toBe(1);
      expect(byIssueCategory.items[0]!.field).toBe('unit_category');

      const paged = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        source,
        page: 1,
        pageSize: 2,
      });
      expect(paged.items).toHaveLength(2);
      expect(paged.pageSize).toBe(2);
      expect(paged.total).toBe(3);

      const secondPage = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        source,
        page: 2,
        pageSize: 2,
      });
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]!.id).not.toBe(paged.items[0]!.id);

      const search = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        source,
        search: 'INCONSISTENT_CONFIG',
      });
      expect(search.total).toBe(1);
    });

    it('counts by status ignoring the status filter, like the component queue', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('counts');
      const source = `test:attribute-findings:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          currentValue: { bindingCount: 0 },
        }),
        buildFinding({
          attributeDefinitionId: attribute.id,
          issueType: 'INCONSISTENT_CONFIG',
          field: 'default_unit',
          currentValue: { defaultUnit: null },
        }),
      ]);
      for (const finding of seed.findings) createdFindingIds.push(finding.id);
      await findingsService.recordDecision(seed.findings[0]!.id, {
        decision: 'REJECTED',
      });

      const page = await findingsService.listFindings({
        attributeDefinitionId: attribute.id,
        source,
        status: 'PENDING',
      });

      // The page shows only PENDING...
      expect(page.total).toBe(1);
      expect(page.items.every((item) => item.status === 'PENDING')).toBe(true);
      // ...while the summary still reports the true totals.
      expect(page.summary.total).toBe(2);
      expect(page.summary.pending).toBe(1);
      expect(page.summary.rejected).toBe(1);
      expect(page.summary.byCategory.ATTRIBUTE_USAGE).toBe(1);
      expect(page.summary.byCategory.ATTRIBUTE_CONFIG).toBe(1);
    });

    it('rejects an unknown status filter instead of returning an empty page', async () => {
      if (!hasDbUrl) return;
      await expect(
        findingsService.listFindings({ status: 'NOT_A_STATUS' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown issue category filter', async () => {
      if (!hasDbUrl) return;
      await expect(
        findingsService.listFindings({
          issueCategory: 'NOT_A_CATEGORY' as 'ATTRIBUTE_ENUM',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reconciliation', () => {
    it('stales only the calling producer’s undetected PENDING findings', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('reconcile');
      const ownSource = `test:attribute-findings:${runTag}`;
      const otherSource = `test:other-producer:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          source: ownSource,
          currentValue: { bindingCount: 10 },
        }),
        buildFinding({
          attributeDefinitionId: attribute.id,
          source: otherSource,
          currentValue: { bindingCount: 11 },
        }),
      ]);
      const [ownFinding, otherFinding] = seed.findings;
      createdFindingIds.push(ownFinding!.id, otherFinding!.id);

      const result = await findingsService.reconcileFindings({
        attributeDefinitionIds: [attribute.id],
        activeFingerprints: [],
        sources: [ownSource],
        reason: 'no longer detected',
      });

      expect(result.staledCount).toBe(1);
      expect((await findingsService.getFinding(ownFinding!.id)).status).toBe(
        'STALE',
      );
      // Another producer's finding is never invalidated by this run.
      expect((await findingsService.getFinding(otherFinding!.id)).status).toBe(
        'PENDING',
      );
    });

    it('leaves a finding PENDING when its fingerprint was detected again', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('reconcile-active');
      const source = `test:attribute-findings:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          source,
          currentValue: { bindingCount: 20 },
        }),
      ]);
      const finding = seed.findings[0]!;
      createdFindingIds.push(finding.id);

      const result = await findingsService.reconcileFindings({
        attributeDefinitionIds: [attribute.id],
        activeFingerprints: [finding.fingerprint],
        sources: [source],
      });

      expect(result.staledCount).toBe(0);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'PENDING',
      );
    });

    it('never stales a finding that a reviewer already decided', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('reconcile-terminal');
      const source = `test:attribute-findings:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          attributeDefinitionId: attribute.id,
          source,
          currentValue: { bindingCount: 30 },
        }),
      ]);
      const finding = seed.findings[0]!;
      createdFindingIds.push(finding.id);

      await findingsService.recordDecision(finding.id, {
        decision: 'ACCEPTED',
      });

      const result = await findingsService.reconcileFindings({
        attributeDefinitionIds: [attribute.id],
        activeFingerprints: [],
        sources: [source],
      });

      expect(result.staledCount).toBe(0);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'ACCEPTED',
      );
    });

    it('scopes a relationship finding by either side of the pair', async () => {
      if (!hasDbUrl) return;
      const first = await createAttribute('reconcile-pair-a');
      const second = await createAttribute('reconcile-pair-b');
      const source = `test:attribute-findings:${runTag}`;

      const seed = await findingsService.persistFindings([
        buildFinding({
          issueType: 'POSSIBLE_DUPLICATE',
          attributeDefinitionId: first.id,
          relatedAttributeDefinitionId: second.id,
          source,
          suggestedValue: { matchType: 'TOKEN_SIMILARITY' },
        }),
      ]);
      const finding = seed.findings[0]!;
      createdFindingIds.push(finding.id);

      // Reconciling the *second* attribute must still reach the pair finding.
      const result = await findingsService.reconcileFindings({
        attributeDefinitionIds: [second.id],
        activeFingerprints: [],
        sources: [source],
      });

      expect(result.staledCount).toBe(1);
      expect((await findingsService.getFinding(finding.id)).status).toBe(
        'STALE',
      );
    });
  });

  describe('foreign keys', () => {
    it('deletes a finding when its primary attribute definition is deleted', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('cascade');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;

      await attributesService.deleteDefinition(attribute.id);
      const index = createdAttributeIds.indexOf(attribute.id);
      if (index >= 0) createdAttributeIds.splice(index, 1);

      const rows = await db
        .select({ id: attributeIntelligenceFindings.id })
        .from(attributeIntelligenceFindings)
        .where(eq(attributeIntelligenceFindings.id, finding.id));
      expect(rows).toHaveLength(0);
    });

    it('keeps the finding and nulls the related side when that attribute is deleted', async () => {
      if (!hasDbUrl) return;
      const primary = await createAttribute('setnull-primary');
      const related = await createAttribute('setnull-related');
      const created = await findingsService.persistFindings([
        buildFinding({
          issueType: 'POSSIBLE_DUPLICATE',
          attributeDefinitionId: primary.id,
          relatedAttributeDefinitionId: related.id,
          suggestedValue: { matchType: 'ALIAS_MATCH' },
        }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      await attributesService.deleteDefinition(related.id);
      const index = createdAttributeIds.indexOf(related.id);
      if (index >= 0) createdAttributeIds.splice(index, 1);

      const reloaded = await findingsService.getFinding(finding.id);
      expect(reloaded.attributeDefinitionId).toBe(primary.id);
      expect(reloaded.relatedAttributeDefinitionId).toBeNull();
    });

    it('enforces fingerprint uniqueness at the database level', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('unique');
      const created = await findingsService.persistFindings([
        buildFinding({ attributeDefinitionId: attribute.id }),
      ]);
      const finding = created.findings[0]!;
      createdFindingIds.push(finding.id);

      // The unique index — not application logic — is what makes concurrent
      // audits converge on one row.
      await expect(
        db.insert(attributeIntelligenceFindings).values({
          attributeDefinitionId: attribute.id,
          issueType: 'UNUSED_ATTRIBUTE',
          issueCategory: 'ATTRIBUTE_USAGE',
          title: 'Duplicate fingerprint attempt',
          description: 'Attempts to reuse an existing fingerprint.',
          source: `test:attribute-findings:${runTag}`,
          fingerprint: finding.fingerprint,
        }),
      ).rejects.toThrow();
    });
  });

  describe('transaction participation', () => {
    /**
     * The apply pass will run "lock finding → verify state → mutate domain →
     * update finding → insert feedback" inside one transaction. That is only
     * possible if this service can be bound to a caller-owned transaction, so the
     * seam is proven here rather than assumed: the same write must be invisible
     * when the surrounding transaction rolls back.
     */
    it('enrols a finding write in the caller’s transaction', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('tx');
      const input = buildFinding({ attributeDefinitionId: attribute.id });
      const written: string[] = [];

      await db
        .transaction(async (tx) => {
          const scoped = findingsService.withExecutor(tx as unknown as never);
          const persisted = await scoped.persistFindings([input]);
          expect(persisted.persistedCount).toBe(1);
          written.push(persisted.findings[0]!.id);
          // Roll the whole transaction back, as a failed apply step would.
          throw new Error('rollback-probe');
        })
        .catch(() => undefined);

      expect(written).toHaveLength(1);
      const rows = await db
        .select({ id: attributeIntelligenceFindings.id })
        .from(attributeIntelligenceFindings)
        .where(eq(attributeIntelligenceFindings.id, written[0]!));
      expect(rows).toHaveLength(0);
    });

    it('commits when the surrounding transaction commits', async () => {
      if (!hasDbUrl) return;
      const attribute = await createAttribute('tx-commit');
      const input = buildFinding({
        attributeDefinitionId: attribute.id,
        currentValue: { bindingCount: 99 },
      });
      const written: string[] = [];

      await db.transaction(async (tx) => {
        const scoped = findingsService.withExecutor(tx as unknown as never);
        const persisted = await scoped.persistFindings([input]);
        written.push(persisted.findings[0]!.id);
      });

      expect(written).toHaveLength(1);
      createdFindingIds.push(written[0]!);
      const reloaded = await findingsService.getFinding(written[0]!);
      expect(reloaded.status).toBe('PENDING');
    });
  });

  it('builds the same fingerprint the service persists', async () => {
    if (!hasDbUrl) return;
    const attribute = await createAttribute('fingerprint-parity');
    const input = buildFinding({ attributeDefinitionId: attribute.id });

    const created = await findingsService.persistFindings([input]);
    const finding = created.findings[0]!;
    createdFindingIds.push(finding.id);

    expect(finding.fingerprint).toBe(
      buildAttributeFindingFingerprint({
        issueType: input.issueType,
        subject: {
          attributeDefinitionId: attribute.id,
          attributeCode: null,
          categoryId: null,
          relatedAttributeDefinitionId: null,
        },
        currentState: input.currentValue ?? null,
        suggestedState: input.suggestedValue ?? null,
        field: null,
        intelligenceVersion: input.intelligenceVersion ?? null,
      }),
    );
  });
});
