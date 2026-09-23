import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { AttributesService } from '../../src/attributes/attributes.service';
import { ComponentReviewAnalyzer } from '../../src/ml/component-review-analyzer';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { ComponentReviewApplyService } from '../../src/ml/component-review-apply.service';
import { ATTRIBUTE_SUGGESTION_SOURCE } from '../../src/ml/component-attribute-suggestion-findings';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  componentIntelligenceFindings,
} from '@ananya/database/schema';
import { inArray } from '@ananya/database/query';

/**
 * Attribute suggestions → review-queue findings, end to end.
 *
 * The rule matrix is unit-tested in
 * `component-attribute-suggestion-findings.spec.ts`; what this suite proves is
 * the behaviour that only exists once a real audit runs: findings are persisted
 * for a real component, re-running the audit does not duplicate them, recording
 * the value retires the relevance-only finding, and the queue's own apply path
 * treats the two kinds differently.
 *
 * The fixtures are self-owned (a category created for the run, bound to an
 * existing library definition) so the suite does not depend on the shared
 * library's configuration and does not add global attribute definitions, which
 * other suites analyse. The analysis itself is deterministic with or without the
 * ML container: relevance comes from the category binding, and the value from an
 * option the supplied text names.
 */
describe('Component attribute findings (producer → queue)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const categoryCode = `E2EAF${runId}`;
  const boundCode = 'mounting_type';
  const boundValue = 'Through Hole';

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let categoriesService: CategoriesService;
  let attributesService: AttributesService;
  let reviewQueue: ComponentReviewQueueService;
  let applyService: ComponentReviewApplyService;
  let analyzer: ComponentReviewAnalyzer;

  let categoryId: string;
  let definitionId: string;
  const createdComponentIds: string[] = [];

  /** Findings and feedback this run owns, so cleanup never guesses. */
  const createdFindingIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    categoriesService = app.get(CategoriesService);
    attributesService = app.get(AttributesService);
    reviewQueue = app.get(ComponentReviewQueueService);
    applyService = app.get(ComponentReviewApplyService);
    analyzer = app.get(ComponentReviewAnalyzer);

    const category = await categoriesService.create({
      code: categoryCode,
      name: `E2E Attribute Findings ${runId}`,
    });
    categoryId = category.id;

    const definitions = await attributesService.getAllDefinitions();
    const bound = definitions.find(
      (definition) => definition.code === boundCode,
    );
    if (!bound) {
      throw new Error(
        `The ${boundCode} definition is required by this suite's fixtures.`,
      );
    }
    definitionId = bound.id;
    await attributesService.assignCategoryAttribute(categoryId, {
      attributeDefinitionId: definitionId,
    });
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    // Feedback references the component with SET NULL, so it is removed by
    // component id BEFORE the components (which cascade their findings).
    for (const componentId of createdComponentIds) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.componentId, [componentId]))
        .catch(() => undefined);
    }
    for (const id of createdFindingIds) {
      await db
        .delete(componentIntelligenceFindings)
        .where(inArray(componentIntelligenceFindings.id, [id]))
        .catch(() => undefined);
    }
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (categoryId) {
      await categoriesService.delete(categoryId).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  /** A component in the fixture category whose text carries the given specs. */
  async function createComponent(suffix: string, description?: string) {
    const component = await componentsService.create({
      sku: `E2E-AF-${runId}-${suffix}`,
      name: `E2E attribute findings ${suffix} ${runId}`,
      description: description ?? null,
      unit: 'pcs',
      categoryId,
    });
    createdComponentIds.push(component.id);
    return component;
  }

  async function audit(componentId: string) {
    await analyzer.runAudit({ scope: 'SELECTED', componentIds: [componentId] });
  }

  async function findingsFor(componentId: string) {
    const result = await reviewQueue.listFindings({ componentId });
    for (const finding of result.items) {
      if (!createdFindingIds.includes(finding.id)) {
        createdFindingIds.push(finding.id);
      }
    }
    return result.items.filter(
      (finding) =>
        finding.issueCategory === 'ATTRIBUTE_VALUE' &&
        finding.source === ATTRIBUTE_SUGGESTION_SOURCE &&
        finding.metadata?.attributeDefinitionId === definitionId,
    );
  }

  it('produces a review-only finding for a bound specification with no value', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('UNKNOWN');
    await audit(component.id);

    const findings = await findingsFor(component.id);
    expect(findings).toHaveLength(1);

    const [finding] = findings;
    expect(finding!.issueType).toBe('ATTRIBUTE_VALUE_UNKNOWN');
    expect(finding!.status).toBe('PENDING');
    expect(finding!.metadata?.actionable).toBe(false);
    // Relevance is not a prediction: no value, and no confidence either.
    expect(finding!.suggestedValue).toBeNull();
    expect(finding!.confidence).toBeNull();
    expect(finding!.confidenceLevel).toBeNull();
    expect(finding!.title).toContain('expected but not recorded');
    // The component findings table has no `field` column: the reviewed field is
    // recorded in metadata, which is what the feedback ledger reads too.
    expect(finding!.metadata?.field).toBe(`attributes.${boundCode}`);
    expect(finding!.metadata?.relevance).toContain('category_binding');
  });

  it('produces an appliable finding when the text names a value', async () => {
    if (!hasDbUrl) return;

    // The value comes from an option the description names, which the local
    // relevance rules resolve without the ML container.
    const component = await createComponent('VALUED', `Finish: ${boundValue}`);
    await audit(component.id);

    const findings = await findingsFor(component.id);
    expect(findings).toHaveLength(1);

    const [finding] = findings;
    expect(finding!.issueType).toBe('ATTRIBUTE_VALUE_SUGGESTION');
    expect(finding!.metadata?.actionable).toBe(true);
    expect(finding!.suggestedValue).toMatchObject({
      display: boundValue,
      value: { value: boundValue, optionCode: boundValue },
      attributeDefinitionId: definitionId,
    });
    expect(finding!.currentValue).toMatchObject({ value: null });
  });

  it('is idempotent: re-analyzing the same component creates nothing new', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('IDEMPOTENT');
    await audit(component.id);
    const first = await findingsFor(component.id);
    expect(first).toHaveLength(1);

    await audit(component.id);
    const second = await findingsFor(component.id);

    // Same row, same identity: an audit is not a report generator.
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(first[0]!.id);
    expect(second[0]!.fingerprint).toBe(first[0]!.fingerprint);
    expect(second[0]!.status).toBe('PENDING');
  });

  it('refuses to apply a review-only finding and writes nothing', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('REFUSED');
    await audit(component.id);
    const [finding] = await findingsFor(component.id);
    expect(finding!.issueType).toBe('ATTRIBUTE_VALUE_UNKNOWN');

    await expect(
      applyService.applyFinding(finding!.id, {
        expectedFingerprint: finding!.fingerprint,
      }),
    ).rejects.toMatchObject({
      response: { reason: 'UNSUPPORTED_FINDING_TYPE' },
    });

    // The finding is untouched and the component records nothing.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.attributes?.[boundCode]).toBeUndefined();
    const [after] = await findingsFor(component.id);
    expect(after!.status).toBe('PENDING');
  });

  it('records a decision on a review-only finding in the feedback ledger', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('DECISION');
    await audit(component.id);
    const [finding] = await findingsFor(component.id);

    await reviewQueue.recordDecision(finding!.id, {
      decision: 'ACCEPTED',
      expectedFingerprint: finding!.fingerprint,
      decisionNotes: 'Recorded as outstanding work.',
    });

    // The existing ledger covers this finding kind like any other, which is what
    // makes a relevance-only decision trainable rather than a dead end.
    const rows = await db
      .select({
        suggestionType: aiSuggestionFeedback.suggestionType,
        userAction: aiSuggestionFeedback.userAction,
        field: aiSuggestionFeedback.field,
      })
      .from(aiSuggestionFeedback)
      .where(inArray(aiSuggestionFeedback.componentId, [component.id]));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      suggestionType: 'ATTRIBUTE_VALUE_UNKNOWN',
      userAction: 'ACCEPTED',
      field: `attributes.${boundCode}`,
    });

    // A decision is not an application: the component still records nothing.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.attributes?.[boundCode]).toBeUndefined();
  });

  it('retires the relevance-only finding once the value is recorded', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('RESOLVED');
    await audit(component.id);
    const [before] = await findingsFor(component.id);
    expect(before!.status).toBe('PENDING');

    // The reviewer enters the value on the component, as the finding asks.
    await attributesService.saveComponentAttributes(component.id, [
      { attributeDefinitionId: definitionId, optionCode: boundValue },
    ]);

    await audit(component.id);

    const after = await findingsFor(component.id);
    // The suggestion is now satisfied, so nothing new is raised for it and the
    // outstanding-work finding is retired rather than left to mislead.
    const stillPending = after.filter(
      (finding) => finding.status === 'PENDING',
    );
    expect(stillPending).toHaveLength(0);

    const retired = after.find((finding) => finding.id === before!.id);
    expect(retired?.status).toBe('STALE');
  });

  it('applies a valued suggestion with honest provenance and no document', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent('APPLIED', `Finish: ${boundValue}`);
    await audit(component.id);
    const [finding] = await findingsFor(component.id);
    expect(finding!.issueType).toBe('ATTRIBUTE_VALUE_SUGGESTION');

    const result = await applyService.applyFinding(finding!.id, {
      expectedFingerprint: finding!.fingerprint,
    });
    // The service throws on a refusal, so reaching here means it applied; the
    // returned value is the applied display form.
    expect(result.appliedValue).toBe(boundValue);
    expect(result.fieldLabel).toBeTruthy();

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.attributes?.[boundCode]).toMatchObject({
      optionCode: boundValue,
    });

    // Provenance names the producer that actually derived the value, and claims
    // no document: this value did not come from a datasheet.
    const values = await db.execute(
      `select provenance from component_attribute_values where component_id = '${component.id}' and attribute_definition_id = '${definitionId}'`,
    );
    const provenance = (
      values.rows?.[0] as { provenance?: Record<string, unknown> }
    )?.provenance;
    expect(provenance?.source).toBe(ATTRIBUTE_SUGGESTION_SOURCE);
    expect(provenance?.documentId).toBeUndefined();
    expect(provenance?.findingId).toBe(finding!.id);
  });
});
