import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { db } from '@ananya/database';
import {
  aiSuggestionFeedback,
  categories,
  componentIntelligenceFindings,
  components,
  manufacturers,
  type ComponentIntelligenceFinding,
} from '@ananya/database/schema';
import { and, eq, sql } from '@ananya/database/query';
import { UpdateComponent, type UpdateComponentInput } from '@ananya/inventory';
import { DrizzleComponentRepository } from '../infrastructure/repositories/drizzle-component.repository';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { DataPacksService } from '../data-packs/data-packs.service';
import { ComponentReviewQueueService } from './component-review-queue.service';
import {
  isEngineeringMeasurement,
  isPackageCode,
  isPlaceholderMpn,
  MIN_MPN_LENGTH,
  normalizeMpn,
} from './component-review-analyzer';
import {
  resolveApplyRule,
  type ApplicableComponentField,
  type ApplyComponentFindingResult,
  type ApplyConflictReason,
  type ComponentApplyRule,
} from './component-review-apply.dtos';

export interface ApplyReviewerContext {
  id?: string;
  email?: string;
}

export interface ApplyComponentFindingInput {
  expectedFingerprint: string;
  decisionNotes?: string;
}

/** Transaction handle type, inferred from the Drizzle client itself. */
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Persisted component row, used for type-safe field comparison. */
type ComponentRow = typeof components.$inferSelect;

/**
 * Raised when an application request is refused for a state reason.
 *
 * The body carries a machine-readable `reason` so the client can react without
 * parsing prose. Nothing is mutated when this is thrown; thrown inside the
 * transaction, it rolls the whole transaction back.
 */
export class FindingApplyConflictError extends ConflictException {
  constructor(
    public readonly reason: ApplyConflictReason,
    message: string,
  ) {
    super({ statusCode: 409, reason, message });
  }
}

export type SuggestedMpnValidation =
  { ok: true; value: string } | { ok: false; message: string };

/**
 * Validates a suggested manufacturer part number before it may be written.
 *
 * Reuses the analyzer's normalization and guards so a value that would not have
 * been generated as an MPN can never be applied: placeholders, footprint codes,
 * engineering measurements (`125mW`), values shorter than a real identifier,
 * and the component's own internal SKU are all refused.
 */
export function validateSuggestedMpn(input: {
  raw: unknown;
  componentSku: string;
  packagePatterns: readonly string[];
}): SuggestedMpnValidation {
  if (typeof input.raw !== 'string' || input.raw.trim().length === 0) {
    return {
      ok: false,
      message: 'The suggested manufacturer part number is empty or missing.',
    };
  }

  const normalized = normalizeMpn(input.raw);
  if (!normalized || normalized.length < MIN_MPN_LENGTH) {
    return {
      ok: false,
      message: `The suggested manufacturer part number "${input.raw}" is too short to be a valid identifier.`,
    };
  }

  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
    return {
      ok: false,
      message: `The suggested manufacturer part number "${input.raw}" must contain both letters and digits.`,
    };
  }

  if (isPlaceholderMpn(normalized)) {
    return {
      ok: false,
      message: `"${input.raw}" is a placeholder value, not a manufacturer part number.`,
    };
  }

  if (isPackageCode(normalized, input.packagePatterns)) {
    return {
      ok: false,
      message: `"${input.raw}" is a package or footprint code, not a manufacturer part number.`,
    };
  }

  if (isEngineeringMeasurement(normalized, input.packagePatterns)) {
    return {
      ok: false,
      message: `"${input.raw}" is an engineering measurement, not a manufacturer part number.`,
    };
  }

  if (normalized === normalizeMpn(input.componentSku)) {
    return {
      ok: false,
      message:
        "The suggested value is the component's internal SKU, not a manufacturer part number.",
    };
  }

  return { ok: true, value: input.raw.trim() };
}

/**
 * Builds the domain update input for exactly one allowed field.
 *
 * The field is chosen by the backend's finding-type mapping, never by the
 * client, so the queue cannot be used as a generic write API.
 */
export function buildComponentPatch(
  field: ApplicableComponentField,
  value: string | null,
): UpdateComponentInput {
  switch (field) {
    case 'manufacturerPartNumber':
      return { manufacturerPartNumber: value };
    case 'manufacturerId':
      return { manufacturerId: value };
    case 'categoryId':
      return { categoryId: value };
  }
}

interface EntityLookupRow {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * Normalizes a comparable component field value.
 *
 * Only scalar column values participate; anything else is treated as absent so a
 * non-scalar can never silently compare equal to a real value.
 */
function normalizeComparableValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Applies accepted Component Intelligence findings to components.
 *
 * This is the only part of the review queue that writes component data, and it
 * goes through the normal domain path: the `UpdateComponent` use case from
 * `@ananya/inventory` operating on the standard `DrizzleComponentRepository`,
 * with the `Component` aggregate enforcing its invariants. The repository is
 * bound to a transaction handle so the component mutation, the finding
 * transition, and the feedback row commit atomically.
 */
@Injectable()
export class ComponentReviewApplyService {
  private readonly logger = new Logger(ComponentReviewApplyService.name);

  constructor(
    private readonly reviewQueue: ComponentReviewQueueService,
    private readonly securityAudit: SecurityAuditService,
    @Optional() private readonly dataPacksService?: DataPacksService,
  ) {}

  async applyFinding(
    id: string,
    input: ApplyComponentFindingInput,
    reviewer?: ApplyReviewerContext,
  ): Promise<ApplyComponentFindingResult> {
    const [preflight] = await db
      .select()
      .from(componentIntelligenceFindings)
      .where(eq(componentIntelligenceFindings.id, id))
      .limit(1);

    if (!preflight) {
      throw new NotFoundException(`Component review finding '${id}' not found`);
    }

    const rule = resolveApplyRule(preflight.issueType);
    if (!rule) {
      throw new FindingApplyConflictError(
        'UNSUPPORTED_FINDING_TYPE',
        `Findings of type '${preflight.issueType}' cannot be applied. Duplicate findings are review-only.`,
      );
    }

    const packagePatterns = await this.loadPackagePatterns();

    const result = await db.transaction(async (tx) => {
      // 1. Lock the finding so a concurrent apply cannot interleave.
      const [finding] = await tx
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, id))
        .limit(1)
        .for('update');

      if (!finding) {
        throw new NotFoundException(
          `Component review finding '${id}' not found`,
        );
      }

      // 2. Only a pending finding can be applied.
      if (finding.status !== 'PENDING') {
        throw new FindingApplyConflictError(
          'FINDING_NOT_PENDING',
          finding.status === 'STALE'
            ? `This finding is stale (${this.describeStaleReason(finding)}). Re-run component analysis to refresh it before applying.`
            : `This finding is already ${finding.status.toLowerCase()} and cannot be applied.`,
        );
      }

      // 3. Revision proof.
      if (input.expectedFingerprint !== finding.fingerprint) {
        throw new FindingApplyConflictError(
          'FINGERPRINT_MISMATCH',
          'This finding changed since it was loaded. Refresh the queue and review it again.',
        );
      }

      // 4. Lock the component.
      const [componentRow] = await tx
        .select()
        .from(components)
        .where(eq(components.id, finding.componentId))
        .limit(1)
        .for('update');

      if (!componentRow) {
        throw new FindingApplyConflictError(
          'COMPONENT_CHANGED',
          'The component no longer exists. The suggestion was not applied.',
        );
      }

      // 5. The component must still be the revision the finding was built from.
      const snapshot = finding.metadata?.componentUpdatedAt;
      if (
        typeof snapshot === 'string' &&
        snapshot.length > 0 &&
        new Date(snapshot).toISOString() !==
          componentRow.updatedAt.toISOString()
      ) {
        const reason = 'The component changed after this finding was generated';
        // The staleness record is bookkeeping that must outlive this refused
        // attempt, so it is written in the transaction and the conflict is
        // raised after it commits rather than rolling it back.
        await this.markStaleWithinTransaction(tx, finding.id, reason);
        return {
          applied: false as const,
          reason: 'COMPONENT_CHANGED' as ApplyConflictReason,
          message: `${reason}. The suggestion was not applied — re-run component analysis to refresh it.`,
        };
      }

      // 6. The specific field must still hold the value the finding described.
      this.assertCurrentValueUnchanged(finding, componentRow, rule);

      // 7. The suggested target must be valid and authoritative.
      const resolved = await this.resolveTargetValue(
        tx,
        finding,
        componentRow,
        rule,
        packagePatterns,
      );

      // 8. Transition the finding first, guarded on PENDING. If a concurrent
      //    reviewer won the race, no component write happens.
      const reviewedAt = new Date();
      const metadataPatch = JSON.stringify({
        decision: 'ACCEPTED',
        applied: true,
        action: 'APPLIED',
        appliedField: rule.field,
        previousValue: resolved.previousValue,
        appliedValue: resolved.value,
        decisionNotes: input.decisionNotes ?? null,
        fingerprint: finding.fingerprint,
        applicationResult: 'APPLIED',
      });

      const acceptedRows = await tx
        .update(componentIntelligenceFindings)
        .set({
          status: 'ACCEPTED',
          reviewerId: reviewer?.id ?? null,
          reviewerEmail: reviewer?.email ?? null,
          reviewedAt,
          decisionNotes: input.decisionNotes ?? null,
          updatedAt: reviewedAt,
          metadata: sql`coalesce(${componentIntelligenceFindings.metadata}, '{}'::jsonb) || ${metadataPatch}::jsonb`,
        })
        .where(
          and(
            eq(componentIntelligenceFindings.id, finding.id),
            eq(componentIntelligenceFindings.status, 'PENDING'),
          ),
        )
        .returning({ id: componentIntelligenceFindings.id });

      if (acceptedRows.length === 0) {
        throw new FindingApplyConflictError(
          'FINDING_NOT_PENDING',
          'This finding was decided by another reviewer. Refresh the queue to see the current state.',
        );
      }

      // 9. Component mutation through the normal domain path, bound to this tx.
      const repository = new DrizzleComponentRepository(
        tx as unknown as ConstructorParameters<
          typeof DrizzleComponentRepository
        >[0],
      );
      const updatedComponent = await new UpdateComponent(repository).execute(
        finding.componentId,
        buildComponentPatch(rule.field, resolved.value),
      );

      // 10. Feedback telemetry, in the same transaction.
      await tx.insert(aiSuggestionFeedback).values({
        componentId: finding.componentId,
        suggestionType: finding.issueType,
        field: rule.field,
        predictedValue: finding.suggestedValue ?? null,
        confidence: finding.confidence,
        confidenceLevel: finding.confidenceLevel ?? 'MEDIUM',
        evidence: finding.evidence ?? [],
        modelVersion: finding.modelVersion ?? '1.0.0',
        // The feedback ledger only models ACCEPTED | REJECTED | EDITED, so an
        // application is recorded as ACCEPTED with the mutation facts carried
        // in metadata rather than widening the global action vocabulary.
        userAction: 'ACCEPTED',
        finalValue: { [rule.field]: resolved.value },
        reviewerId: reviewer?.id ?? null,
        reviewerEmail: reviewer?.email ?? null,
        metadata: {
          findingId: finding.id,
          issueType: finding.issueType,
          issueCategory: finding.issueCategory,
          action: 'APPLIED',
          applied: true,
          applicationResult: 'APPLIED',
          field: rule.field,
          previousValue: resolved.previousValue,
          appliedValue: resolved.value,
          appliedValueLabel: resolved.valueLabel,
          fingerprint: finding.fingerprint,
          intelligenceVersion: finding.intelligenceVersion ?? null,
          decisionNotes: input.decisionNotes ?? null,
        },
      });

      return {
        applied: true as const,
        outcome: {
          findingId: finding.id,
          componentId: finding.componentId,
          issueType: finding.issueType,
          field: rule.field,
          fieldLabel: rule.label,
          previousValue: resolved.previousValue,
          appliedValue: resolved.value,
          appliedValueLabel: resolved.valueLabel,
          fingerprint: finding.fingerprint,
          appliedAt: reviewedAt.toISOString(),
          reviewerId: reviewer?.id ?? null,
          reviewerEmail: reviewer?.email ?? null,
          component: {
            id: updatedComponent.id,
            sku: updatedComponent.sku,
            name: updatedComponent.name,
            manufacturerPartNumber:
              updatedComponent.manufacturerPartNumber ?? null,
            manufacturerId: updatedComponent.manufacturerId ?? null,
            categoryId: updatedComponent.categoryId ?? null,
            updatedAt: updatedComponent.updatedAt.toISOString(),
          },
        },
      };
    });

    // The staleness marking committed with the transaction above, so the
    // conflict is raised only after that bookkeeping is durable.
    if (!result.applied) {
      throw new FindingApplyConflictError(result.reason, result.message);
    }

    const outcome = result.outcome;
    const staledFindingCount = await this.reconcileSiblingFindings(outcome);
    await this.recordAuditEvent(outcome, reviewer);

    this.logger.log(
      `Applied finding ${outcome.findingId} (${outcome.issueType}) to component ${outcome.component.sku}: set ${outcome.field}.`,
    );

    return { ...outcome, staledFindingCount };
  }

  /**
   * Marks other pending findings for the same component stale.
   *
   * The component was just modified, so every sibling finding was generated
   * against an older revision and is stale by the established snapshot rule.
   * This reuses the queue's existing staleness mechanism, which only affects
   * PENDING rows — the finding applied above is ACCEPTED and is left untouched.
   */
  private async reconcileSiblingFindings(
    outcome: Omit<ApplyComponentFindingResult, 'staledFindingCount'>,
  ): Promise<number> {
    try {
      const reconciled = await this.reviewQueue.markFindingsStale({
        componentId: outcome.componentId,
        reason: `Component updated by applying finding ${outcome.findingId}`,
      });
      return reconciled.staledCount;
    } catch (error) {
      // Safety is preserved regardless: a pending finding for a changed
      // component is still refused at apply time by the staleness guard.
      this.logger.warn(
        `Failed to reconcile sibling findings for component ${outcome.componentId}: ${String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Verifies the component field still holds the value the finding described, so
   * an application can never silently overwrite a newer manual edit.
   */
  private assertCurrentValueUnchanged(
    finding: ComponentIntelligenceFinding,
    componentRow: ComponentRow,
    rule: ComponentApplyRule,
  ): void {
    const currentValue = finding.currentValue;
    if (!currentValue || !(rule.field in currentValue)) return;

    if (
      normalizeComparableValue(currentValue[rule.field]) !==
      normalizeComparableValue(componentRow[rule.field])
    ) {
      throw new FindingApplyConflictError(
        'COMPONENT_CHANGED',
        `The component's ${rule.label} changed after this finding was generated. The suggestion was not applied.`,
      );
    }
  }

  /**
   * Resolves and validates the value to write. Manufacturer/category targets
   * must be existing, active ERP rows: nothing is created during review, and a
   * free-form name is never accepted.
   */
  private async resolveTargetValue(
    tx: TransactionClient,
    finding: ComponentIntelligenceFinding,
    componentRow: ComponentRow,
    rule: ComponentApplyRule,
    packagePatterns: readonly string[],
  ): Promise<{
    value: string;
    valueLabel: string;
    previousValue: string | null;
  }> {
    const suggested = finding.suggestedValue ?? {};
    const previousValue = normalizeComparableValue(componentRow[rule.field]);

    if (rule.kind === 'mpn') {
      const validation = validateSuggestedMpn({
        raw: suggested.manufacturerPartNumber,
        componentSku: componentRow.sku ?? '',
        packagePatterns,
      });
      if (!validation.ok) {
        throw new FindingApplyConflictError(
          'INVALID_SUGGESTED_VALUE',
          validation.message,
        );
      }
      return {
        value: validation.value,
        valueLabel: validation.value,
        previousValue,
      };
    }

    const entityId = suggested[rule.field];
    if (typeof entityId !== 'string' || entityId.trim().length === 0) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        `This finding does not carry an existing ERP ${rule.label.toLowerCase()} identifier, so it cannot be applied.`,
      );
    }

    const entity = await this.findEntity(tx, rule, entityId);

    if (!entity) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_NOT_FOUND',
        `The suggested ${rule.label.toLowerCase()} no longer exists in the ERP. The suggestion was not applied.`,
      );
    }

    if (!entity.isActive) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_INACTIVE',
        `The suggested ${rule.label.toLowerCase()} "${entity.name}" is inactive and cannot be assigned.`,
      );
    }

    return {
      value: entity.id,
      valueLabel: entity.name,
      previousValue,
    };
  }

  /** Read-only lookup of the authoritative manufacturer/category row. */
  private async findEntity(
    tx: TransactionClient,
    rule: ComponentApplyRule,
    id: string,
  ): Promise<EntityLookupRow | null> {
    if (rule.entity === 'manufacturer') {
      const [row] = await tx
        .select({
          id: manufacturers.id,
          name: manufacturers.name,
          isActive: manufacturers.isActive,
        })
        .from(manufacturers)
        .where(eq(manufacturers.id, id))
        .limit(1);
      return row ?? null;
    }

    const [row] = await tx
      .select({
        id: categories.id,
        name: categories.name,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Marks a single finding stale inside the caller's transaction. */
  private async markStaleWithinTransaction(
    tx: TransactionClient,
    findingId: string,
    reason: string,
  ): Promise<void> {
    const patch = JSON.stringify({
      staleReason: reason,
      staledAt: new Date().toISOString(),
    });
    await tx
      .update(componentIntelligenceFindings)
      .set({
        status: 'STALE',
        updatedAt: new Date(),
        metadata: sql`coalesce(${componentIntelligenceFindings.metadata}, '{}'::jsonb) || ${patch}::jsonb`,
      })
      .where(
        and(
          eq(componentIntelligenceFindings.id, findingId),
          eq(componentIntelligenceFindings.status, 'PENDING'),
        ),
      );
  }

  private describeStaleReason(finding: ComponentIntelligenceFinding): string {
    const reason = finding.metadata?.staleReason;
    return typeof reason === 'string' && reason.length > 0
      ? reason
      : 'the component changed after this finding was generated';
  }

  private async loadPackagePatterns(): Promise<string[]> {
    if (!this.dataPacksService) return [];
    try {
      const hints = await this.dataPacksService.getActiveIntelligenceHints();
      return Array.from(
        new Set(hints.flatMap((hint) => hint.packagePatterns ?? [])),
      );
    } catch {
      return [];
    }
  }

  /**
   * Records a security audit entry through the established audit service.
   *
   * Runs after commit because `SecurityAuditService` writes with the root client
   * and is not transaction-aware; an audit failure must never roll back an
   * application that already succeeded. Component updates have no audit trail
   * today, so this adds one rather than preserving existing behaviour.
   */
  private async recordAuditEvent(
    outcome: Omit<ApplyComponentFindingResult, 'staledFindingCount'>,
    reviewer?: ApplyReviewerContext,
  ): Promise<void> {
    try {
      await this.securityAudit.record({
        action: 'COMPONENT_INTELLIGENCE_FINDING_APPLIED',
        category: 'Inventory',
        userId: reviewer?.id ?? null,
        userEmail: reviewer?.email ?? null,
        details: {
          findingId: outcome.findingId,
          issueType: outcome.issueType,
          componentId: outcome.componentId,
          componentSku: outcome.component.sku,
          field: outcome.field,
          previousValue: outcome.previousValue,
          appliedValue: outcome.appliedValue,
          appliedValueLabel: outcome.appliedValueLabel,
          fingerprint: outcome.fingerprint,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record audit event for applied finding ${outcome.findingId}: ${String(error)}`,
      );
    }
  }
}
