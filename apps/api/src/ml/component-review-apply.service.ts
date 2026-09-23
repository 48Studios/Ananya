import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { db, type DbExecutor } from '@ananya/database';
import {
  aiSuggestionFeedback,
  categories,
  componentIntelligenceFindings,
  components,
  manufacturers,
  type ComponentIntelligenceFinding,
} from '@ananya/database/schema';
import { and, eq, inArray, sql } from '@ananya/database/query';
import {
  SaveComponentAttributes,
  UpdateComponent,
  type UpdateComponentInput,
} from '@ananya/inventory';
import { DrizzleComponentRepository } from '../infrastructure/repositories/drizzle-component.repository';
import {
  applyComponentTransactionTimeouts,
  classifyComponentApplyTimeout,
  resolveComponentApplyTimeouts,
  type ApplyTimeoutConfig,
} from './component-apply-timeout';
import {
  DrizzleAttributeDefinitionRepository,
  DrizzleAttributeOptionRepository,
  DrizzleComponentAttributeRepository,
} from '../infrastructure/repositories/drizzle-attribute.repository';
import { DrizzleUnitRepository } from '../infrastructure/repositories/drizzle-unit.repository';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { DataPacksService } from '../data-packs/data-packs.service';
import { ComponentReviewQueueService } from './component-review-queue.service';
import {
  readAttributeDefinitionState,
  readCurrentAttributeValue,
  loadUnitCatalog,
} from './current-attribute-value';
import {
  compareAttributeValues,
  findUnit,
  readAbsoluteTolerance,
  readRelativeTolerance,
  toComparableValue,
  type UnitRef,
} from './attribute-value-semantics';
import { buildAttributeValueProvenance } from './document-attribute-value-review';
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
import { mapDecisionToFeedbackAction } from './intelligence-findings/finding-lifecycle';

export interface ApplyReviewerContext {
  id?: string;
  email?: string;
}

export interface ApplyComponentFindingInput {
  expectedFingerprint: string;
  decisionNotes?: string;
  /**
   * The manufacturer/category the reviewer assigned, replacing the suggestion.
   *
   * Only meaningful for entity findings; the service refuses it rather than
   * ignoring it everywhere else, so a caller can never believe a value was
   * written when it was not.
   */
  targetEntityId?: string;
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
    case 'attributes':
      // Attribute values are written through the attribute use case, not as a
      // component field patch. Reaching this would mean the apply path lost its
      // attribute branch, so it fails loudly rather than writing nothing.
      throw new Error(
        'Attribute values are applied through the component attribute use case, not as a component field patch.',
      );
  }
}

interface EntityLookupRow {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * Component columns a finding may write directly.
 *
 * `attributes` is deliberately excluded: attribute values are written through
 * the attribute use case, so only these fields participate in column-level
 * comparison and patching.
 */
type ComponentField = Exclude<ApplicableComponentField, 'attributes'>;

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

/** Narrows an unknown value to a non-empty string. */
function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Reads the attribute value recorded when the finding was generated.
 *
 * `null` means "the attribute had no value", which is a meaningful state the
 * comparison below must distinguish from "a value was recorded".
 */
function readRecordedAttributeValue(
  currentValue: Record<string, unknown> | null,
): string | null {
  return readString(currentValue?.value);
}

/**
 * Whether the recorded value is still the current one.
 *
 * Compared through the semantic layer, so an equivalent value re-expressed in
 * another unit (`300Ω` versus `0.3 kΩ`) is recognised as the same recorded value
 * rather than refused as a change, while a genuinely different value still is.
 */
export function attributeValueStillMatches(
  recorded: string | null,
  live: string | null,
  definition?: {
    dataType: string;
    unitCategory: string | null;
    validationRules?: Record<string, unknown> | null;
  } | null,
  units: readonly UnitRef[] = [],
): boolean {
  if (recorded === null && live === null) return true;
  if (recorded === null || live === null) return false;
  if (recorded === live) return true;

  const dataType = definition?.dataType ?? 'QUANTITY';
  return compareAttributeValues({
    dataType,
    unitCategory: definition?.unitCategory ?? null,
    units,
    first: toComparableValue({ dataType, display: recorded }),
    second: toComparableValue({ dataType, display: live }),
    relativeTolerance: readRelativeTolerance(definition?.validationRules),
    absoluteTolerance: readAbsoluteTolerance(definition?.validationRules),
  }).equivalent;
}

/**
 * Refuses a suggestion whose unit measures a different dimension.
 *
 * The attribute domain converts whatever unit string it is handed, so without
 * this check a `mV` reading could be written onto a resistance attribute and
 * stored under the wrong dimension. Only a *known* unit from the catalog is
 * judged; an unknown unit is left to the domain, exactly as before.
 */
export function describeUnitDimensionMismatch(input: {
  dataType: string;
  unitCategory: string | null;
  unit: string | null;
  units: readonly UnitRef[];
}): string | null {
  if (input.dataType.toUpperCase() !== 'QUANTITY') return null;
  if (input.units.length === 0 || !input.unit) return null;
  const declared = input.unitCategory?.trim();
  if (!declared) return null;

  const unit = findUnit(input.units, input.unit);
  if (!unit || unit.category === declared) return null;

  return `The suggestion uses the unit "${unit.name}", which measures ${unit.category}, but this attribute is a ${declared} attribute. It was not applied, because converting between dimensions is not supported.`;
}

/**
 * Extracts the endpoint-shaped value stored on the finding.
 *
 * A finding stores the *coerced* payload the attribute use case expects —
 * `{ value: 300, unit: 'ohm' }` for a quantity, `{ value: '0805', optionCode:
 * '0805' }` for a select — so those keys are forwarded rather than the wrapper.
 * Only keys the existing attribute API accepts are read, so a finding can never
 * smuggle an unexpected field into the attribute use case.
 */
export function readAttributeWriteInput(suggested: Record<string, unknown>): {
  value?: unknown;
  unit?: string | null;
  optionCode?: string | null;
  selectedOptionCodes?: string[] | null;
} | null {
  const raw = suggested.value;
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : suggested;

  const input: {
    value?: unknown;
    unit?: string | null;
    optionCode?: string | null;
    selectedOptionCodes?: string[] | null;
  } = {};

  if ('value' in source) input.value = source.value;
  if (typeof source.unit === 'string') input.unit = source.unit;
  if (typeof source.optionCode === 'string') {
    input.optionCode = source.optionCode;
  }
  if (Array.isArray(source.selectedOptionCodes)) {
    input.selectedOptionCodes = source.selectedOptionCodes.filter(
      (code): code is string => typeof code === 'string',
    );
  }

  return 'value' in input ? input : null;
}

/** Document identity recorded on a finding, for provenance. */
function readDocumentRef(finding: ComponentIntelligenceFinding): {
  documentId: string;
  documentVersion: number;
  contentHash: string;
} {
  const metadata = finding.metadata ?? {};
  const documentRef =
    typeof metadata.document === 'object' && metadata.document !== null
      ? (metadata.document as Record<string, unknown>)
      : {};

  return {
    documentId: readString(documentRef.documentId) ?? '',
    documentVersion:
      typeof documentRef.documentVersion === 'number'
        ? documentRef.documentVersion
        : 0,
    contentHash: readString(documentRef.documentContentHash) ?? '',
  };
}

/** Evidence recorded on a finding, narrowed for provenance. */
function readEvidence(finding: ComponentIntelligenceFinding): Array<{
  page: number | null;
  text: string | null;
  extractionMethod: string;
}> {
  const evidence = finding.evidence;
  if (!Array.isArray(evidence)) return [];

  return evidence
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object',
    )
    .map((item) => ({
      page: typeof item.page === 'number' ? item.page : null,
      text: readString(item.text),
      extractionMethod:
        readString(item.extractionMethod) ??
        readString(item.source) ??
        'unknown',
    }));
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

  /**
   * The bounds in force for this process.
   *
   * Resolved once at construction rather than per call, so a long-running process
   * cannot change its own limits mid-flight and so the values are visible in one
   * place when diagnosing an apply that timed out.
   */
  private readonly timeouts: ApplyTimeoutConfig =
    resolveComponentApplyTimeouts();

  async applyFinding(
    id: string,
    input: ApplyComponentFindingInput,
    reviewer?: ApplyReviewerContext,
  ): Promise<ApplyComponentFindingResult> {
    const startedAt = performance.now();
    const timings: Record<string, number> = {};

    const phase = async <T>(
      name: string,
      run: () => Promise<T>,
    ): Promise<T> => {
      const phaseStart = performance.now();
      try {
        return await run();
      } finally {
        timings[name] =
          Math.round((performance.now() - phaseStart) * 100) / 100;
      }
    };

    try {
      return await this.applyFindingWithinBounds(
        id,
        input,
        reviewer,
        phase,
        startedAt,
        timings,
      );
    } catch (error) {
      // The bounds are checked first, because a timeout is the one refusal that is
      // worth retrying unchanged. Only the two PostgreSQL timeout SQLSTATEs
      // qualify — a domain refusal, a unique violation or an unexpected driver
      // failure keeps its own meaning below.
      const timeout = classifyComponentApplyTimeout(error, this.timeouts);
      if (timeout) {
        timings.totalMs =
          Math.round((performance.now() - startedAt) * 100) / 100;
        this.logger.warn(
          this.serialize({
            event: 'component.apply.timed_out',
            findingId: id,
            reason: 'APPLY_TIMEOUT',
            outcome: 'ROLLED_BACK',
            timeout: timeout.detail.timeout,
            limitMs: timeout.detail.limitMs,
            ...timings,
          }),
        );
        throw timeout;
      }

      if (error instanceof FindingApplyConflictError) {
        timings.totalMs =
          Math.round((performance.now() - startedAt) * 100) / 100;
        this.logger.warn(
          this.serialize({
            event: 'component.apply.refused',
            findingId: id,
            reason: error.reason,
            outcome: 'ROLLED_BACK',
            reviewerId: reviewer?.id ?? null,
            ...timings,
          }),
        );
        throw error;
      }

      // Anything else is unexpected and must stay visible as a genuine failure
      // rather than be dressed up as a transient conflict.
      timings.totalMs = Math.round((performance.now() - startedAt) * 100) / 100;
      this.logger.error(
        this.serialize({
          event: 'component.apply.failed',
          findingId: id,
          reason: 'UNEXPECTED_ERROR',
          outcome: 'ROLLED_BACK',
          reviewerId: reviewer?.id ?? null,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          ...timings,
        }),
      );
      throw error;
    }
  }

  /** One structured line per event, matching the HTTP interceptor's convention. */
  private serialize(value: Record<string, unknown>): string {
    return JSON.stringify(value);
  }

  private async applyFindingWithinBounds(
    id: string,
    input: ApplyComponentFindingInput,
    reviewer: ApplyReviewerContext | undefined,
    phase: <T>(name: string, run: () => Promise<T>) => Promise<T>,
    startedAt: number,
    timings: Record<string, number>,
  ): Promise<ApplyComponentFindingResult> {
    const [preflight] = await phase('preflightMs', () =>
      db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, id))
        .limit(1),
    );

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

    const packagePatterns = await phase('packagePatternsMs', () =>
      this.loadPackagePatterns(),
    );

    const result = await db.transaction(async (tx) => {
      // 0. Bound this transaction only. `SET LOCAL` reverts on commit or
      //    rollback, so the pooled connection carries no limit afterwards, and
      //    nothing outside this transaction is affected.
      await applyComponentTransactionTimeouts(
        tx as unknown as DbExecutor,
        this.timeouts,
      );

      // 1. Lock the finding so a concurrent apply cannot interleave.
      const [finding] = await phase('findingLockMs', () =>
        tx
          .select()
          .from(componentIntelligenceFindings)
          .where(eq(componentIntelligenceFindings.id, id))
          .limit(1)
          .for('update'),
      );

      if (!finding) {
        throw new NotFoundException(
          `Component review finding '${id}' not found`,
        );
      }

      // 2. A finding may be applied while it is pending a decision, or after a
      //    reviewer accepted it but before the value was written. Everything
      //    else is refused: a finding that was already applied must not be
      //    applied twice, and a stale one must be re-derived before it can be
      //    written at all.
      const alreadyApplied = finding.metadata?.applicationResult === 'APPLIED';
      if (finding.status !== 'PENDING' && finding.status !== 'ACCEPTED') {
        throw new FindingApplyConflictError(
          'FINDING_NOT_PENDING',
          finding.status === 'STALE'
            ? `This finding is stale (${this.describeStaleReason(finding)}). Re-run component analysis to refresh it before applying.`
            : `This finding is already ${finding.status.toLowerCase()} and cannot be applied.`,
        );
      }
      if (finding.status === 'ACCEPTED' && alreadyApplied) {
        throw new FindingApplyConflictError(
          'FINDING_NOT_PENDING',
          'This suggestion was already applied to the component and cannot be applied again.',
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
      //    Attribute suggestions carry their own check (the recorded attribute
      //    value, not a component column) and are handled below.
      if (rule.kind !== 'attribute') {
        this.assertCurrentValueUnchanged(finding, componentRow, rule);
      }

      // 7. Attribute-value suggestions write through the existing attribute use
      //    case rather than a component field patch, so they branch here.
      if (rule.kind === 'attribute') {
        return this.applyAttributeValueFinding({
          tx,
          finding,
          componentRow,
          reviewer,
          decisionNotes: input.decisionNotes,
        });
      }

      // 8. The suggested target must be valid and authoritative. A reviewer may
      //    have assigned a different existing manufacturer/category instead
      //    (`targetEntityId`), which is honoured here and recorded as an edit.
      const resolved = await this.resolveTargetValue(
        tx,
        finding,
        componentRow,
        rule,
        packagePatterns,
        input.targetEntityId,
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
        appliedValueLabel: resolved.valueLabel,
        // True only when the reviewer replaced the suggestion with another row.
        assignmentEdited: resolved.assignmentEdited,
        suggestedTarget: resolved.suggestedTarget,
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
            inArray(componentIntelligenceFindings.status, [
              'PENDING',
              'ACCEPTED',
            ]),
            sql`coalesce(${componentIntelligenceFindings.metadata} ->> 'applicationResult', '') <> 'APPLIED'`,
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
        // An assignment that replaces the suggestion is recorded as EDITED — the
        // value the model proposed is not the value that was kept. An accepted
        // suggestion keeps ACCEPTED. Both come from the shared lifecycle
        // mapping, so the ledger's vocabulary is never widened here.
        //
        // Dismissal is not possible on this route, so the only two reachable
        // outcomes are ACCEPTED and EDITED.
        userAction: mapDecisionToFeedbackAction(
          'ACCEPTED',
          resolved.assignmentEdited,
        ),
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
          assignmentEdited: resolved.assignmentEdited,
          suggestedTarget: resolved.suggestedTarget,
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
          assignmentEdited: resolved.assignmentEdited,
          suggestedTarget: resolved.suggestedTarget,
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
    const staledFindingCount = await phase('reconcileMs', () =>
      this.reconcileSiblingFindings(outcome),
    );
    await phase('auditMs', () => this.recordAuditEvent(outcome, reviewer));

    timings.totalMs = Math.round((performance.now() - startedAt) * 100) / 100;
    this.logger.log(
      this.serialize({
        event: 'component.apply.succeeded',
        findingId: outcome.findingId,
        componentId: outcome.componentId,
        issueType: outcome.issueType,
        field: outcome.field,
        reviewerId: reviewer?.id ?? null,
        outcome: 'APPLIED',
        staledFindingCount,
        ...timings,
      }),
    );

    return { ...outcome, staledFindingCount };
  }

  /**
   * Stales other pending findings for the same component.
   *
   * The component was just modified, so every sibling finding was generated
   * against an older revision and is stale by the established snapshot rule.
   * This reuses the queue's existing staleness mechanism, which only affects
   * PENDING rows — the finding applied above is ACCEPTED and is left untouched.
   *
   * Attribute-value suggestions are excluded: their validity is defined by the
   * attribute value and the document revision, not by the component row, so a
   * change to a different component field does not invalidate them. They are
   * still checked individually when a reviewer decides or applies them.
   */
  private async reconcileSiblingFindings(
    outcome: Omit<ApplyComponentFindingResult, 'staledFindingCount'>,
  ): Promise<number> {
    try {
      const reconciled = await this.reviewQueue.markFindingsStale({
        componentId: outcome.componentId,
        reason: `Component updated by applying finding ${outcome.findingId}`,
        // The whole ATTRIBUTE_VALUE category is excluded, not just the
        // document-sourced producer: an attribute suggestion's validity is
        // defined by the attribute value it was generated against, so a change
        // to a *different* component field does not invalidate it. Each one is
        // still checked individually when a reviewer decides or applies it.
        excludeIssueCategories: ['ATTRIBUTE_VALUE'],
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
    const field = rule.field as ComponentField;
    const currentValue = finding.currentValue;
    if (!currentValue || !(field in currentValue)) return;

    if (
      normalizeComparableValue(currentValue[field]) !==
      normalizeComparableValue(componentRow[field])
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
   *
   * A reviewer may replace the finding's suggestion with another existing row
   * (`assignedEntityId`). That is a choice between two rows the ERP already
   * holds, so it is validated exactly like a suggestion — same lookups, same
   * refusals — and reported back as an edit of the suggestion rather than as an
   * acceptance of it, which is what drives the EDITED feedback action.
   */
  private async resolveTargetValue(
    tx: TransactionClient,
    finding: ComponentIntelligenceFinding,
    componentRow: ComponentRow,
    rule: ComponentApplyRule,
    packagePatterns: readonly string[],
    assignedEntityId?: string,
  ): Promise<{
    value: string;
    valueLabel: string;
    previousValue: string | null;
    /** True when the reviewer's assignment replaced the finding's suggestion. */
    assignmentEdited: boolean;
    /** The replaced suggestion, present only when {@link assignmentEdited}. */
    suggestedTarget: { id: string | null; name: string | null } | null;
  }> {
    const suggested = finding.suggestedValue ?? {};
    const previousValue = normalizeComparableValue(
      componentRow[rule.field as ComponentField],
    );
    const assignment = assignedEntityId?.trim() || null;

    // An assignment is only meaningful where a target row exists. Refused
    // rather than ignored, so a client can never believe a value was written.
    if (rule.kind !== 'entity' && assignment) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        `A ${rule.label.toLowerCase()} finding applies the value it carries; assigning a manufacturer or category is not part of applying it.`,
      );
    }

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
        assignmentEdited: false,
        suggestedTarget: null,
      };
    }

    const suggestedEntityId = suggested[rule.field as ComponentField];
    const offered =
      typeof suggestedEntityId === 'string' && suggestedEntityId.trim().length
        ? suggestedEntityId.trim()
        : null;
    const entityId = assignment ?? offered;

    if (!entityId) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        `This finding does not carry an existing ERP ${rule.label.toLowerCase()} identifier, so it cannot be applied. Assign an existing ${rule.label.toLowerCase()} and apply it again.`,
      );
    }

    const entity = await this.findEntity(tx, rule, entityId);
    // The refusal names what the reviewer acted on: a stale selection and a
    // stale suggestion are different problems for the person fixing them.
    const subject = assignment ? 'selected' : 'suggested';

    if (!entity) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_NOT_FOUND',
        `The ${subject} ${rule.label.toLowerCase()} no longer exists in the ERP. Nothing was applied.`,
      );
    }

    if (!entity.isActive) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_INACTIVE',
        `The ${subject} ${rule.label.toLowerCase()} "${entity.name}" is inactive and cannot be assigned.`,
      );
    }

    // Selecting the suggested row is an acceptance, not an edit; selecting any
    // other row — including the first row chosen for a suggestion that carried
    // only a name — is an edit the feedback ledger must record.
    const assignmentEdited = assignment !== null && entity.id !== offered;

    return {
      value: entity.id,
      valueLabel: entity.name,
      previousValue,
      assignmentEdited,
      suggestedTarget: assignmentEdited
        ? {
            id: offered,
            name: this.readSuggestedTargetName(suggested),
          }
        : null,
    };
  }

  /**
   * The name the finding proposed, for the record of what was replaced.
   *
   * Read from the suggestion's own fields rather than the ERP: after an edit the
   * suggestion may name a manufacturer or category that does not exist, which is
   * precisely the case worth recording.
   */
  private readSuggestedTargetName(
    suggested: Record<string, unknown>,
  ): string | null {
    for (const key of [
      'manufacturerName',
      'categoryName',
      'categoryPath',
    ] as const) {
      const value = suggested[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
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

  /**
   * Applies an extracted specification to the component's attribute values.
   *
   * Everything the write needs comes from the finding (attribute definition, the
   * endpoint-shaped value and the extraction facts); nothing is taken from the
   * request. The write itself goes through the existing `SaveComponentAttributes`
   * use case, bound to this transaction's repositories, so the domain's own
   * validation remains authoritative and the mutation, the finding transition and
   * the feedback row commit together.
   *
   * Pre-checks, in order, so a refusal never writes anything:
   *  1. the component must not be retired by consolidation;
   *  2. the attribute definition must still exist and be active;
   *  3. the recorded attribute value must still be the one the suggestion was
   *     generated against.
   */
  private async applyAttributeValueFinding(input: {
    tx: TransactionClient;
    finding: ComponentIntelligenceFinding;
    componentRow: ComponentRow;
    reviewer?: ApplyReviewerContext;
    decisionNotes?: string;
  }): Promise<
    | {
        applied: true;
        outcome: Omit<ApplyComponentFindingResult, 'staledFindingCount'>;
      }
    | { applied: false; reason: ApplyConflictReason; message: string }
  > {
    const { tx, finding, componentRow, reviewer, decisionNotes } = input;

    // 1. A retired component keeps its record for history but must not receive
    //    new data; consolidation already moved its documentation elsewhere.
    if (componentRow.consolidatedIntoComponentId) {
      throw new FindingApplyConflictError(
        'COMPONENT_RETIRED',
        'This component was consolidated into another component and can no longer be modified. Apply the suggestion to the surviving component instead.',
      );
    }

    const suggested = finding.suggestedValue ?? {};
    const attributeDefinitionId = readString(
      finding.metadata?.attributeDefinitionId ??
        suggested.attributeDefinitionId,
    );
    if (!attributeDefinitionId) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        'This finding does not identify the attribute definition to write, so it cannot be applied.',
      );
    }

    // 2. Authoritative definition state, read in this transaction.
    const definition = await readAttributeDefinitionState(
      attributeDefinitionId,
      tx as unknown as Parameters<typeof readAttributeDefinitionState>[1],
    );
    if (!definition) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_NOT_FOUND',
        'The attribute definition for this suggestion no longer exists. The suggestion was not applied.',
      );
    }
    if (!definition.isActive) {
      throw new FindingApplyConflictError(
        'SUGGESTED_ENTITY_INACTIVE',
        `The attribute "${definition.name}" is inactive and cannot receive new values.`,
      );
    }

    // 3. The recorded value must still match what the suggestion described.
    const recorded = readRecordedAttributeValue(finding.currentValue);
    const live = await readCurrentAttributeValue(
      finding.componentId,
      attributeDefinitionId,
      tx as unknown as Parameters<typeof readCurrentAttributeValue>[2],
    );
    const units = await loadUnitCatalog(
      tx as unknown as Parameters<typeof loadUnitCatalog>[0],
    );
    if (
      !attributeValueStillMatches(
        recorded,
        live?.display ?? null,
        definition,
        units,
      )
    ) {
      const reason =
        'The component\u2019s recorded value for this attribute changed after this finding was generated';
      // The staleness record must outlive this refused attempt, so it is written
      // in the transaction and the conflict is raised after it commits.
      await this.markStaleWithinTransaction(tx, finding.id, reason);
      return {
        applied: false as const,
        reason: 'ATTRIBUTE_VALUE_CHANGED' as ApplyConflictReason,
        message: `${reason}. The suggestion was not applied \u2014 re-run datasheet analysis to refresh it.`,
      };
    }

    const attributeInput = readAttributeWriteInput(suggested);
    if (!attributeInput) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        'This finding does not carry a value that the attribute API accepts, so it cannot be applied.',
      );
    }

    // 4. The unit must measure the dimension the attribute declares. The domain
    //    converts any unit string it is given, so a wrong-dimension unit is
    //    refused here rather than stored under the wrong dimension.
    const unitMismatch = describeUnitDimensionMismatch({
      dataType: definition.dataType,
      unitCategory: definition.unitCategory,
      unit:
        typeof attributeInput.unit === 'string' ? attributeInput.unit : null,
      units,
    });
    if (unitMismatch) {
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        unitMismatch,
      );
    }

    const appliedAt = new Date();
    const display =
      readString(suggested.display) ?? readString(suggested.formatted) ?? null;

    // Transition first, guarded on PENDING: if a concurrent reviewer won the
    // race, the attribute write below never happens.
    const metadataPatch = JSON.stringify({
      decision: 'ACCEPTED',
      applied: true,
      action: 'APPLIED',
      appliedField: finding.metadata?.field ?? null,
      attributeDefinitionId,
      previousValue: recorded,
      appliedValue: display,
      decisionNotes: decisionNotes ?? null,
      fingerprint: finding.fingerprint,
      applicationResult: 'APPLIED',
      appliedAt: appliedAt.toISOString(),
    });

    const acceptedRows = await tx
      .update(componentIntelligenceFindings)
      .set({
        status: 'ACCEPTED',
        reviewerId: reviewer?.id ?? null,
        reviewerEmail: reviewer?.email ?? null,
        reviewedAt: appliedAt,
        decisionNotes: decisionNotes ?? null,
        updatedAt: appliedAt,
        metadata: sql`coalesce(${componentIntelligenceFindings.metadata}, '{}'::jsonb) || ${metadataPatch}::jsonb`,
      })
      .where(
        and(
          eq(componentIntelligenceFindings.id, finding.id),
          inArray(componentIntelligenceFindings.status, [
            'PENDING',
            'ACCEPTED',
          ]),
          // The write of the value is guarded by the application itself: a
          // concurrent reviewer, or a retry after success, matches no row.
          sql`coalesce(${componentIntelligenceFindings.metadata} ->> 'applicationResult', '') <> 'APPLIED'`,
        ),
      )
      .returning({ id: componentIntelligenceFindings.id });

    if (acceptedRows.length === 0) {
      throw new FindingApplyConflictError(
        'FINDING_NOT_PENDING',
        'This finding was decided by another reviewer. Refresh the queue to see the current state.',
      );
    }

    // The existing attribute mutation path, bound to this transaction. Its own
    // validation decides whether the value is representable; a rejection rolls
    // the whole application back.
    const provenance = buildAttributeValueProvenance({
      findingId: finding.id,
      // Where the value actually came from. A datasheet-sourced finding records
      // its document; an attribute suggestion derived from the category, a
      // package classification or the component's own text records its own
      // source and no document, rather than claiming a file that never existed.
      source: finding.source,
      document: readDocumentRef(finding),
      evidence: readEvidence(finding),
      reviewer: { id: reviewer?.id ?? null, email: reviewer?.email ?? null },
      appliedAt,
    });

    const attributeRepositoryClient = tx as unknown as DbExecutor;
    try {
      await new SaveComponentAttributes(
        new DrizzleAttributeDefinitionRepository(attributeRepositoryClient),
        new DrizzleAttributeOptionRepository(attributeRepositoryClient),
        new DrizzleUnitRepository(attributeRepositoryClient),
        new DrizzleComponentAttributeRepository(attributeRepositoryClient),
      ).execute(
        finding.componentId,
        [{ attributeDefinitionId, ...attributeInput }],
        provenance as unknown as Record<string, unknown>,
      );
    } catch (error) {
      // The domain refused the value. Nothing has been written, and throwing
      // rolls back the finding transition above.
      throw new FindingApplyConflictError(
        'INVALID_SUGGESTED_VALUE',
        `The attribute value was refused by the attribute domain: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await tx.insert(aiSuggestionFeedback).values({
      componentId: finding.componentId,
      suggestionType: finding.issueType,
      field:
        readString(finding.metadata?.field) ?? finding.issueType.toLowerCase(),
      predictedValue: finding.suggestedValue ?? null,
      confidence: finding.confidence,
      confidenceLevel: finding.confidenceLevel ?? 'MEDIUM',
      evidence: finding.evidence ?? [],
      modelVersion: finding.modelVersion ?? '1.0.0',
      // The feedback ledger models ACCEPTED | REJECTED | EDITED only, so an
      // application is recorded as ACCEPTED with the mutation facts in metadata
      // rather than widening the global action vocabulary.
      userAction: 'ACCEPTED',
      finalValue: { value: attributeInput.value },
      reviewerId: reviewer?.id ?? null,
      reviewerEmail: reviewer?.email ?? null,
      metadata: {
        findingId: finding.id,
        issueType: finding.issueType,
        issueCategory: finding.issueCategory,
        action: 'APPLIED',
        applied: true,
        applicationResult: 'APPLIED',
        attributeDefinitionId,
        attributeCode: definition.code,
        previousValue: recorded,
        appliedValue: display,
        fingerprint: finding.fingerprint,
        intelligenceVersion: finding.intelligenceVersion ?? null,
        documentId: provenance.documentId ?? null,
        documentVersion: provenance.documentVersion ?? null,
        contentHash: provenance.contentHash ?? null,
        decisionNotes: decisionNotes ?? null,
      },
    });

    return {
      applied: true as const,
      outcome: {
        findingId: finding.id,
        componentId: finding.componentId,
        issueType: finding.issueType,
        field: 'attributes',
        fieldLabel: definition.name,
        previousValue: recorded,
        appliedValue: display,
        appliedValueLabel: display,
        fingerprint: finding.fingerprint,
        appliedAt: appliedAt.toISOString(),
        reviewerId: reviewer?.id ?? null,
        reviewerEmail: reviewer?.email ?? null,
        // An attribute suggestion carries its own value; there is no entity to
        // assign, so the application is never an edit of a target row.
        assignmentEdited: false,
        suggestedTarget: null,
        component: {
          id: componentRow.id,
          sku: componentRow.sku,
          name: componentRow.name,
          manufacturerPartNumber: componentRow.manufacturerPartNumber ?? null,
          manufacturerId: componentRow.manufacturerId ?? null,
          categoryId: componentRow.categoryId ?? null,
          // Applying an attribute does not touch the component row, so this is
          // the row's existing revision rather than a new one.
          updatedAt: componentRow.updatedAt.toISOString(),
        },
      },
    };
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
          // Records whether the reviewer kept the model's suggestion or
          // assigned another existing row in its place.
          assignmentEdited: outcome.assignmentEdited,
          suggestedTarget: outcome.suggestedTarget,
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
