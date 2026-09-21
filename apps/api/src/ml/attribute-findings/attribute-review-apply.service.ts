import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db, type DbExecutor } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  categories,
  categoryAttributes,
} from '@ananya/database/schema';
import { and, eq } from '@ananya/database/query';
import {
  CategoryAttribute,
  type CategoryAttributeRepository,
} from '@ananya/inventory';
import { DrizzleCategoryAttributeRepository } from '../../infrastructure/repositories/drizzle-attribute.repository';
import { SecurityAuditService } from '../../security-audit/security-audit.service';
import {
  AttributeIntelligenceFindingsService,
  type StalenessSubject,
} from './attribute-finding.service';
import type { AttributeFindingDto } from './attribute-finding.dtos';
import {
  resolveAttributeApplyRule,
  type ApplyAttributeFindingDto,
  type ApplyAttributeFindingResult,
  type AttributeApplyAction,
  type AttributeApplyConflictReason,
} from './attribute-review-apply.dtos';
import {
  applyTransactionTimeouts,
  classifyApplyTimeout,
  resolveApplyTimeouts,
  type ApplyTimeoutConfig,
} from './attribute-apply-timeout';

export interface ApplyAttributeActor {
  id?: string;
  email?: string;
}

/**
 * Per-phase timings for one apply attempt.
 *
 * Kept in memory and logged, never persisted: the finding's metadata records what
 * changed, and mixing operational timing into it would make the record's shape
 * depend on how busy the database happened to be. The purpose is to answer "which
 * phase held the transaction open" when an apply is slow or times out.
 */
interface ApplyTimings {
  findingLockMs?: number;
  targetResolutionMs?: number;
  expectedStateMs?: number;
  mutationMs?: number;
  feedbackMs?: number;
  totalMs: number;
}

/**
 * Structured diagnostics for one apply attempt.
 *
 * `serialize`d to a single JSON line, matching `HttpLoggingInterceptor`'s
 * convention. The field list is deliberately closed: finding id, family, action,
 * reason, actor id, fingerprint, application result and outcome. No token, no
 * request body, no `metadata` blob — a finding's metadata can carry arbitrary
 * producer payloads, and a diagnostic line is not the place to leak them.
 */
interface ApplyLogContext {
  findingId: string;
  issueType?: string | null;
  action?: AttributeApplyAction;
  actorId?: string | null;
  fingerprint?: string | null;
  applicationResult?: string | null;
}

const BINDING_FAMILY_ISSUE_TYPES = [
  'MISSING_EXPECTED_ATTRIBUTE',
  'SUGGESTED_BINDING',
  'SUSPICIOUS_BINDING',
];

const SECURITY_AUDIT_ACTION = 'ATTRIBUTE_INTELLIGENCE_FINDING_APPLIED';

/**
 * Raised when an application request is refused for a state reason.
 *
 * The body carries a machine-readable `reason` so the client can react without
 * parsing prose. Nothing is mutated when this is thrown; thrown inside the
 * transaction, it rolls the whole transaction back.
 */
export class AttributeApplyConflictError extends ConflictException {
  constructor(
    public readonly reason: AttributeApplyConflictReason,
    message: string,
  ) {
    super({ statusCode: 409, reason, message });
  }
}

/** Resolved, verified target of an application. */
interface ResolvedTarget {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
}

/**
 * Applies accepted Attribute Intelligence findings to the attribute library.
 *
 * This is the only code in the attribute-intelligence pipeline that mutates
 * authoritative data. Two consequences shape everything below:
 *
 *  1. **Acceptance is not permission.** Apply requires an already-`ACCEPTED`
 *     finding, and the request must name the action explicitly. A decision alone
 *     never mutates anything.
 *  2. **Only two mutations exist**, both on the category/attribute binding that a
 *     finding directly identifies: add a binding for an existing definition, and
 *     remove an existing binding. No definition, option or component value is
 *     created, changed or deleted here, and duplicate/retirement findings are
 *     refused outright because the domain has no use case for them.
 *
 * The mutation goes through the `@ananya/inventory` `CategoryAttribute` aggregate
 * and its repository, bound to the transaction, exactly as
 * `ComponentReviewApplyService` binds `DrizzleComponentRepository`. The legacy
 * `apply-bindings` endpoint is NOT used: it inserts rows with raw SQL outside any
 * transaction, which is precisely the pattern this pass must not extend.
 */
@Injectable()
export class AttributeReviewApplyService {
  private readonly logger = new Logger(AttributeReviewApplyService.name);

  constructor(
    private readonly findingsService: AttributeIntelligenceFindingsService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  /**
   * The bounds in force for this process.
   *
   * Resolved once at construction rather than per call, so a long-running process
   * cannot change its own limits mid-flight and so the values are visible in one
   * place when diagnosing an apply that timed out.
   */
  private readonly timeouts: ApplyTimeoutConfig = resolveApplyTimeouts();

  async applyFinding(
    id: string,
    input: ApplyAttributeFindingDto,
    actor?: ApplyAttributeActor,
  ): Promise<ApplyAttributeFindingResult> {
    const startedAt = performance.now();
    const timings: ApplyTimings = { totalMs: 0 };
    // Populated as soon as the finding is read, so a failure in any later phase can
    // still log which family and action it was about.
    const logContext: ApplyLogContext = {
      findingId: id,
      action: input.action,
      actorId: actor?.id ?? null,
      fingerprint: input.expectedFingerprint,
    };

    const phase = async <T>(
      name: keyof ApplyTimings,
      run: () => Promise<T>,
    ) => {
      const phaseStart = performance.now();
      try {
        return await run();
      } finally {
        timings[name] = roundMs(performance.now() - phaseStart);
      }
    };

    try {
      const applied = await db.transaction(async (tx) => {
        const client = tx as unknown as DbExecutor;

        // 0. Bound this transaction only. `SET LOCAL` reverts on commit or
        //    rollback, so the pooled connection carries no limit afterwards, and
        //    nothing outside this transaction is affected.
        await applyTransactionTimeouts(client, this.timeouts);

        // 1. Lock the finding, so two applies of the same finding serialise and the
        //    second observes the first's committed result instead of racing it.
        const finding = await phase('findingLockMs', () =>
          this.findingsService.getFindingForUpdate(id, client),
        );
        if (!finding) {
          throw new NotFoundException(`Attribute finding '${id}' not found`);
        }
        logContext.issueType = finding.issueType;
        logContext.applicationResult = finding.applicationResult;

        // 2. Supported family and matching action. Both refusals are free of side
        //    effects, so they can be raised before any domain work.
        const rule = resolveAttributeApplyRule(finding.issueType);
        if (!rule) {
          throw new AttributeApplyConflictError(
            'UNSUPPORTED_FINDING_TYPE',
            `Findings of type '${finding.issueType}' cannot be applied. Only attribute bindings can be applied; duplicate and unused findings are review-only because the domain has no merge or retirement operation.`,
          );
        }
        if (rule.action !== input.action) {
          throw new AttributeApplyConflictError(
            'UNSUPPORTED_ACTION',
            `Finding '${id}' applies ${rule.action}, not ${input.action}.`,
          );
        }

        // 3. Application state. Applying requires a recorded approval, and a finding
        //    can only be applied once.
        if (finding.applicationResult === 'APPLIED') {
          throw new AttributeApplyConflictError(
            'ALREADY_APPLIED',
            'This finding has already been applied to the attribute library and cannot be applied again.',
          );
        }
        if (finding.status === 'STALE') {
          throw new AttributeApplyConflictError(
            'FINDING_STALE',
            `This finding is stale (${this.describeStaleReason(finding.metadata)}). Re-run the library audit to refresh it before applying.`,
          );
        }
        if (finding.status !== 'ACCEPTED') {
          throw new AttributeApplyConflictError(
            'FINDING_NOT_ACCEPTED',
            `This finding is ${finding.status.toLowerCase()}. Accept it first: applying an unreviewed finding would mutate the attribute library without a recorded approval.`,
          );
        }

        // 4. Revision proof.
        if (finding.fingerprint !== input.expectedFingerprint) {
          throw new AttributeApplyConflictError(
            'FINDING_STALE',
            'This finding changed since it was loaded. Refresh the queue and review it again.',
          );
        }

        // 5. Resolve and verify the authoritative target for this action, before the
        //    expected-state comparison. Both are reads, and the target check is the
        //    more specific of the two: "the binding you want to add is already there"
        //    tells the reviewer what is actually wrong with the library, whereas the
        //    expected-state check can only report that the finding's premise moved.
        const target = await phase('targetResolutionMs', () =>
          this.resolveTarget({
            tx: client,
            finding,
            action: input.action,
          }),
        );

        // 6. Expected state, against THIS transaction's view of the library. A
        //    mismatch means the finding describes a library that no longer exists, so
        //    it is retired rather than applied.
        const staleReason = await phase('expectedStateMs', () =>
          this.findingsService.describeFindingStaleness(finding, client),
        );
        if (staleReason) {
          // The staleness record must outlive this refused attempt, so it is written
          // in the transaction and the conflict is raised after that commits.
          await this.findingsService.markFindingStaleInTransaction(
            finding.id,
            staleReason,
            client,
          );
          return {
            applied: false as const,
            reason: 'FINDING_STALE' as AttributeApplyConflictReason,
            message: `${staleReason}. The suggestion was not applied — re-run the library audit to refresh it.`,
          };
        }

        // 7. Mutate through the domain, then record the application. The order is
        //    deliberate: if the domain refuses, the guarded application write below
        //    never happens, and the whole transaction rolls back.
        const mutation = await phase('mutationMs', () =>
          this.performMutation({
            tx: client,
            action: input.action,
            target,
          }),
        );

        const appliedAt = new Date();
        const previousState =
          input.action === 'ADD_BINDING' ? 'Not bound' : 'Bound';
        const appliedState =
          input.action === 'ADD_BINDING' ? 'Bound' : 'Not bound';

        const marked = await this.findingsService.markFindingApplied(
          finding.id,
          {
            appliedAt,
            metadataPatch: {
              // Named `appliedAction` rather than `action`: the finding's metadata
              // already carries the *proposed* action in `suggestedValue`, and the
              // two must stay distinguishable after the fact.
              appliedAction: input.action,
              applicationResult: 'APPLIED',
              appliedAt: appliedAt.toISOString(),
              appliedBy: {
                id: actor?.id ?? null,
                email: actor?.email ?? null,
              },
              previousState,
              appliedState,
              fingerprint: finding.fingerprint,
              attributeDefinitionId: target.attributeDefinitionId,
              categoryId: target.categoryId,
              decisionNotes: input.decisionNotes ?? null,
            },
          },
          client,
        );

        if (!marked) {
          // The guard requires ACCEPTED + NOT_APPLIED, so this means another apply
          // won between the lock and here — impossible while the lock is held, but
          // asserted rather than assumed.
          throw new AttributeApplyConflictError(
            'CONCURRENT_APPLICATION',
            'This finding was applied by another reviewer. Refresh the queue to see the current state.',
          );
        }

        // 8. Feedback, in the same transaction as the mutation it describes.
        const feedbackId = await phase('feedbackMs', () =>
          this.recordFeedback({
            tx: client,
            finding,
            target,
            action: input.action,
            appliedAt,
            actor,
            previousState,
            appliedState,
            mutation,
            decisionNotes: input.decisionNotes,
          }),
        );

        return {
          applied: true as const,
          outcome: {
            findingId: finding.id,
            issueType: finding.issueType,
            action: input.action,
            applicationResult: 'APPLIED' as const,
            status: 'ACCEPTED' as const,
            attributeDefinitionId: target.attributeDefinitionId,
            attributeCode: target.attributeCode,
            attributeName: target.attributeName,
            categoryId: target.categoryId,
            categoryCode: target.categoryCode,
            categoryName: target.categoryName,
            previousState,
            appliedState,
            fingerprint: finding.fingerprint,
            appliedAt: appliedAt.toISOString(),
            appliedById: actor?.id ?? null,
            appliedByEmail: actor?.email ?? null,
            feedbackId,
          },
        };
      });

      // The staleness marking committed with the transaction above, so the conflict
      // is raised only after that bookkeeping is durable.
      if (!applied.applied) {
        throw new AttributeApplyConflictError(applied.reason, applied.message);
      }

      const outcome = applied.outcome;
      const staledFindingCount = await this.reconcileBindingFindings(outcome);
      await this.recordSecurityAudit(outcome);

      timings.totalMs = roundMs(performance.now() - startedAt);
      logContext.applicationResult = outcome.applicationResult;
      this.logger.log(
        this.serialize({
          event: 'attribute.apply.succeeded',
          ...logContext,
          outcome: 'APPLIED',
          attributeCode: outcome.attributeCode,
          categoryCode: outcome.categoryCode,
          staledFindingCount,
          ...timings,
        }),
      );

      return { ...outcome, staledFindingCount };
    } catch (error) {
      // The bounds are the first thing to check, because a timeout is the one
      // refusal that is worth retrying unchanged. Only the two PostgreSQL timeout
      // SQLSTATEs qualify — everything else keeps its own meaning below.
      const timeout = classifyApplyTimeout(error, this.timeouts);
      if (timeout) {
        timings.totalMs = roundMs(performance.now() - startedAt);
        this.logger.warn(
          this.serialize({
            event: 'attribute.apply.timed_out',
            ...logContext,
            reason: 'APPLY_TIMEOUT',
            outcome: 'ROLLED_BACK',
            timeout: timeout.detail.timeout,
            limitMs: timeout.detail.limitMs,
            ...timings,
          }),
        );
        throw timeout;
      }

      // A refusal is expected traffic, not a defect: logged at warn with the reason
      // so an operator can see *why* applies are failing, and rethrown untouched so
      // the client contract is exactly what the service decided.
      if (error instanceof AttributeApplyConflictError) {
        timings.totalMs = roundMs(performance.now() - startedAt);
        this.logger.warn(
          this.serialize({
            event: 'attribute.apply.refused',
            ...logContext,
            reason: error.reason,
            outcome: 'ROLLED_BACK',
            ...timings,
          }),
        );
        throw error;
      }

      // Anything else is unexpected and must stay visible as a genuine failure
      // rather than be dressed up as a transient conflict. The message is logged;
      // the error itself is rethrown so the global filter reports it as it always
      // would.
      timings.totalMs = roundMs(performance.now() - startedAt);
      this.logger.error(
        this.serialize({
          event: 'attribute.apply.failed',
          ...logContext,
          reason: 'UNEXPECTED_ERROR',
          outcome: 'ROLLED_BACK',
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          ...timings,
        }),
      );
      throw error;
    }
  }

  /**
   * One structured line per event, matching `HttpLoggingInterceptor`'s convention.
   *
   * JSON rather than a formatted sentence so the fields are queryable. The caller
   * decides which fields exist — this method never adds any.
   */
  private serialize(value: Record<string, unknown>): string {
    return JSON.stringify(value);
  }

  /**
   * Resolves and verifies the authoritative target.
   *
   * Reads the attribute and category rows inside the transaction, in id order so two
   * applies touching overlapping subjects acquire locks in the same order, and
   * refuses anything the finding does not unambiguously identify. The binding's own
   * existence is checked here too, because ADD and REMOVE have opposite
   * expectations about it and both are hard requirements:
   *
   *  - ADD requires the binding to be ABSENT, or the finding no longer describes the
   *    library (the binding appeared after analysis);
   *  - REMOVE requires it to be PRESENT, or the finding's subject is gone.
   *
   * An inactive attribute only blocks ADD: adding requires an active definition
   * because the domain will not serve values for an inactive one, while removing an
   * undesirable binding from a deactivated attribute is still a legitimate cleanup.
   */
  private async resolveTarget(input: {
    tx: DbExecutor;
    finding: StalenessSubject & { issueType: string };
    action: AttributeApplyAction;
  }): Promise<ResolvedTarget> {
    const { tx, finding, action } = input;

    const attributeDefinitionId = finding.attributeDefinitionId;
    const categoryId = finding.categoryId;

    // Both actions operate on a binding, which needs both sides. A category-first
    // finding whose attribute was never defined has no binding to add, and the pass
    // explicitly forbids creating one — so it is refused rather than turned into a
    // definition creation.
    if (!attributeDefinitionId) {
      throw new AttributeApplyConflictError(
        'UNSUPPORTED_TARGET',
        'This finding expects an attribute that does not exist in the library yet. Creating attribute definitions from intelligence is not supported, so there is nothing to apply — define the attribute first, then re-run the audit.',
      );
    }
    if (!categoryId) {
      throw new AttributeApplyConflictError(
        'UNSUPPORTED_TARGET',
        'This finding does not identify the category it applies to, so there is no binding to change.',
      );
    }

    // Ordered lock acquisition: attribute, then category.
    const [attribute] = await tx
      .select({
        id: attributeDefinitions.id,
        code: attributeDefinitions.code,
        name: attributeDefinitions.name,
        isActive: attributeDefinitions.isActive,
      })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.id, attributeDefinitionId))
      .limit(1)
      .for('update');

    if (!attribute) {
      throw new AttributeApplyConflictError(
        'TARGET_NOT_FOUND',
        'The attribute definition for this finding no longer exists in the library.',
      );
    }

    const [category] = await tx
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1)
      .for('update');

    if (!category) {
      throw new AttributeApplyConflictError(
        'TARGET_NOT_FOUND',
        'The category for this finding no longer exists in the library.',
      );
    }

    if (action === 'ADD_BINDING' && !attribute.isActive) {
      throw new AttributeApplyConflictError(
        'TARGET_INACTIVE',
        `The attribute "${attribute.name}" is inactive and cannot be bound to a category.`,
      );
    }
    if (action === 'ADD_BINDING' && !category.isActive) {
      throw new AttributeApplyConflictError(
        'TARGET_INACTIVE',
        `The category "${category.name}" is inactive and cannot receive new attribute bindings.`,
      );
    }

    const [existingBinding] = await tx
      .select({ id: categoryAttributes.id })
      .from(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.categoryId, categoryId),
          eq(categoryAttributes.attributeDefinitionId, attributeDefinitionId),
        ),
      )
      .limit(1)
      .for('update');

    if (action === 'ADD_BINDING' && existingBinding) {
      throw new AttributeApplyConflictError(
        'TARGET_ALREADY_EXISTS',
        `The attribute "${attribute.name}" is already bound to "${category.name}". The finding no longer describes the library — re-run the audit to refresh it.`,
      );
    }
    if (action === 'REMOVE_BINDING' && !existingBinding) {
      throw new AttributeApplyConflictError(
        'FINDING_STALE',
        `The binding between "${attribute.name}" and "${category.name}" no longer exists. The finding no longer describes the library — re-run the audit to refresh it.`,
      );
    }

    return {
      attributeDefinitionId: attribute.id,
      attributeCode: attribute.code,
      attributeName: attribute.name,
      categoryId: category.id,
      categoryCode: category.code,
      categoryName: category.name,
    };
  }

  /**
   * Performs the authoritative mutation through the domain aggregate.
   *
   * The repository is constructed against the transaction's executor, so it
   * participates in the same transaction as the finding transition and the feedback
   * row. Domain refusals are translated into the conflict vocabulary rather than
   * escaping as a 500.
   */
  private async performMutation(input: {
    tx: DbExecutor;
    action: AttributeApplyAction;
    target: ResolvedTarget;
  }): Promise<{ sortOrder: number | null }> {
    const repository: CategoryAttributeRepository =
      new DrizzleCategoryAttributeRepository(input.tx);

    try {
      if (input.action === 'ADD_BINDING') {
        const existing = await repository.findByAttributeDefinitionId(
          input.target.attributeDefinitionId,
        );
        // Append after the category's existing attributes, matching how the
        // attribute UI orders a new binding; the exact value is presentational.
        const sortOrder =
          existing.length === 0
            ? 10
            : Math.max(...existing.map((binding) => binding.sortOrder)) + 10;

        const binding = CategoryAttribute.create({
          categoryId: input.target.categoryId,
          attributeDefinitionId: input.target.attributeDefinitionId,
          isRequired: false,
          sortOrder,
        });
        await repository.save(binding);
        return { sortOrder };
      }

      const removed = await repository.delete(
        input.target.categoryId,
        input.target.attributeDefinitionId,
      );
      if (!removed) {
        // Someone removed the binding between the check above and this write.
        // Reporting success would be a lie about the library.
        throw new AttributeApplyConflictError(
          'FINDING_STALE',
          'The binding was removed by someone else while this application was running. The finding no longer describes the library — re-run the audit to refresh it.',
        );
      }
      return { sortOrder: null };
    } catch (error) {
      if (error instanceof AttributeApplyConflictError) throw error;
      throw new AttributeApplyConflictError(
        'DOMAIN_REFUSED',
        `The attribute domain refused the change: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Records the application in the existing telemetry ledger.
   *
   * Uses `ai_suggestion_feedback` rather than a new table. `userAction` stays within
   * the ledger's existing `ACCEPTED | REJECTED | EDITED` vocabulary — an application
   * is recorded as ACCEPTED with a distinguishing `action` in metadata, the same
   * convention the component apply path uses, so existing feedback queries keep
   * working.
   */
  private async recordFeedback(input: {
    tx: DbExecutor;
    /**
     * Only the finding fields the feedback row copies. A structural subset rather
     * than the whole finding, so the apply path depends on the finding contract
     * instead of on the table's shape.
     */
    finding: Pick<
      AttributeFindingDto,
      | 'id'
      | 'issueType'
      | 'issueCategory'
      | 'field'
      | 'suggestedValue'
      | 'confidence'
      | 'confidenceLevel'
      | 'evidence'
      | 'modelVersion'
      | 'intelligenceVersion'
      | 'fingerprint'
    >;
    target: ResolvedTarget;
    action: AttributeApplyAction;
    appliedAt: Date;
    actor?: ApplyAttributeActor;
    previousState: string;
    appliedState: string;
    mutation: { sortOrder: number | null };
    decisionNotes?: string;
  }): Promise<string | null> {
    const [row] = await input.tx
      .insert(aiSuggestionFeedback)
      .values({
        componentId: null,
        attributeDefinitionId: input.target.attributeDefinitionId,
        categoryId: input.target.categoryId,
        suggestionType: input.finding.issueType,
        field: resolveFeedbackField(input.finding),
        predictedValue: input.finding.suggestedValue ?? null,
        confidence:
          input.finding.confidence === null
            ? null
            : String(input.finding.confidence),
        confidenceLevel: input.finding.confidenceLevel ?? 'MEDIUM',
        evidence: input.finding.evidence ?? [],
        modelVersion: input.finding.modelVersion ?? '1.0.0',
        userAction: 'ACCEPTED',
        finalValue: {
          action: input.action,
          attributeDefinitionId: input.target.attributeDefinitionId,
          categoryId: input.target.categoryId,
        },
        reviewerId: input.actor?.id ?? null,
        reviewerEmail: input.actor?.email ?? null,
        metadata: {
          findingId: input.finding.id,
          findingTable: 'attribute_intelligence_findings',
          issueType: input.finding.issueType,
          issueCategory: input.finding.issueCategory,
          action: 'APPLIED',
          applied: true,
          applicationResult: 'APPLIED',
          appliedAction: input.action,
          attributeDefinitionId: input.target.attributeDefinitionId,
          attributeCode: input.target.attributeCode,
          categoryId: input.target.categoryId,
          categoryCode: input.target.categoryCode,
          previousState: input.previousState,
          appliedState: input.appliedState,
          sortOrder: input.mutation.sortOrder,
          fingerprint: input.finding.fingerprint,
          intelligenceVersion: input.finding.intelligenceVersion ?? null,
          appliedAt: input.appliedAt.toISOString(),
          decisionNotes: input.decisionNotes ?? null,
        },
      })
      .returning({ id: aiSuggestionFeedback.id });

    return row?.id ?? null;
  }

  /**
   * Retires other PENDING findings the mutation just invalidated.
   *
   * Scoped to the binding family only. Adding or removing a binding changes the
   * binding set, which is exactly what `MISSING_EXPECTED_ATTRIBUTE`,
   * `SUGGESTED_BINDING` and `SUSPICIOUS_BINDING` findings assert — so those are
   * stale. Duplicate and unused findings describe identity and usage instead, so
   * they are left for the decision-time check and the next audit rather than being
   * aged by a change they do not depend on.
   *
   * Best-effort: the mutation is committed and the finding truthfully records it, so
   * a failure here must not turn a successful application into an error.
   */
  private async reconcileBindingFindings(
    outcome: Omit<ApplyAttributeFindingResult, 'staledFindingCount'>,
  ): Promise<number> {
    try {
      const byAttribute = await this.findingsService.markFindingsStale({
        attributeDefinitionId: outcome.attributeDefinitionId,
        issueTypes: BINDING_FAMILY_ISSUE_TYPES,
        reason: `Binding ${outcome.action === 'ADD_BINDING' ? 'added' : 'removed'} by applying finding ${outcome.findingId}`,
      });
      const byCategory = await this.findingsService.markFindingsStale({
        categoryId: outcome.categoryId,
        issueTypes: BINDING_FAMILY_ISSUE_TYPES,
        reason: `Binding ${outcome.action === 'ADD_BINDING' ? 'added' : 'removed'} by applying finding ${outcome.findingId}`,
      });
      return byAttribute.staledCount + byCategory.staledCount;
    } catch (error) {
      this.logger.warn(
        `Failed to reconcile binding findings after applying ${outcome.findingId}: ${String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Records a security audit entry through the established audit service.
   *
   * Runs after commit because `SecurityAuditService` writes with the root client and
   * is not transaction-aware; an audit failure must never roll back an application
   * that already succeeded. Binding edits have no audit trail today, so this adds one
   * rather than preserving existing behaviour.
   */
  private async recordSecurityAudit(
    outcome: Omit<ApplyAttributeFindingResult, 'staledFindingCount'>,
  ): Promise<void> {
    try {
      await this.securityAudit.record({
        action: SECURITY_AUDIT_ACTION,
        category: 'Inventory',
        userId: outcome.appliedById,
        userEmail: outcome.appliedByEmail,
        details: {
          findingId: outcome.findingId,
          issueType: outcome.issueType,
          action: outcome.action,
          attributeDefinitionId: outcome.attributeDefinitionId,
          attributeCode: outcome.attributeCode,
          attributeName: outcome.attributeName,
          categoryId: outcome.categoryId,
          categoryCode: outcome.categoryCode,
          categoryName: outcome.categoryName,
          before: outcome.previousState,
          after: outcome.appliedState,
          applicationResult: outcome.applicationResult,
          fingerprint: outcome.fingerprint,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record audit event for applied finding ${outcome.findingId}: ${String(error)}`,
      );
    }
  }

  private describeStaleReason(
    metadata: Record<string, unknown> | null,
  ): string {
    const reason = metadata?.staleReason;
    return typeof reason === 'string' && reason.length > 0
      ? reason
      : 'the attribute library changed after this finding was generated';
  }
}

/**
 * The `field` recorded on a feedback row.
 *
 * Mirrors the decision path's resolution (`attribute-finding.service.ts`) so every
 * feedback row for one finding is queryable by a single `field` value; the action is
 * carried in metadata instead of splitting the field vocabulary.
 */
function resolveFeedbackField(finding: {
  field: string | null;
  issueType: string;
}): string {
  const field = finding.field;
  if (typeof field === 'string' && field.length > 0) return field;
  return finding.issueType.toLowerCase();
}

/** Milliseconds to two decimals, matching the HTTP interceptor's precision. */
function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
