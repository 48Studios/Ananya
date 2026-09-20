import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ObjectId } from '@ananya/core';
import { db, toDbExecutor, type DbExecutor } from '@ananya/database';
import {
  batches,
  billOfMaterialLines,
  componentAttributeValues,
  componentIntelligenceFindings,
  components as componentsTable,
  consolidations,
  inventoryProjections,
  inventoryReservationLines,
  inventoryTransactions,
  serials,
  type ComponentIntelligenceFinding,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { DrizzleComponentAttributeRepository } from '../../infrastructure/repositories/drizzle-attribute.repository';
import { DrizzleComponentRepository } from '../../infrastructure/repositories/drizzle-component.repository';
import { DrizzleInventoryProjectionRepository } from '../../infrastructure/repositories/drizzle-inventory-projection.repository';
import { DrizzleInventoryTransactionRepository } from '../../infrastructure/repositories/drizzle-inventory-transaction.repository';
import { DrizzleReservationRepository } from '../../infrastructure/repositories/drizzle-reservation.repository';
import { DrizzleBatchRepository } from '../../infrastructure/repositories/drizzle-batch.repository';
import { DrizzleSerialRepository } from '../../infrastructure/repositories/drizzle-serial.repository';
import { DrizzleBillOfMaterialsRepository } from '../../infrastructure/repositories/drizzle-bill-of-materials.repository';
import { ComponentConsolidationPreviewService } from '../component-consolidation-preview.service';
import { COMPONENT_REVIEW_INTELLIGENCE_VERSION } from '../component-review-analyzer';
import {
  CONSOLIDATION_PREVIEW_VERSION,
  type ConsolidationConflictDto,
} from '../component-consolidation.dtos';
import { InventoryConsolidationAdapter } from './adapters/inventory-consolidation.adapter';
import { BomConsolidationAdapter } from './adapters/bom-consolidation.adapter';
import { AttributeConsolidationAdapter } from './adapters/attribute-consolidation.adapter';
import { BatchConsolidationAdapter } from './adapters/batch-consolidation.adapter';
import { SerialConsolidationAdapter } from './adapters/serial-consolidation.adapter';
import { ReservationConsolidationAdapter } from './adapters/reservation-consolidation.adapter';
import { SupplierConsolidationAdapter } from './adapters/supplier-consolidation.adapter';
import { ProcurementConsolidationAdapter } from './adapters/procurement-consolidation.adapter';
import { PolymorphicConsolidationAdapter } from './adapters/polymorphic-consolidation.adapter';
import { FindingConsolidationAdapter } from './adapters/finding-consolidation.adapter';
import { RetirementConsolidationAdapter } from './adapters/retirement-consolidation.adapter';
import { DependencyGuardAdapter } from './adapters/dependency-guard.adapter';
import { ConsolidationLockService } from './consolidation-lock.service';
import { ConsolidationRepository } from './component-consolidation.repository';
import {
  ConsolidationAdapterBlockedError,
  ConsolidationConflictError,
  ConsolidationPlanError,
  type ConsolidationConflictReason,
} from './component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationActor,
  ConsolidationContext,
  ConsolidationPlan,
  ConsolidationSourceState,
} from './component-consolidation.types';
import type {
  ConsolidationAdapterReportDto,
  ConsolidationExecutionRequestDto,
  ConsolidationResultDto,
} from './component-consolidation.execution.dtos';

/**
 * Component consolidation execution service (Pass 6B).
 *
 * Runs the whole operation inside ONE database transaction. Every participating
 * repository is constructed with the transaction's executor, so there is no code
 * path that can accidentally write through the global client.
 *
 * The sequence is deliberate:
 *
 *  1. cheap pre-flight (confirmation flag, finding exists),
 *  2. **optimistic idempotency check** — if the source was already retired by a
 *     consolidation whose stored fingerprint matches the one the client sent,
 *     return that result instead of moving inventory a second time,
 *  3. open the transaction,
 *  4. **lock** the components, then the dependency rows, then the findings, all
 *     in deterministic id order,
 *  5. reload the components *from the transaction* and re-check the lifecycle,
 *  6. **recompute the preview inside the transaction** and compare fingerprints —
 *     a preview generated before another user changed the data must not be
 *     trusted,
 *  7. refuse if anything still blocks,
 *  8. capture pre-state,
 *  9. run the adapters in deterministic order,
 * 10. retire the sources through the domain use case,
 * 11. persist the consolidation record.
 *
 * Any failure inside the transaction rolls back every mutation. Refusals are
 * persisted in a *separate* transaction afterwards so the attempt is still
 * auditable without resurrecting partial state.
 */
@Injectable()
export class ComponentConsolidationService {
  private readonly logger = new Logger(ComponentConsolidationService.name);

  constructor(
    private readonly previewService: ComponentConsolidationPreviewService,
    private readonly locks: ConsolidationLockService,
    private readonly records: ConsolidationRepository,
  ) {}

  async consolidate(
    findingId: string,
    request: ConsolidationExecutionRequestDto,
    actor: ConsolidationActor | undefined = {},
  ): Promise<ConsolidationResultDto> {
    const reviewer: ConsolidationActor = actor ?? {};
    if (request.confirmation !== true) {
      throw new ConsolidationConflictError(
        'CONFIRMATION_REQUIRED',
        'Consolidation must be explicitly confirmed. Send confirmation: true after the reviewer has seen the final confirmation step.',
      );
    }

    const finding = await this.loadFinding(findingId);

    if (finding.issueCategory !== 'DUPLICATE') {
      throw new ConsolidationConflictError(
        'FINDING_NOT_DUPLICATE',
        `Finding ${findingId} is a ${finding.issueCategory} finding. Only duplicate findings can be consolidated.`,
      );
    }

    const canonicalComponentId = this.resolveCanonicalId(finding, request);
    const sourceComponentIds = this.resolveSourceIds(
      finding,
      canonicalComponentId,
      request,
    );

    const plan: ConsolidationPlan = {
      findingId,
      canonicalComponentId,
      sourceComponentIds,
      attributeResolutions: request.attributeResolutions ?? [],
      bomResolutions: request.bomResolutions ?? [],
      decisionNotes: request.decisionNotes ?? null,
    };

    // ---------------------------------------------------------------------
    // Idempotency: an identical retry must return the original operation.
    // ---------------------------------------------------------------------
    for (const sourceComponentId of sourceComponentIds) {
      const existing = await this.records.findBySourceComponentId(
        db,
        sourceComponentId,
      );
      if (!existing) continue;

      const isReplay =
        existing.canonicalComponentId === canonicalComponentId &&
        (await this.fingerprintMatches(
          existing.consolidationId,
          request.expectedPreviewFingerprint,
        ));

      if (isReplay) {
        return this.buildReplayResult(
          existing.consolidationId,
          plan,
          request.expectedPreviewFingerprint,
        );
      }

      throw new ConsolidationConflictError(
        'SOURCE_ALREADY_CONSOLIDATED',
        `Component ${sourceComponentId} was already consolidated into ${existing.canonicalComponentId} by consolidation ${existing.consolidationId}. Re-running it would move inventory a second time.`,
      );
    }

    const consolidationId = ObjectId.generate().value;
    const correlation = { consolidationId, findingId };

    try {
      return await db.transaction(async (tx) => {
        const executor = toDbExecutor(tx);
        return this.runInTransaction({
          executor,
          consolidationId,
          finding,
          plan,
          actor: reviewer,
          expectedPreviewFingerprint: request.expectedPreviewFingerprint,
        });
      });
    } catch (error) {
      await this.recordFailure(error, consolidationId, plan, reviewer, request);
      throw error;
    } finally {
      this.logger.debug(
        `Consolidation ${consolidationId} for finding ${correlation.findingId} finished.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Transaction body
  // -------------------------------------------------------------------------

  private async runInTransaction(input: {
    executor: DbExecutor;
    consolidationId: string;
    finding: ComponentIntelligenceFinding;
    plan: ConsolidationPlan;
    actor: ConsolidationActor;
    expectedPreviewFingerprint: string;
  }): Promise<ConsolidationResultDto> {
    const {
      executor,
      consolidationId,
      plan,
      actor,
      expectedPreviewFingerprint,
    } = input;

    // 1. Lock, in the documented order.
    const allComponentIds = [
      plan.canonicalComponentId,
      ...plan.sourceComponentIds,
    ];
    await this.locks.lockComponents(executor, allComponentIds);
    await this.locks.lockDependencies(executor, allComponentIds);
    await this.locks.lockFindings(executor, plan.findingId, allComponentIds);

    // 2. Re-read the components through the transaction and re-check the
    //    lifecycle. The pre-flight read was only a hint.
    const componentRepository = new DrizzleComponentRepository(executor);
    const canonical = await componentRepository.findById(
      plan.canonicalComponentId,
    );
    if (!canonical) {
      throw new ConsolidationConflictError(
        'COMPONENT_NOT_FOUND',
        `Canonical component ${plan.canonicalComponentId} no longer exists.`,
      );
    }

    const sources = [];
    for (const sourceId of plan.sourceComponentIds) {
      const source = await componentRepository.findById(sourceId);
      if (!source) {
        throw new ConsolidationConflictError(
          'COMPONENT_NOT_FOUND',
          `Source component ${sourceId} no longer exists.`,
        );
      }
      sources.push(source);
    }

    // 3. Recompute the preview from the locked snapshot and verify the
    //    fingerprint the reviewer approved.
    const preview = await this.previewService.buildPreview(
      plan.findingId,
      plan.canonicalComponentId,
      executor,
      {
        attributeResolutions: plan.attributeResolutions.map((resolution) => ({
          attributeDefinitionId: resolution.attributeDefinitionId,
          strategy: resolution.strategy,
        })),
        bomResolutions: plan.bomResolutions.map((resolution) => ({
          bomId: resolution.bomId,
        })),
      },
    );

    if (preview.previewFingerprint !== expectedPreviewFingerprint) {
      throw new ConsolidationConflictError(
        'FINGERPRINT_MISMATCH',
        this.describeMismatch(preview),
        preview.executionBlockedReasons,
      );
    }

    if (!preview.executable) {
      throw new ConsolidationConflictError(
        'BLOCKING_CONFLICTS',
        `Consolidation is still blocked by ${preview.executionBlockedReasons.length} conflict(s). Resolve them and generate a new preview.`,
        preview.executionBlockedReasons,
      );
    }

    // 4. Capture pre-state before anything moves.
    const preStateByComponentId = new Map<string, ConsolidationSourceState>();
    for (const source of sources) {
      preStateByComponentId.set(
        source.id,
        await this.captureSourceState(executor, source),
      );
    }

    // 5. Insert the operation record BEFORE the adapters run. Retiring a source
    //    writes `components.consolidation_id`, which is a foreign key to this
    //    table, so the header has to exist first. It is inserted inside this
    //    transaction, so a later failure removes it again.
    await this.records.persistHeader(executor, {
      consolidationId,
      canonicalComponentId: canonical.id,
      findingId: plan.findingId,
      previewFingerprint: expectedPreviewFingerprint,
      previewVersion: CONSOLIDATION_PREVIEW_VERSION,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      plan,
      actor,
    });

    // 6. Adapters, in deterministic order, all sharing this transaction.
    const adapters = this.buildAdapters(executor);
    const context: ConsolidationContext = {
      executor,
      consolidationId,
      canonical,
      sources,
      plan,
      actor,
      previewFingerprint: expectedPreviewFingerprint,
    };

    const reports: ConsolidationAdapterReportDto[] = [];
    const warnings: string[] = [];
    const outcomes: Array<{
      adapterId: string;
      outcome: ConsolidationAdapterOutcome;
    }> = [];

    for (const adapter of adapters) {
      const outcome = await adapter.apply(context);
      outcomes.push({ adapterId: adapter.id, outcome });
      reports.push({
        adapterId: adapter.id,
        label: adapter.label,
        entity: outcome.entity,
        action: outcome.action,
        migratedCount: outcome.migratedCount,
        details: outcome.details,
        warnings: outcome.warnings,
      });
      warnings.push(...outcome.warnings);
    }

    // 7. Finalize the operation record: what each adapter did, the warnings, and
    //    the pre/post state of every retired source.
    const completedAt = new Date();
    const postStateByComponentId = new Map<string, Record<string, unknown>>();
    for (const source of sources) {
      const reread = await componentRepository.findById(source.id);
      postStateByComponentId.set(source.id, {
        isActive: reread?.isActive ?? false,
        consolidatedIntoComponentId:
          reread?.consolidatedIntoComponentId ?? canonical.id,
        consolidationId,
        consolidatedAt: reread?.consolidatedAt?.toISOString() ?? null,
      });
    }

    await this.records.finalize(executor, {
      consolidationId,
      results: outcomes,
      warnings,
      preStateByComponentId,
      postStateByComponentId,
      completedAt,
    });

    const finalSources = [];
    for (const sourceId of plan.sourceComponentIds) {
      const reread = await componentRepository.findById(sourceId);
      finalSources.push({
        id: sourceId,
        sku: reread?.sku ?? '',
        name: reread?.name ?? '',
        isActive: reread?.isActive ?? false,
        consolidatedIntoComponentId:
          reread?.consolidatedIntoComponentId ?? canonical.id,
        consolidatedAt:
          reread?.consolidatedAt?.toISOString() ?? completedAt.toISOString(),
      });
    }

    return {
      consolidationId,
      status: 'COMPLETED',
      idempotentReplay: false,
      findingId: plan.findingId,
      canonical: {
        id: canonical.id,
        sku: canonical.sku,
        name: canonical.name,
        isActive: canonical.isActive,
      },
      sources: finalSources,
      previewFingerprint: expectedPreviewFingerprint,
      adapters: reports,
      warnings,
      completedAt: completedAt.toISOString(),
    };
  }

  /**
   * The adapter list, in execution order.
   *
   * `order` is the contract: the guard runs before any write, inventory moves
   * before reservations are checked against post-move balances, BOM and
   * attributes are reconciled after inventory, and retirement happens last so
   * every migration sees an active source.
   */
  private buildAdapters(executor: DbExecutor): ConsolidationAdapter[] {
    const componentRepository = new DrizzleComponentRepository(executor);
    const transactions = new DrizzleInventoryTransactionRepository(executor);
    const projections = new DrizzleInventoryProjectionRepository(executor);
    const reservations = new DrizzleReservationRepository(executor);
    const batches = new DrizzleBatchRepository(executor);
    const serials = new DrizzleSerialRepository(executor);
    const attributes = new DrizzleComponentAttributeRepository(executor);
    const boms = new DrizzleBillOfMaterialsRepository(executor);

    return [
      new DependencyGuardAdapter(),
      new InventoryConsolidationAdapter(transactions, projections),
      new AttributeConsolidationAdapter(attributes),
      new BomConsolidationAdapter(boms),
      new SupplierConsolidationAdapter(),
      new ProcurementConsolidationAdapter(),
      new BatchConsolidationAdapter(batches),
      new SerialConsolidationAdapter(serials),
      new ReservationConsolidationAdapter(reservations, projections),
      new PolymorphicConsolidationAdapter(),
      new FindingConsolidationAdapter(),
      new RetirementConsolidationAdapter(componentRepository),
    ].sort((left, right) =>
      left.order === right.order
        ? left.id.localeCompare(right.id)
        : left.order - right.order,
    );
  }

  /**
   * Explains a fingerprint mismatch using the CURRENT authoritative state.
   *
   * The approved payload cannot be recovered from its hash, so the message
   * reports what is true now rather than guessing at what changed. It
   * deliberately does not claim "the components changed": the fingerprint also
   * covers the finding's lifecycle, and a reviewer recording a decision changes
   * that without touching a component. Blaming the components sent reviewers
   * looking in the wrong place.
   */
  private describeMismatch(preview: {
    history: { findingStatus: string };
    eligibility: { eligible: boolean; reasonCodes: string[] };
    executionBlockedReasons: Array<{ code: string }>;
  }): string {
    const causes: string[] = [];

    if (
      preview.history.findingStatus !== 'PENDING' &&
      preview.history.findingStatus !== 'ACCEPTED'
    ) {
      causes.push(
        `the review finding is now ${preview.history.findingStatus}, and consolidation only runs from PENDING or ACCEPTED`,
      );
    }

    const otherReasons = preview.eligibility.reasonCodes.filter(
      (code) => code !== 'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );
    if (otherReasons.length > 0) {
      causes.push(`it is no longer eligible (${otherReasons.join(', ')})`);
    }

    if (preview.executionBlockedReasons.length > 0) {
      causes.push(
        `it is now blocked by ${preview.executionBlockedReasons
          .map((reason) => reason.code)
          .join(', ')}`,
      );
    }

    const detail =
      causes.length > 0
        ? ` Current state: ${causes.join('; ')}.`
        : ' The component, dependency, inventory or attribute state it described has changed.';

    return `The state this preview described has changed since it was approved, so the analysis no longer applies.${detail} Refresh the preview and review the current state before consolidating.`;
  }

  /** Snapshot of everything consolidation is about to touch for one source. */
  private async captureSourceState(
    executor: DbExecutor,
    source: {
      id: string;
      sku: string;
      name: string;
      isActive: boolean;
      unit: string;
      manufacturerId?: string | null;
      categoryId?: string | null;
    },
  ): Promise<ConsolidationSourceState> {
    const projectionRows = await executor
      .select({
        locationId: inventoryProjections.locationId,
        quantity: inventoryProjections.quantity,
        unitOfMeasure: inventoryProjections.unitOfMeasure,
      })
      .from(inventoryProjections)
      .where(eq(inventoryProjections.componentId, source.id));

    const count = async (
      table:
        | typeof inventoryTransactions
        | typeof batches
        | typeof serials
        | typeof inventoryReservationLines
        | typeof billOfMaterialLines
        | typeof componentAttributeValues,
    ): Promise<number> => {
      const rows = await executor
        .select({ id: table.id })
        .from(table)
        .where(eq(table.componentId, source.id));
      return rows.length;
    };

    return {
      componentId: source.id,
      sku: source.sku,
      name: source.name,
      isActive: source.isActive,
      unit: source.unit,
      manufacturerId: source.manufacturerId ?? null,
      categoryId: source.categoryId ?? null,
      inventoryByLocation: projectionRows.map((row) => ({
        locationId: row.locationId,
        quantity: row.quantity,
        unitOfMeasure: row.unitOfMeasure,
      })),
      ledgerTransactionCount: await count(inventoryTransactions),
      attributeValueCount: await count(componentAttributeValues),
      batchCount: await count(batches),
      serialCount: await count(serials),
      reservationLineCount: await count(inventoryReservationLines),
      bomLineCount: await count(billOfMaterialLines),
      documentCount: 0,
      favoriteCount: 0,
      supplierMappingCount: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Pre-flight helpers
  // -------------------------------------------------------------------------

  private async loadFinding(
    findingId: string,
  ): Promise<ComponentIntelligenceFinding> {
    const [finding] = await db
      .select()
      .from(componentIntelligenceFindings)
      .where(eq(componentIntelligenceFindings.id, findingId))
      .limit(1);

    if (!finding) {
      throw new NotFoundException(
        `Component review finding '${findingId}' not found`,
      );
    }

    return finding;
  }

  /**
   * The canonical component is resolved by the backend from the finding. A
   * client-supplied id is only honoured when it names one of the finding's own
   * two components, so the endpoint cannot be used to retire arbitrary records.
   */
  private resolveCanonicalId(
    finding: ComponentIntelligenceFinding,
    request: ConsolidationExecutionRequestDto,
  ): string {
    const pair = [finding.componentId, finding.relatedComponentId].filter(
      (id): id is string => Boolean(id),
    );

    if (pair.length !== 2) {
      throw new ConsolidationConflictError(
        'COMPONENT_NOT_IN_FINDING',
        'This finding does not reference two existing components, so there is nothing to consolidate.',
      );
    }

    if (!request.canonicalComponentId) {
      throw new ConsolidationPlanError(
        'canonicalComponentId is required. Consolidation never proceeds on an implicit direction; the reviewer must choose which record survives.',
        'canonicalComponentId',
      );
    }

    if (!pair.includes(request.canonicalComponentId)) {
      throw new ConsolidationConflictError(
        'COMPONENT_NOT_IN_FINDING',
        `Component ${request.canonicalComponentId} is not part of finding ${finding.id}. Consolidation may only operate on the finding's own pair.`,
      );
    }

    return request.canonicalComponentId;
  }

  private resolveSourceIds(
    finding: ComponentIntelligenceFinding,
    canonicalComponentId: string,
    request: ConsolidationExecutionRequestDto,
  ): string[] {
    const pair = [finding.componentId, finding.relatedComponentId].filter(
      (id): id is string => Boolean(id),
    );

    const derived = pair.filter((id) => id !== canonicalComponentId);

    const requested = [...new Set(request.sourceComponentIds ?? [])].sort();
    if (requested.length > 0) {
      const outside = requested.filter((id) => !pair.includes(id));
      if (outside.length > 0) {
        throw new ConsolidationConflictError(
          'COMPONENT_NOT_IN_FINDING',
          `Source component(s) ${outside.join(', ')} are not part of finding ${finding.id}.`,
        );
      }
      if (requested.includes(canonicalComponentId)) {
        throw new ConsolidationConflictError(
          'SELF_CONSOLIDATION',
          'The canonical component cannot also be a source.',
        );
      }
      if (requested.length !== derived.length) {
        throw new ConsolidationPlanError(
          'Every component in the finding other than the canonical must be listed as a source.',
          'sourceComponentIds',
        );
      }
      return requested;
    }

    return derived.sort();
  }

  private async fingerprintMatches(
    consolidationId: string,
    expected: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ fingerprint: consolidations.previewFingerprint })
      .from(consolidations)
      .where(eq(consolidations.id, consolidationId))
      .limit(1);
    return row?.fingerprint === expected;
  }

  private async buildReplayResult(
    consolidationId: string,
    plan: ConsolidationPlan,
    fingerprint: string,
  ): Promise<ConsolidationResultDto> {
    const rows = await db
      .select()
      .from(componentsTable)
      .where(eq(componentsTable.id, plan.canonicalComponentId))
      .limit(1);
    const canonical = rows[0];

    const replaySources = [];
    for (const sourceId of plan.sourceComponentIds) {
      const [source] = await db
        .select()
        .from(componentsTable)
        .where(eq(componentsTable.id, sourceId))
        .limit(1);
      if (!source) continue;
      replaySources.push({
        id: source.id,
        sku: source.sku,
        name: source.name,
        isActive: source.isActive,
        consolidatedIntoComponentId:
          source.consolidatedIntoComponentId ?? plan.canonicalComponentId,
        consolidatedAt: (source.consolidatedAt ?? new Date()).toISOString(),
      });
    }

    return {
      consolidationId,
      status: 'COMPLETED',
      idempotentReplay: true,
      findingId: plan.findingId,
      canonical: {
        id: canonical?.id ?? plan.canonicalComponentId,
        sku: canonical?.sku ?? '',
        name: canonical?.name ?? '',
        isActive: canonical?.isActive ?? true,
      },
      sources: replaySources,
      previewFingerprint: fingerprint,
      adapters: [],
      warnings: [
        'This request had already been applied. The existing consolidation result was returned and no inventory was moved again.',
      ],
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Persists a refused attempt in its own transaction.
   *
   * Deliberately swallows its own errors: a failure to write bookkeeping must
   * never mask the original refusal, which is the information the caller needs.
   */
  private async recordFailure(
    error: unknown,
    consolidationId: string,
    plan: ConsolidationPlan,
    actor: ConsolidationActor,
    request: ConsolidationExecutionRequestDto,
  ): Promise<void> {
    const reason =
      error instanceof ConsolidationConflictError
        ? `${error.reason}: ${error.message}`
        : error instanceof ConsolidationAdapterBlockedError
          ? `ADAPTER_BLOCKED(${error.adapterId}): ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unknown failure';

    try {
      await this.records.recordFailure(db, {
        consolidationId,
        canonicalComponentId: plan.canonicalComponentId,
        findingId: plan.findingId,
        previewFingerprint: request.expectedPreviewFingerprint ?? 'unknown',
        previewVersion: CONSOLIDATION_PREVIEW_VERSION,
        reason,
        actor,
        plan,
      });
    } catch (bookkeepingError) {
      this.logger.warn(
        `Could not record failed consolidation ${consolidationId}: ${
          bookkeepingError instanceof Error
            ? bookkeepingError.message
            : String(bookkeepingError)
        }`,
      );
    }
  }
}

/** Conflict codes surfaced through `executionBlockedReasons`. */
export type ExecutionBlockedReason = Pick<
  ConsolidationConflictDto,
  'code' | 'title' | 'description'
>;

/** Reasons that are always refusals, never warnings. */
export const HARD_REFUSAL_REASONS: readonly ConsolidationConflictReason[] = [
  'FINDING_NOT_FOUND',
  'FINDING_NOT_DUPLICATE',
  'COMPONENT_NOT_IN_FINDING',
  'SELF_CONSOLIDATION',
  'CONFIRMATION_REQUIRED',
];
