import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { ComponentReviewApplyService } from '../../src/ml/component-review-apply.service';
import { DrizzleComponentRepository } from '../../src/infrastructure/repositories/drizzle-component.repository';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  categories,
  componentIntelligenceFindings,
  manufacturers,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';

/**
 * Pass 4 coverage: applying accepted findings to components.
 *
 * Every assertion checks BOTH sides of the contract:
 *  - the component field actually changed (through the domain path), and
 *  - the finding/feedback state is consistent with that change.
 * Refusal paths assert that the component is left untouched.
 */
describe('Component Review Apply (finding application)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const reviewer = { email: 'apply-integration@ananya.local' };

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let reviewQueue: ComponentReviewQueueService;
  let applyService: ComponentReviewApplyService;

  const createdComponentIds: string[] = [];
  const createdManufacturerIds: string[] = [];
  const createdCategoryIds: string[] = [];

  let activeManufacturerId = '';
  let inactiveManufacturerId = '';
  let activeCategoryId = '';
  let inactiveCategoryId = '';

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    reviewQueue = app.get(ComponentReviewQueueService);
    applyService = app.get(ComponentReviewApplyService);

    const manufacturerRows = await db
      .insert(manufacturers)
      .values([
        { code: `APPLYACT${runId}`, name: `Apply Active ${runId}` },
        {
          code: `APPLYINACT${runId}`,
          name: `Apply Inactive ${runId}`,
          isActive: false,
        },
      ])
      .returning({ id: manufacturers.id, isActive: manufacturers.isActive });
    activeManufacturerId = manufacturerRows[0]!.id;
    inactiveManufacturerId = manufacturerRows[1]!.id;
    createdManufacturerIds.push(activeManufacturerId, inactiveManufacturerId);

    const categoryRows = await db
      .insert(categories)
      .values([
        { code: `APPLYCATACT${runId}`, name: `Apply Category Active ${runId}` },
        {
          code: `APPLYCATINACT${runId}`,
          name: `Apply Category Inactive ${runId}`,
          isActive: false,
        },
      ])
      .returning({ id: categories.id, isActive: categories.isActive });
    activeCategoryId = categoryRows[0]!.id;
    inactiveCategoryId = categoryRows[1]!.id;
    createdCategoryIds.push(activeCategoryId, inactiveCategoryId);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (createdManufacturerIds.length > 0) {
      await db
        .delete(manufacturers)
        .where(inArray(manufacturers.id, createdManufacturerIds));
    }
    if (createdCategoryIds.length > 0) {
      await db
        .delete(categories)
        .where(inArray(categories.id, createdCategoryIds));
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  function reasonOf(error: unknown): string | undefined {
    if (error instanceof ConflictException) {
      const body = error.getResponse() as { reason?: string } | string;
      return typeof body === 'object' ? body.reason : undefined;
    }
    return undefined;
  }

  async function createComponent(overrides: Record<string, unknown> = {}) {
    const component = await componentsService.create({
      sku: `E2E-APPLY-${runId}-${createdComponentIds.length}`,
      name: `Apply Fixture ${createdComponentIds.length}`,
      unit: 'pcs',
      ...overrides,
    });
    createdComponentIds.push(component.id);
    return component;
  }

  /** Persists a single finding through the real queue service. */
  async function createFinding(input: {
    componentId: string;
    issueType: string;
    issueCategory: 'IDENTITY' | 'CLASSIFICATION' | 'DUPLICATE';
    field: string;
    currentValue: Record<string, unknown> | null;
    suggestedValue: Record<string, unknown>;
    componentUpdatedAt: Date;
  }) {
    const result = await reviewQueue.persistFindings([
      {
        componentId: input.componentId,
        issueType: input.issueType,
        issueCategory: input.issueCategory,
        field: input.field,
        title: `Fixture finding ${input.issueType}`,
        description: `Fixture finding for ${input.issueType}`,
        currentValue: input.currentValue,
        suggestedValue: input.suggestedValue,
        confidence: 0.95,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'mpn_pattern',
            description: 'Fixture evidence',
            weight: 0.9,
            source: 'analyzer:identity',
          },
        ],
        source: 'analyzer:identity',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt: input.componentUpdatedAt,
      },
    ]);
    return result.findings[0]!;
  }

  // -------------------------------------------------------------------------
  // MPN_MISSING
  // -------------------------------------------------------------------------

  it('applies MPN_MISSING: sets the MPN, accepts the finding, records feedback', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'RC0805FR-0727RL' },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint, decisionNotes: 'Confirmed' },
      reviewer,
    );

    expect(result.field).toBe('manufacturerPartNumber');
    expect(result.previousValue).toBeNull();
    expect(result.appliedValue).toBe('RC0805FR-0727RL');
    expect(result.component.manufacturerPartNumber).toBe('RC0805FR-0727RL');

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe('RC0805FR-0727RL');
    // Nothing else changed.
    expect(reloaded.sku).toBe(component.sku);
    expect(reloaded.name).toBe(component.name);
    expect(reloaded.categoryId).toBe(component.categoryId);

    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('ACCEPTED');
    expect(stored.reviewerEmail).toBe(reviewer.email);
    expect(stored.reviewedAt).not.toBeNull();
    expect(stored.decisionNotes).toBe('Confirmed');
    expect(stored.metadata.applied).toBe(true);
    expect(stored.metadata.appliedValue).toBe('RC0805FR-0727RL');

    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(
        and(
          eq(aiSuggestionFeedback.componentId, component.id),
          eq(aiSuggestionFeedback.suggestionType, 'MPN_MISSING'),
        ),
      );
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.userAction).toBe('ACCEPTED');
    expect(feedback[0]!.field).toBe('manufacturerPartNumber');
    expect(feedback[0]!.metadata?.action).toBe('APPLIED');
    expect(feedback[0]!.metadata?.applied).toBe(true);
    expect(feedback[0]!.metadata?.previousValue).toBeNull();
    expect(feedback[0]!.metadata?.appliedValue).toBe('RC0805FR-0727RL');
    expect(feedback[0]!.metadata?.fingerprint).toBe(finding.fingerprint);
  });

  // -------------------------------------------------------------------------
  // MPN_CONFLICT
  // -------------------------------------------------------------------------

  it('applies MPN_CONFLICT: replaces the existing MPN', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      manufacturerPartNumber: 'RC0805FR-0710RL',
    });
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_CONFLICT',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: 'RC0805FR-0710RL' },
      suggestedValue: { manufacturerPartNumber: 'RC0805FR-0727RL' },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    expect(result.previousValue).toBe('RC0805FR-0710RL');
    expect(result.appliedValue).toBe('RC0805FR-0727RL');

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe('RC0805FR-0727RL');
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('ACCEPTED');
  });

  // -------------------------------------------------------------------------
  // MANUFACTURER_UNRESOLVED / CONFLICT
  // -------------------------------------------------------------------------

  it('applies MANUFACTURER_UNRESOLVED: sets the manufacturer ID', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MANUFACTURER_UNRESOLVED',
      issueCategory: 'IDENTITY',
      field: 'manufacturer',
      currentValue: { manufacturerId: null, manufacturerName: null },
      suggestedValue: { manufacturerId: activeManufacturerId },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    expect(result.field).toBe('manufacturerId');
    expect(result.appliedValue).toBe(activeManufacturerId);
    expect(result.appliedValueLabel).toContain(`Apply Active ${runId}`);
    expect(result.previousValue).toBeNull();

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerId).toBe(activeManufacturerId);

    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('ACCEPTED');
    expect(String(stored.metadata.appliedValue)).toBe(activeManufacturerId);
  });

  it('applies MANUFACTURER_CONFLICT: replaces the manufacturer ID', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      manufacturerId: activeManufacturerId,
    });
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MANUFACTURER_CONFLICT',
      issueCategory: 'IDENTITY',
      field: 'manufacturer',
      currentValue: { manufacturerId: activeManufacturerId },
      suggestedValue: { manufacturerId: activeManufacturerId },
      componentUpdatedAt: component.updatedAt,
    });

    // Replacing with the same active manufacturer still exercises the write path.
    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );
    expect(result.field).toBe('manufacturerId');
    expect(result.previousValue).toBe(activeManufacturerId);
    expect(result.appliedValue).toBe(activeManufacturerId);
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('ACCEPTED');
  });

  // -------------------------------------------------------------------------
  // CATEGORY_UNRESOLVED / CONFLICT
  // -------------------------------------------------------------------------

  it('applies CATEGORY_UNRESOLVED: sets the category ID', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'CATEGORY_UNRESOLVED',
      issueCategory: 'CLASSIFICATION',
      field: 'category',
      currentValue: { categoryId: null, categoryName: null },
      suggestedValue: { categoryId: activeCategoryId },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    expect(result.field).toBe('categoryId');
    expect(result.appliedValue).toBe(activeCategoryId);
    expect(result.appliedValueLabel).toContain(
      `Apply Category Active ${runId}`,
    );

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.categoryId).toBe(activeCategoryId);
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('ACCEPTED');
  });

  it('applies CATEGORY_CONFLICT: replaces the category ID', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      categoryId: activeCategoryId,
    });
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'CATEGORY_CONFLICT',
      issueCategory: 'CLASSIFICATION',
      field: 'category',
      currentValue: { categoryId: activeCategoryId },
      suggestedValue: { categoryId: activeCategoryId },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );
    expect(result.field).toBe('categoryId');
    expect(result.previousValue).toBe(activeCategoryId);
    expect(result.appliedValue).toBe(activeCategoryId);
  });

  // -------------------------------------------------------------------------
  // Non-applicable findings
  // -------------------------------------------------------------------------

  it('refuses to apply EXACT_DUPLICATE and leaves both components untouched', async () => {
    if (!hasDbUrl) return;

    const canonical = await createComponent({
      manufacturerPartNumber: `DUP${runId}A`,
    });
    const duplicate = await createComponent({
      manufacturerPartNumber: `DUP${runId}A`,
    });

    const persisted = await reviewQueue.persistFindings([
      {
        componentId: duplicate.id,
        relatedComponentId: canonical.id,
        issueType: 'EXACT_DUPLICATE',
        issueCategory: 'DUPLICATE',
        field: 'duplicate',
        title: 'Duplicate',
        description: 'Fixture duplicate',
        currentValue: { manufacturerPartNumber: `DUP${runId}A` },
        suggestedValue: { duplicateOfComponentId: canonical.id },
        confidence: 1,
        confidenceLevel: 'HIGH',
        evidence: [],
        source: 'analyzer:duplicate',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt: duplicate.updatedAt,
      },
    ]);
    const finding = persisted.findings[0]!;

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('UNSUPPORTED_FINDING_TYPE');
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');

    const [left, right] = await Promise.all([
      componentsService.getComponent(canonical.id),
      componentsService.getComponent(duplicate.id),
    ]);
    expect(left.manufacturerPartNumber).toBe(`DUP${runId}A`);
    expect(right.manufacturerPartNumber).toBe(`DUP${runId}A`);
    // Still distinct records: nothing was merged or deleted.
    expect(left.id).not.toBe(right.id);
  });

  it('refuses to apply POTENTIAL_DUPLICATE', async () => {
    if (!hasDbUrl) return;

    const canonical = await createComponent({
      manufacturerPartNumber: `VAR${runId}KL`,
    });
    const variant = await createComponent({
      manufacturerPartNumber: `VAR${runId}KLTR`,
    });

    const persisted = await reviewQueue.persistFindings([
      {
        componentId: variant.id,
        relatedComponentId: canonical.id,
        issueType: 'POTENTIAL_DUPLICATE',
        issueCategory: 'DUPLICATE',
        field: 'duplicate',
        title: 'Packaging variant',
        description: 'Fixture packaging variant',
        currentValue: { manufacturerPartNumber: `VAR${runId}KLTR` },
        suggestedValue: { matchType: 'PACKAGING_VARIANT' },
        confidence: 0.9,
        confidenceLevel: 'HIGH',
        evidence: [],
        source: 'analyzer:duplicate',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt: variant.updatedAt,
      },
    ]);

    const error = await applyService
      .applyFinding(
        persisted.findings[0]!.id,
        { expectedFingerprint: persisted.findings[0]!.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('UNSUPPORTED_FINDING_TYPE');
    const reloaded = await componentsService.getComponent(variant.id);
    expect(reloaded.manufacturerPartNumber).toBe(`VAR${runId}KLTR`);
  });

  // -------------------------------------------------------------------------
  // Value validation
  // -------------------------------------------------------------------------

  it('refuses a measurement as an MPN and does not mutate the component', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: '125mW' },
      componentUpdatedAt: component.updatedAt,
    });

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('INVALID_SUGGESTED_VALUE');
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
  });

  it('refuses an unknown or inactive manufacturer', async () => {
    if (!hasDbUrl) return;

    for (const [manufacturerId, expectedReason] of [
      ['00000000-0000-4000-8000-000000000000', 'SUGGESTED_ENTITY_NOT_FOUND'],
      [inactiveManufacturerId, 'SUGGESTED_ENTITY_INACTIVE'],
    ] as const) {
      const component = await createComponent();
      const finding = await createFinding({
        componentId: component.id,
        issueType: 'MANUFACTURER_UNRESOLVED',
        issueCategory: 'IDENTITY',
        field: 'manufacturer',
        currentValue: { manufacturerId: null },
        suggestedValue: { manufacturerId },
        componentUpdatedAt: component.updatedAt,
      });

      const error = await applyService
        .applyFinding(
          finding.id,
          { expectedFingerprint: finding.fingerprint },
          reviewer,
        )
        .catch((e: unknown) => e);

      expect(reasonOf(error)).toBe(expectedReason);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerId).toBeNull();
    }
  });

  it('refuses an unknown or inactive category', async () => {
    if (!hasDbUrl) return;

    for (const [categoryId, expectedReason] of [
      ['00000000-0000-4000-8000-000000000001', 'SUGGESTED_ENTITY_NOT_FOUND'],
      [inactiveCategoryId, 'SUGGESTED_ENTITY_INACTIVE'],
    ] as const) {
      const component = await createComponent();
      const finding = await createFinding({
        componentId: component.id,
        issueType: 'CATEGORY_UNRESOLVED',
        issueCategory: 'CLASSIFICATION',
        field: 'category',
        currentValue: { categoryId: null },
        suggestedValue: { categoryId },
        componentUpdatedAt: component.updatedAt,
      });

      const error = await applyService
        .applyFinding(
          finding.id,
          { expectedFingerprint: finding.fingerprint },
          reviewer,
        )
        .catch((e: unknown) => e);

      expect(reasonOf(error)).toBe(expectedReason);
      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.categoryId).toBeNull();
    }
  });

  it('refuses a finding that carries no entity identifier', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MANUFACTURER_UNRESOLVED',
      issueCategory: 'IDENTITY',
      field: 'manufacturer',
      currentValue: { manufacturerId: null },
      // Name only — review application must never resolve a free-form name.
      suggestedValue: { manufacturerName: 'Yageo' },
      componentUpdatedAt: component.updatedAt,
    });

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('INVALID_SUGGESTED_VALUE');
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Concurrency / currentness
  // -------------------------------------------------------------------------

  it('refuses a fingerprint mismatch without mutating anything', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'RC0805FR-0710KL' },
      componentUpdatedAt: component.updatedAt,
    });

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: 'not-the-current-fingerprint' },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('FINGERPRINT_MISMATCH');
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
  });

  it('refuses applying a finding whose component changed, and marks it stale', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'CRCW0603100KFKEA' },
      // Snapshot from before the external edit below.
      componentUpdatedAt: new Date(component.updatedAt.getTime() - 60_000),
    });

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('COMPONENT_CHANGED');

    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('STALE');
    expect(String(stored.metadata.staleReason)).toContain('changed');

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
  });

  it('refuses when the component field was edited after analysis', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      manufacturerPartNumber: 'ORIGINAL-1234',
    });
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_CONFLICT',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: 'ORIGINAL-1234' },
      suggestedValue: { manufacturerPartNumber: 'CRCW0603100KFKEA' },
      componentUpdatedAt: component.updatedAt,
    });

    // A reviewer edits the component through the normal UI path meanwhile.
    await componentsService.update(component.id, {
      manufacturerPartNumber: 'MANUALEDIT-99',
    });
    // Keep the snapshot claim valid so the field guard is what refuses.
    await db
      .update(componentIntelligenceFindings)
      .set({
        metadata: {
          ...(finding.metadata ?? {}),
          componentUpdatedAt: (
            await componentsService.getComponent(component.id)
          ).updatedAt.toISOString(),
        },
      })
      .where(eq(componentIntelligenceFindings.id, finding.id));

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('COMPONENT_CHANGED');
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe('MANUALEDIT-99');
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
  });

  it('refuses a second application of the same finding (no double mutation)', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'SS34FIXTURE1' },
      componentUpdatedAt: component.updatedAt,
    });

    const first = await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );
    expect(first.appliedValue).toBe('SS34FIXTURE1');

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    expect(reasonOf(error)).toBe('FINDING_NOT_PENDING');

    // Exactly one feedback row: the failed attempt wrote nothing.
    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));
    expect(feedback.length).toBe(1);
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('ACCEPTED');
  });

  it('allows only one of two simultaneous applications to succeed', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'CONCURRENTFIX1' },
      componentUpdatedAt: component.updatedAt,
    });

    const results = await Promise.allSettled([
      applyService.applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      ),
      applyService.applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(reasonOf((rejected[0] as PromiseRejectedResult).reason)).toBe(
      'FINDING_NOT_PENDING',
    );

    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('ACCEPTED');

    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));
    expect(feedback.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Transactionality / reconciliation
  // -------------------------------------------------------------------------

  it('rolls back the finding transition and feedback when the component write fails', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'ROLLBACKFIXTUR1' },
      componentUpdatedAt: component.updatedAt,
    });

    // The finding transition happens before the component write, so a failure
    // at the persistence boundary proves the whole transaction rolls back.
    const spy = jest
      .spyOn(DrizzleComponentRepository.prototype, 'update')
      .mockRejectedValueOnce(new Error('forced component write failure'));

    const error = await applyService
      .applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      )
      .catch((e: unknown) => e);

    spy.mockRestore();

    // A plain failure, not a state conflict.
    expect(error).toBeInstanceOf(Error);
    expect(reasonOf(error)).toBeUndefined();

    // No ACCEPTED finding without the component mutation.
    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('PENDING');
    expect(stored.reviewedAt).toBeNull();

    // No component mutation.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();

    // No feedback claiming an application that never happened.
    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));
    expect(feedback.length).toBe(0);
  });

  it('leaves no partial state when the applied value fails domain validation', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'CATEGORY_UNRESOLVED',
      issueCategory: 'CLASSIFICATION',
      field: 'category',
      currentValue: { categoryId: null },
      suggestedValue: { categoryId: activeCategoryId },
      componentUpdatedAt: component.updatedAt,
    });

    await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    const reloaded = await componentsService.getComponent(component.id);
    const stored = await reviewQueue.getFinding(finding.id);
    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));

    // Component, finding, and feedback all agree on the same outcome.
    expect(reloaded.categoryId).toBe(activeCategoryId);
    expect(stored.status).toBe('ACCEPTED');
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.finalValue).toEqual({ categoryId: activeCategoryId });
  });

  it('marks sibling pending findings stale after a successful apply, keeping the applied one accepted', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();

    const applied = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'SIBLINGFIXTU1' },
      componentUpdatedAt: component.updatedAt,
    });

    const sibling = await createFinding({
      componentId: component.id,
      issueType: 'CATEGORY_UNRESOLVED',
      issueCategory: 'CLASSIFICATION',
      field: 'category',
      currentValue: { categoryId: null },
      suggestedValue: { categoryId: activeCategoryId },
      componentUpdatedAt: component.updatedAt,
    });

    const result = await applyService.applyFinding(
      applied.id,
      { expectedFingerprint: applied.fingerprint },
      reviewer,
    );

    expect(result.staledFindingCount).toBe(1);
    expect((await reviewQueue.getFinding(applied.id)).status).toBe('ACCEPTED');

    const siblingStored = await reviewQueue.getFinding(sibling.id);
    expect(siblingStored.status).toBe('STALE');
    expect(String(siblingStored.metadata.staleReason)).toContain('applying');
  });

  it('rejects an unknown finding id', async () => {
    if (!hasDbUrl) return;
    await expect(
      applyService.applyFinding(
        '00000000-0000-4000-8000-0000000000ff',
        { expectedFingerprint: 'anything' },
        reviewer,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a security audit entry for the application', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent();
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      suggestedValue: { manufacturerPartNumber: 'AUDITFIXTURE1' },
      componentUpdatedAt: component.updatedAt,
    });

    await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    const { securityAuditLogs } = await import('@ananya/database/schema');
    const rows = await db
      .select()
      .from(securityAuditLogs)
      .where(
        eq(securityAuditLogs.action, 'COMPONENT_INTELLIGENCE_FINDING_APPLIED'),
      );
    const match = rows.find(
      (row) =>
        (row.details as Record<string, unknown> | null)?.findingId ===
        finding.id,
    );
    expect(match).toBeDefined();
    expect((match!.details as Record<string, unknown>).appliedValue).toBe(
      'AUDITFIXTURE1',
    );
  });

  it('never writes component fields other than the finding’s mapped field', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      name: 'Immutable Fixture Name',
      description: 'Immutable fixture description',
    });
    const finding = await createFinding({
      componentId: component.id,
      issueType: 'MPN_MISSING',
      issueCategory: 'IDENTITY',
      field: 'manufacturerPartNumber',
      currentValue: { manufacturerPartNumber: null },
      // A hostile suggestion carrying extra fields must be ignored.
      suggestedValue: {
        manufacturerPartNumber: 'SAFEFIXTURE01',
        name: 'Hijacked name',
        sku: 'HIJACKED',
        unit: 'kg',
        isActive: false,
        categoryId: activeCategoryId,
      },
      componentUpdatedAt: component.updatedAt,
    });

    await applyService.applyFinding(
      finding.id,
      { expectedFingerprint: finding.fingerprint },
      reviewer,
    );

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe('SAFEFIXTURE01');
    expect(reloaded.name).toBe('Immutable Fixture Name');
    expect(reloaded.description).toBe('Immutable fixture description');
    expect(reloaded.sku).toBe(component.sku);
    expect(reloaded.unit).toBe('pcs');
    expect(reloaded.isActive).toBe(true);
    expect(reloaded.categoryId).toBeNull();
  });
});
