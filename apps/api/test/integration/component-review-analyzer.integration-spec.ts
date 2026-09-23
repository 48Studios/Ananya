import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import {
  ComponentReviewAnalyzer,
  COMPONENT_REVIEW_INTELLIGENCE_VERSION,
} from '../../src/ml/component-review-analyzer';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { closeDatabaseConnection } from '@ananya/database';

/**
 * Pass 2 coverage: persisted components -> analyzer -> review findings.
 *
 * Assertions target the deterministic rules (MPN extraction and duplicate
 * detection) so the suite does not depend on the ML microservice being
 * reachable. The analyzer must never mutate component data.
 */
describe('Component Review Analyzer (finding generation)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const sharedMpn = `ZZ${runId}KL`;

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let reviewQueue: ComponentReviewQueueService;
  let analyzer: ComponentReviewAnalyzer;

  const createdComponentIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    reviewQueue = app.get(ComponentReviewQueueService);
    analyzer = app.get(ComponentReviewAnalyzer);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  it('persists an exact MPN duplicate against the older record without mutating either component', async () => {
    if (!hasDbUrl) return;

    const original = await componentsService.create({
      sku: `E2E-DUP-A-${runId}`,
      name: 'Analysis Fixture Resistor A',
      manufacturerPartNumber: sharedMpn,
      unit: 'pcs',
    });
    createdComponentIds.push(original.id);

    const duplicate = await componentsService.create({
      sku: `E2E-DUP-B-${runId}`,
      name: 'Analysis Fixture Resistor B',
      // Lower case on purpose: normalization must still match.
      manufacturerPartNumber: sharedMpn.toLowerCase(),
      unit: 'pcs',
    });
    createdComponentIds.push(duplicate.id);

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [original.id, duplicate.id],
    });

    expect(result.scope).toBe('SELECTED');
    expect(result.analyzedCount).toBe(2);
    expect(result.intelligenceVersion).toBe(
      COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    );
    expect(result.persistedCount).toBeGreaterThanOrEqual(1);

    // The audit response publishes the canonical taxonomy.
    expect(result.issueTypes).toEqual({
      IDENTITY: [
        'MPN_MISSING',
        'MPN_CONFLICT',
        'MANUFACTURER_UNRESOLVED',
        'MANUFACTURER_CONFLICT',
      ],
      CLASSIFICATION: ['CATEGORY_UNRESOLVED', 'CATEGORY_CONFLICT'],
      // Pass 3: datasheet specifications become reviewable on the same queue.
      // Pass 4 adds DOCUMENT_CONFLICT: the queue must distinguish "here is a value
      // to apply" from "the component's documents disagree". The
      // attribute-relevance producer adds ATTRIBUTE_VALUE_UNKNOWN for a
      // specification that is relevant but has no determinable value.
      ATTRIBUTE_VALUE: [
        'ATTRIBUTE_VALUE_SUGGESTION',
        'ATTRIBUTE_VALUE_UNKNOWN',
        'DOCUMENT_CONFLICT',
      ],
      DUPLICATE: ['EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE'],
      DATA_QUALITY: [],
    });

    const duplicates = await reviewQueue.listFindings({
      componentId: duplicate.id,
      issueType: 'EXACT_DUPLICATE',
    });
    expect(duplicates.total).toBe(1);

    const finding = duplicates.items[0]!;
    expect(finding.issueType).toBe('EXACT_DUPLICATE');
    expect(finding.issueCategory).toBe('DUPLICATE');
    expect(finding.status).toBe('PENDING');
    expect(finding.componentId).toBe(duplicate.id);
    expect(finding.relatedComponentId).toBe(original.id);
    expect(finding.relatedComponent?.sku).toBe(original.sku);
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.confidence).toBe(1);
    expect(finding.evidence.length).toBeGreaterThan(0);
    expect(finding.suggestedValue).toMatchObject({
      duplicateOfComponentId: original.id,
      duplicateOfSku: original.sku,
      matchType: 'EXACT_MPN',
    });
    expect(finding.metadata.componentUpdatedAt).toBeDefined();

    // Findings must never mutate authoritative component data.
    const [reloadedOriginal, reloadedDuplicate] = await Promise.all([
      componentsService.getComponent(original.id),
      componentsService.getComponent(duplicate.id),
    ]);
    expect(reloadedOriginal.manufacturerPartNumber).toBe(sharedMpn);
    expect(reloadedDuplicate.manufacturerPartNumber).toBe(
      sharedMpn.toLowerCase(),
    );
    expect(reloadedOriginal.categoryId).toBeNull();
    expect(reloadedDuplicate.categoryId).toBeNull();
    expect(reloadedOriginal.manufacturerId).toBeNull();
    expect(reloadedDuplicate.manufacturerId).toBeNull();
  });

  it('is idempotent when the same condition is analyzed again', async () => {
    if (!hasDbUrl) return;

    const before = await reviewQueue.listFindings({
      componentId: createdComponentIds[1]!,
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [createdComponentIds[0]!, createdComponentIds[1]!],
    });

    const after = await reviewQueue.listFindings({
      componentId: createdComponentIds[1]!,
    });

    const duplicateFindings = after.items.filter(
      (finding) => finding.issueType === 'EXACT_DUPLICATE',
    );
    expect(duplicateFindings).toHaveLength(1);
    expect(after.total).toBe(before.total);
  });

  it('extracts a missing MPN from the component name', async () => {
    if (!hasDbUrl) return;

    const token = `CRQ${runId}X`;
    const component = await componentsService.create({
      sku: `E2E-MPN-${runId}`,
      name: `Analysis Fixture Resistor ${token}`,
      description: 'Resistor without a recorded manufacturer part number',
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [component.id],
    });

    const findings = await reviewQueue.listFindings({
      componentId: component.id,
      issueType: 'MPN_MISSING',
    });
    expect(findings.total).toBe(1);

    const finding = findings.items[0]!;
    expect(finding.issueCategory).toBe('IDENTITY');
    expect(finding.suggestedValue?.manufacturerPartNumber).toBe(token);
    expect(finding.currentValue).toMatchObject({
      manufacturerPartNumber: null,
    });

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
  });

  it('REGRESSION: does not propose a power rating as the missing MPN', async () => {
    if (!hasDbUrl) return;

    // Mirrors the real CMP-000003 component whose description is specifications
    // only; the analyzer previously proposed "125MW" (125 mW) as its MPN.
    const component = await componentsService.create({
      sku: `E2E-SPEC-${runId}`,
      name: '27Ω 0805 SMD Thick Film Resistor',
      description:
        '27Ω ±1% 125mW 0805 thick-film for general-purpose applications resistor.',
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [component.id],
    });

    const allFindings = await reviewQueue.listFindings({
      componentId: component.id,
    });
    const identityFindings = allFindings.items.filter((finding) =>
      ['MPN_MISSING', 'MPN_CONFLICT'].includes(finding.issueType),
    );
    expect(identityFindings).toHaveLength(0);

    // Guard against any measurement sneaking in as a part number. The check is
    // on the field that would carry one: an attribute suggestion legitimately
    // proposes the power rating as an attribute *value* ("Power Rating: 125mW"),
    // which is the extraction working, not an MPN being invented from it.
    for (const finding of allFindings.items) {
      const suggested = JSON.stringify(finding.suggestedValue ?? {});
      if (finding.issueType.startsWith('MPN')) {
        expect(suggested).not.toContain('125MW');
        expect(suggested).not.toContain('125mW');
      }
      expect(finding.suggestedValue?.manufacturerPartNumber ?? null).toBeNull();
    }

    // The power rating is extracted as an attribute value, which is what the
    // attribute pipeline is for.
    const powerSuggestion = allFindings.items.find(
      (finding) =>
        finding.issueType === 'ATTRIBUTE_VALUE_SUGGESTION' &&
        finding.metadata?.attributeCode === 'power_rating',
    );
    expect(powerSuggestion).toBeDefined();
    expect(powerSuggestion?.metadata?.actionable).toBe(true);

    // The audit must still not mutate the component.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
    expect(reloaded.description).toBe(
      '27Ω ±1% 125mW 0805 thick-film for general-purpose applications resistor.',
    );
  });

  it('marks findings stale once the underlying condition is resolved', async () => {
    if (!hasDbUrl) return;

    const [originalId, duplicateId] = createdComponentIds;

    // Resolve the duplicate: the newer record gets its own unique MPN.
    await componentsService.update(duplicateId!, {
      manufacturerPartNumber: `UNIQUE${runId}`,
    });

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [originalId!, duplicateId!],
    });
    expect(result.staledCount).toBeGreaterThanOrEqual(1);

    const staleFindings = await reviewQueue.listFindings({
      componentId: duplicateId!,
      issueType: 'EXACT_DUPLICATE',
    });
    expect(staleFindings.total).toBe(1);
    expect(staleFindings.items[0]!.status).toBe('STALE');
    expect(String(staleFindings.items[0]!.metadata.staleReason)).toContain(
      'No longer detected',
    );

    // The edited component keeps its new value.
    const reloaded = await componentsService.getComponent(duplicateId!);
    expect(reloaded.manufacturerPartNumber).toBe(`UNIQUE${runId}`);
  });

  it('detects an exact duplicate beyond a 100-row candidate window', async () => {
    if (!hasDbUrl) return;

    // Fillers are created first, so the authoritative catalog contains well
    // over 100 rows before the duplicate pair. A windowed candidate query would
    // miss the pair; the persistent MPN comparison must not.
    const fillerIds: string[] = [];
    for (let batch = 0; batch < 6; batch += 1) {
      const created = await Promise.all(
        Array.from({ length: 20 }, (_, index) => {
          const ordinal = batch * 20 + index;
          return componentsService.create({
            sku: `E2E-FILL-${runId}-${ordinal}`,
            name: `Analysis Fixture Filler ${ordinal}`,
            manufacturerPartNumber: `FILL${runId}${ordinal
              .toString()
              .padStart(4, '0')}X`,
            unit: 'pcs',
          });
        }),
      );
      fillerIds.push(...created.map((component) => component.id));
    }
    createdComponentIds.push(...fillerIds);
    expect(fillerIds.length).toBeGreaterThan(100);

    const windowMpn = `WINDOW${runId}KL`;
    const canonical = await componentsService.create({
      sku: `E2E-WIN-A-${runId}`,
      name: 'Window Fixture Resistor A',
      manufacturerPartNumber: windowMpn,
      unit: 'pcs',
    });
    createdComponentIds.push(canonical.id);

    const duplicate = await componentsService.create({
      sku: `E2E-WIN-B-${runId}`,
      name: 'Window Fixture Resistor B',
      manufacturerPartNumber: windowMpn,
      unit: 'pcs',
    });
    createdComponentIds.push(duplicate.id);

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [duplicate.id],
    });
    expect(result.analyzedCount).toBe(1);

    const findings = await reviewQueue.listFindings({
      componentId: duplicate.id,
      issueType: 'EXACT_DUPLICATE',
    });
    expect(findings.total).toBe(1);
    expect(findings.items[0]!.relatedComponentId).toBe(canonical.id);

    // Filler components carry unique MPNs, so they must not produce duplicates.
    const fillerFindings = await reviewQueue.listFindings({
      issueType: 'EXACT_DUPLICATE',
      pageSize: 100,
    });
    expect(
      fillerFindings.items.filter((finding) =>
        fillerIds.includes(finding.componentId),
      ),
    ).toHaveLength(0);
  });

  it('reports MPN_CONFLICT for a persisted MPN that disagrees with the component text', async () => {
    if (!hasDbUrl) return;

    const component = await componentsService.create({
      sku: `E2E-MPNC-${runId}`,
      name: 'Analysis Fixture Resistor RC0805FR-0727RL 27Ω',
      description: 'Fixture whose name identifies a different part number',
      manufacturerPartNumber: 'RC0805FR-0710RL',
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [component.id],
    });

    const findings = await reviewQueue.listFindings({
      componentId: component.id,
      issueType: 'MPN_CONFLICT',
    });
    expect(findings.total).toBe(1);

    const finding = findings.items[0]!;
    expect(finding.issueCategory).toBe('IDENTITY');
    expect(finding.currentValue).toMatchObject({
      manufacturerPartNumber: 'RC0805FR-0710RL',
    });
    expect(finding.suggestedValue).toMatchObject({
      manufacturerPartNumber: 'RC0805FR-0727RL',
    });
    expect(finding.confidenceLevel).toBe('HIGH');

    // Analysis is advisory only: the stored value must be untouched.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe('RC0805FR-0710RL');
  });

  it('validates the audit request and reports unknown component ids', async () => {
    if (!hasDbUrl) return;

    await expect(
      analyzer.runAudit({ scope: 'SELECTED' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: ['00000000-0000-4000-8000-000000000000'],
    });
    expect(result.analyzedCount).toBe(0);
    expect(result.notFoundCount).toBe(1);
    expect(result.persistedCount).toBe(0);
  });
});
