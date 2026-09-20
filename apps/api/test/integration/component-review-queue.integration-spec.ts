import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import {
  ComponentReviewQueueService,
  type PersistComponentFindingInput,
} from '../../src/ml/component-review-queue.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  componentIntelligenceFindings,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';

/**
 * Pass 1 coverage: persisted findings, idempotent fingerprinting, queue
 * read/filter/pagination, reviewer decisions, feedback telemetry, stale
 * detection, and component-deletion behaviour.
 *
 * Intelligence generation and component mutation on acceptance are NOT part of
 * this pass and are therefore not exercised here.
 */
describe('Component Intelligence Review Queue (persistence + lifecycle)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const reviewer = { email: 'component-review-integration@ananya.local' };

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let reviewQueue: ComponentReviewQueueService;
  let component!: Awaited<ReturnType<ComponentsService['create']>>;
  let feedbackIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    reviewQueue = app.get(ComponentReviewQueueService);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    if (feedbackIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.id, feedbackIds));
      feedbackIds = [];
    }
    if (component) {
      await componentsService.delete(component.id).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  const buildFinding = (
    overrides: Partial<PersistComponentFindingInput> = {},
  ): PersistComponentFindingInput => ({
    componentId: component.id,
    issueType: 'MANUFACTURER_CONFLICT',
    issueCategory: 'IDENTITY',
    field: 'manufacturer',
    title: 'Manufacturer conflict detected',
    description: 'Suggested manufacturer differs from the stored manufacturer.',
    currentValue: { manufacturerId: null },
    suggestedValue: { manufacturerName: 'Yageo' },
    confidence: 0.97,
    confidenceLevel: 'HIGH',
    evidence: [
      {
        type: 'mpn_pattern',
        description: 'Matched MPN prefix RC0805FR for Yageo',
        weight: 0.9,
        source: 'datapack:electronics-smd',
      },
    ],
    source: 'datapack:electronics-smd',
    modelVersion: '1.0.0',
    intelligenceVersion: 'test-v1',
    componentUpdatedAt: component.updatedAt.toISOString(),
    ...overrides,
  });

  it('persists findings and deduplicates them by fingerprint', async () => {
    if (!hasDbUrl) return;

    component = await componentsService.create({
      sku: `E2E-CRQ-${Date.now()}`,
      name: 'Review Queue Integration Resistor',
      manufacturerPartNumber: 'RC0805FR-0727RL',
      unit: 'pcs',
    });

    const first = await reviewQueue.persistFindings([buildFinding()]);
    expect(first.persistedCount).toBe(1);
    const finding = first.findings[0]!;
    expect(finding.status).toBe('PENDING');
    expect(finding.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(finding.confidence).toBe(0.97);
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.evidence.length).toBe(1);
    expect(finding.component?.sku).toBe(component.sku);

    // Re-persisting an identical condition refreshes the row in place, and
    // duplicate findings inside a single batch collapse to one row.
    const second = await reviewQueue.persistFindings([
      buildFinding({ description: 'Refreshed description.' }),
      buildFinding({ description: 'Duplicate entry in the same batch.' }),
    ]);
    expect(second.persistedCount).toBe(1);
    expect(second.findings[0]!.id).toBe(finding.id);
    expect(second.findings[0]!.status).toBe('PENDING');
  });

  it('reads, filters, paginates, and summarises the queue', async () => {
    if (!hasDbUrl) return;

    const page = await reviewQueue.listFindings({
      componentId: component.id,
      search: component.sku.slice(0, 10),
    });
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.items.length).toBe(1);
    expect(page.summary.pending).toBe(1);
    expect(page.summary.byCategory.IDENTITY).toBe(1);
    expect(page.items[0]!.component?.id).toBe(component.id);

    const emptyPage = await reviewQueue.listFindings({
      status: 'ACCEPTED',
      componentId: component.id,
    });
    expect(emptyPage.total).toBe(0);
    expect(emptyPage.items.length).toBe(0);
    // Summary ignores the status filter so queue tabs keep true totals.
    expect(emptyPage.summary.total).toBe(1);

    await expect(
      reviewQueue.listFindings({ status: 'NOT_A_STATUS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a reviewer decision and appends AI feedback telemetry', async () => {
    if (!hasDbUrl) return;

    const pending = await reviewQueue.listFindings({
      componentId: component.id,
      status: 'PENDING',
    });
    const target = pending.items[0]!;

    const decided = await reviewQueue.recordDecision(
      target.id,
      {
        decision: 'REJECTED',
        decisionNotes: 'Stored manufacturer is correct.',
        expectedFingerprint: target.fingerprint,
      },
      reviewer,
    );
    expect(decided.status).toBe('REJECTED');
    expect(decided.reviewerEmail).toBe(reviewer.email);
    expect(decided.reviewedAt).not.toBeNull();
    expect(decided.decisionNotes).toBe('Stored manufacturer is correct.');

    const feedbackRows = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(
        and(
          eq(aiSuggestionFeedback.componentId, component.id),
          eq(aiSuggestionFeedback.suggestionType, 'MANUFACTURER_CONFLICT'),
        ),
      );
    expect(feedbackRows.length).toBe(1);
    feedbackIds = feedbackRows.map((row) => row.id);
    expect(feedbackRows[0]!.userAction).toBe('REJECTED');
    expect(feedbackRows[0]!.field).toBe('manufacturer');
    expect(feedbackRows[0]!.reviewerEmail).toBe(reviewer.email);
    expect(
      (feedbackRows[0]!.metadata as Record<string, unknown>).findingId,
    ).toBe(target.id);
  });

  it('guards terminal decisions and optimistic concurrency', async () => {
    if (!hasDbUrl) return;

    const rejected = await reviewQueue.listFindings({
      componentId: component.id,
      status: 'REJECTED',
    });
    await expect(
      reviewQueue.recordDecision(rejected.items[0]!.id, {
        decision: 'DISMISSED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const fresh = await reviewQueue.persistFindings([
      buildFinding({
        issueType: 'MPN_MISSING',
        issueCategory: 'DATA_QUALITY',
        field: 'manufacturerPartNumber',
        title: 'Manufacturer part number missing',
        description: 'The component has no persisted MPN.',
        suggestedValue: { manufacturerPartNumber: 'RC0805FR-0727RL' },
      }),
    ]);
    const freshId = fresh.findings[0]!.id;

    await expect(
      reviewQueue.recordDecision(freshId, {
        decision: 'ACCEPTED',
        expectedFingerprint: 'stale-fingerprint',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const stillPending = await reviewQueue.getFinding(freshId);
    expect(stillPending.status).toBe('PENDING');

    await reviewQueue.recordDecision(freshId, { decision: 'DISMISSED' });
    const dismissed = await reviewQueue.getFinding(freshId);
    expect(dismissed.status).toBe('DISMISSED');
  });

  it('detects stale findings, refuses acceptance, and reactivates on re-analysis', async () => {
    if (!hasDbUrl) return;

    const staleInput = buildFinding({
      issueType: 'CATEGORY_CONFLICT',
      issueCategory: 'CLASSIFICATION',
      field: 'category',
      title: 'Category conflict detected',
      description: 'Suggested category differs from the stored category.',
      suggestedValue: { categoryName: 'Resistors' },
      componentUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const created = await reviewQueue.persistFindings([staleInput]);
    const staleFindingId = created.findings[0]!.id;

    await expect(
      reviewQueue.recordDecision(staleFindingId, { decision: 'ACCEPTED' }),
    ).rejects.toBeInstanceOf(ConflictException);

    let staleFinding = await reviewQueue.getFinding(staleFindingId);
    expect(staleFinding.status).toBe('STALE');

    // A stale finding can never be accepted, but can still be resolved.
    await expect(
      reviewQueue.recordDecision(staleFindingId, { decision: 'ACCEPTED' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Re-running analysis with the same condition returns it to PENDING.
    await reviewQueue.persistFindings([staleInput]);
    staleFinding = await reviewQueue.getFinding(staleFindingId);
    expect(staleFinding.status).toBe('PENDING');

    // Explicit stale marking for future batch/audit passes.
    const marked = await reviewQueue.markFindingsStale({
      componentId: component.id,
      reason: 'integration-test',
    });
    expect(marked.staledCount).toBe(1);
    staleFinding = await reviewQueue.getFinding(staleFindingId);
    expect(staleFinding.status).toBe('STALE');
    expect(staleFinding.metadata.staleReason).toBe('integration-test');
  });

  it('deletes findings with the reviewed component', async () => {
    if (!hasDbUrl) return;

    const componentId = component.id;
    await componentsService.delete(componentId);

    const remaining = await db
      .select({ id: componentIntelligenceFindings.id })
      .from(componentIntelligenceFindings)
      .where(eq(componentIntelligenceFindings.componentId, componentId));
    expect(remaining.length).toBe(0);

    // Prevent the afterAll cleanup from attempting a second delete.
    component = undefined as unknown as typeof component;
  });
});
