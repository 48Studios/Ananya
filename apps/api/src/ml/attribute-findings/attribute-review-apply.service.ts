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
  AttributeDefinition as AttributeDefinitionAggregate,
  AttributeOption as AttributeOptionAggregate,
  type CategoryAttributeRepository,
} from '@ananya/inventory';
import {
  DrizzleAttributeDefinitionRepository,
  DrizzleAttributeOptionRepository,
  DrizzleCategoryAttributeRepository,
} from '../../infrastructure/repositories/drizzle-attribute.repository';
import { SecurityAuditService } from '../../security-audit/security-audit.service';
import {
  AttributeIntelligenceFindingsService,
  type StalenessSubject,
} from './attribute-finding.service';
import type { AttributeFindingDto } from './attribute-finding.dtos';
import {
  findProposalCollision,
  readAttributeDefinitionProposal,
  validateAttributeDefinitionProposal,
  type AttributeDefinitionProposal,
} from './attribute-definition-proposal';
import { loadUnitCatalog } from '../current-attribute-value';
import {
  getPostgresErrorCode,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/postgres-error';
import {
  resolveAttributeApplyRule,
  resolveAttributeApplyAction,
  type ApplyAttributeFindingDto,
  type ApplyAttributeFindingResult,
  type AttributeApplyAction,
  type AttributeApplyConflictReason,
} from './attribute-review-apply.dtos';
import {
  applyTransactionTimeouts,
  classifyApplyTimeout,
  resolveAttributeApplyTimeouts,
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
  /** Present only for `CREATE_DEFINITION`, which has an extra existence check. */
  collisionCheckMs?: number;
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
  /** Identity of a definition this attempt created, when it created one. */
  createdDefinitionId?: string | null;
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

/** The category an application binds into, read inside the transaction. */
interface ResolvedCategory {
  id: string;
  code: string;
  name: string;
}

/**
 * What an application is about to do, once its target is verified and locked.
 *
 * Two shapes rather than one, because `CREATE_DEFINITION` is the only action whose
 * subject does not exist yet: it has a validated *proposal* instead of a resolved
 * definition. Keeping them separate is what stops the mutation step from having to
 * guess whether an id it holds is real, and it makes the compile-time rule the
 * same as the domain rule — a definition is created from a proposal, a binding
 * from a resolved target.
 */
type TargetResolution =
  | {
      kind: 'BINDING';
      action: 'ADD_BINDING' | 'REMOVE_BINDING';
      target: ResolvedTarget;
    }
  | {
      kind: 'DEFINITION';
      proposal: AttributeDefinitionProposal;
      category: ResolvedCategory;
    };

/**
 * The finding state `resolveTarget` needs.
 *
 * `StalenessSubject` plus the proposed state, because the create branch has to read
 * the proposal and `suggestedValue` is where the producer recorded it — the
 * persisted finding is the only source for what may be created.
 */
type ApplyFindingSubject = StalenessSubject & {
  issueType: string;
  suggestedValue: Record<string, unknown> | null;
};

/** The definition a `CREATE_DEFINITION` application created. */
interface CreatedDefinitionSummary {
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  optionCount: number;
}

/** What the mutation step actually wrote, in the form the rest of the flow needs. */
interface MutationOutcome {
  /** The entity the application acted on, resolved to its final identity. */
  target: ResolvedTarget;
  sortOrder: number | null;
  /** The binding created or removed, when the action touched one. */
  bindingId: string | null;
  /** Set only by `CREATE_DEFINITION`. */
  createdDefinition: CreatedDefinitionSummary | null;
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
  private readonly timeouts: ApplyTimeoutConfig =
    resolveAttributeApplyTimeouts();

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
        //
        //    The action is resolved from persisted state rather than from the
        //    family alone, because `MISSING_EXPECTED_ATTRIBUTE` settles two ways:
        //    bind a definition that exists, or create the one that does not. A
        //    finding that names no definition while its producer claimed one exists
        //    is the audit's ambiguous case and resolves to no action at all, which
        //    is reported as an unusable target rather than as an unsupported family.
        const rule = resolveAttributeApplyRule(finding.issueType);
        if (!rule) {
          throw new AttributeApplyConflictError(
            'UNSUPPORTED_FINDING_TYPE',
            `Findings of type '${finding.issueType}' cannot be applied. Only attribute bindings can be applied; duplicate and unused findings are review-only because the domain has no merge or retirement operation.`,
          );
        }
        const resolvedAction = resolveAttributeApplyAction(finding);
        if (!resolvedAction) {
          throw new AttributeApplyConflictError(
            'UNSUPPORTED_TARGET',
            `This finding expects an attribute for its category, but the definition could not be resolved and is not clearly absent either, so there is nothing to bind and nothing to create. Re-run the library audit to refresh it.`,
          );
        }
        if (resolvedAction !== input.action) {
          throw new AttributeApplyConflictError(
            'UNSUPPORTED_ACTION',
            `Finding '${id}' applies ${resolvedAction}, not ${input.action}.`,
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
        //
        //    For `CREATE_DEFINITION` this also builds and validates the proposal from
        //    the finding — nothing about it comes from the request — and it does so
        //    before the expected-state gate for the same reason: "this attribute
        //    already exists" is the more informative refusal.
        const resolution = await phase('targetResolutionMs', () =>
          this.resolveTarget({
            tx: client,
            finding,
            action: input.action,
          }),
        );

        // 5b. A proposal that already exists in the library is not created again. The
        //     premise of the finding ("this category has no such attribute") no longer
        //     holds, so the finding is retired through the ordinary staleness mechanism
        //     and the refusal is raised only after that bookkeeping commits — exactly
        //     the protocol the expected-state gate uses below. Creating a second
        //     definition is never an option.
        if (resolution.kind === 'DEFINITION') {
          const collision = await phase('collisionCheckMs', () =>
            this.findDefinitionCollision(resolution.proposal, client),
          );
          if (collision) {
            await this.findingsService.markFindingStaleInTransaction(
              finding.id,
              collision,
              client,
            );
            return {
              applied: false as const,
              reason: 'TARGET_ALREADY_EXISTS' as AttributeApplyConflictReason,
              message: `${collision}. Nothing was created — re-run the library audit to refresh this finding into a binding suggestion.`,
            };
          }
        }

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
            resolution,
          }),
        );

        const target = mutation.target;
        const createdDefinition = mutation.createdDefinition;
        if (createdDefinition) {
          logContext.createdDefinitionId = createdDefinition.id;
        }

        const appliedAt = new Date();
        const { previousState, appliedState } = describeTransition({
          action: input.action,
          target,
          createdDefinition,
        });

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
              // Recorded only when this application created the definition, so an
              // applied finding says exactly which record it added to the library.
              bindingId: mutation.bindingId,
              createdDefinition,
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
            bindingId: mutation.bindingId,
            createdDefinition,
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
   *
   * `CREATE_DEFINITION` (Pass 7) takes the other branch. Its subject does not exist
   * yet, so there is no attribute row to lock: it locks the category it will bind
   * into, verifies it is active, and builds the proposal from the finding. The
   * definition's *absence* is what the caller checks next, and the proposal is
   * validated here so an unusable one is refused before any existence check has a
   * chance to write a staleness record for a finding that is merely malformed.
   */
  private async resolveTarget(input: {
    tx: DbExecutor;
    finding: ApplyFindingSubject;
    action: AttributeApplyAction;
  }): Promise<TargetResolution> {
    const { tx, finding, action } = input;

    const attributeDefinitionId = finding.attributeDefinitionId;
    const categoryId = finding.categoryId;

    if (action === 'CREATE_DEFINITION') {
      return this.resolveDefinitionTarget({ tx, finding, categoryId });
    }

    // Both binding actions operate on a binding, which needs both sides. A
    // category-first finding whose attribute was never defined has no binding to
    // change; the create branch above handles the case where one should be made.
    if (!attributeDefinitionId) {
      throw new AttributeApplyConflictError(
        'UNSUPPORTED_TARGET',
        'This finding expects an attribute that does not exist in the library yet, so there is no binding to change. It cannot be created from here either: re-run the library audit to refresh it, then apply the resulting suggestion.',
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
      kind: 'BINDING',
      action,
      target: {
        attributeDefinitionId: attribute.id,
        attributeCode: attribute.code,
        attributeName: attribute.name,
        categoryId: category.id,
        categoryCode: category.code,
        categoryName: category.name,
      },
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
  /**
   * Builds and validates the proposal for a `CREATE_DEFINITION` application.
   *
   * The whole proposal comes from the persisted finding — the request cannot carry
   * one, which is what keeps this route from becoming a general attribute-library
   * write API. Two things happen here:
   *
   *  1. the category the expectation belongs to is locked and must exist and be
   *     active. There is no attribute row to lock: the point of the action is that it
   *     does not exist. Locking the category therefore also serialises two applies
   *     that would bind different attributes into the same category, in the same
   *     order the binding actions use (attribute then category, category-only here).
   *  2. the proposal is validated against the domain's vocabulary and the unit
   *     catalogue. Validation runs before the existence check in the caller so a
   *     malformed proposal is refused without writing a staleness record — the
   *     finding is not stale, the producer is wrong.
   */
  private async resolveDefinitionTarget(input: {
    tx: DbExecutor;
    finding: ApplyFindingSubject;
    categoryId: string | null;
  }): Promise<TargetResolution> {
    const { tx, finding, categoryId } = input;

    if (!categoryId) {
      throw new AttributeApplyConflictError(
        'UNSUPPORTED_TARGET',
        'This finding does not identify the category the attribute is expected for, so there is no binding to create.',
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
    if (!category.isActive) {
      throw new AttributeApplyConflictError(
        'TARGET_INACTIVE',
        `The category "${category.name}" is inactive and cannot receive new attribute bindings.`,
      );
    }

    const read = readAttributeDefinitionProposal(finding);
    if ('refusal' in read) {
      throw new AttributeApplyConflictError(
        read.refusal.reason,
        read.refusal.message,
      );
    }

    const units = await loadUnitCatalog(tx);
    const refusal = validateAttributeDefinitionProposal({
      proposal: read.proposal,
      units,
    });
    if (refusal) {
      throw new AttributeApplyConflictError(refusal.reason, refusal.message);
    }

    return {
      kind: 'DEFINITION',
      proposal: read.proposal,
      category: {
        id: category.id,
        code: category.code,
        name: category.name,
      },
    };
  }

  /**
   * Whether the proposed attribute already exists in the library.
   *
   * Returns a human-readable reason when it does, so the caller can retire the
   * finding with an explanation, and `null` when creation is safe. The check runs
   * inside the transaction against the transaction's own snapshot, after the
   * category lock, so a definition another reviewer created a moment ago is seen.
   *
   * The comparison is the audit's: a definition is identified by its code, name *and*
   * aliases through the same reduced key the producer uses, and a key two definitions
   * already claim counts as existing. Anything else would let this path create a
   * definition that the next audit immediately reports as a duplicate of an existing
   * one.
   */
  private async findDefinitionCollision(
    proposal: AttributeDefinitionProposal,
    client: DbExecutor,
  ): Promise<string | null> {
    const definitions = await new DrizzleAttributeDefinitionRepository(
      client,
    ).findMany();

    const collision = findProposalCollision({ proposal, definitions });
    if (!collision) return null;

    if (collision.ambiguous) {
      return `The library already contains more than one attribute matching '${proposal.code}', so creating a definition for it would be ambiguous`;
    }

    const match = collision.definition;
    const matchedOn =
      collision.matchedOn === 'code'
        ? 'code'
        : collision.matchedOn === 'name'
          ? 'name'
          : 'alias';
    const clause = match
      ? `'${match.code}' (${match.name})`
      : `'${proposal.code}'`;
    return `The attribute ${clause} already exists in the library and matches the proposed ${matchedOn}`;
  }

  /**
   * Performs the authoritative mutation through the domain aggregate.
   *
   * The repository is constructed against the transaction's executor, so it
   * participates in the same transaction as the finding transition and the feedback
   * row. Domain refusals are translated into the conflict vocabulary rather than
   * escaping as a 500.
   *
   * `CREATE_DEFINITION` is the only branch that writes more than one kind of row:
   * the definition, its options when the proposal carries any, and the binding that
   * resolves the expectation. All three are written through their aggregates with
   * this transaction's executor, which is what makes the whole application atomic —
   * a failure at any point leaves no definition, no option and no binding behind.
   */
  private async performMutation(input: {
    tx: DbExecutor;
    action: AttributeApplyAction;
    resolution: TargetResolution;
  }): Promise<MutationOutcome> {
    if (input.resolution.kind === 'DEFINITION') {
      return this.createDefinition(
        input.tx,
        input.resolution.proposal,
        input.resolution.category,
      );
    }

    const { target } = input.resolution;
    const repository: CategoryAttributeRepository =
      new DrizzleCategoryAttributeRepository(input.tx);

    try {
      if (input.action === 'ADD_BINDING') {
        const existing = await repository.findByAttributeDefinitionId(
          target.attributeDefinitionId,
        );
        // Append after the category's existing attributes, matching how the
        // attribute UI orders a new binding; the exact value is presentational.
        const sortOrder =
          existing.length === 0
            ? 10
            : Math.max(...existing.map((binding) => binding.sortOrder)) + 10;

        const binding = CategoryAttribute.create({
          categoryId: target.categoryId,
          attributeDefinitionId: target.attributeDefinitionId,
          isRequired: false,
          sortOrder,
        });
        const saved = await repository.save(binding);
        return {
          target,
          sortOrder,
          bindingId: saved.id,
          createdDefinition: null,
        };
      }

      const removed = await repository.delete(
        target.categoryId,
        target.attributeDefinitionId,
      );
      if (!removed) {
        // Someone removed the binding between the check above and this write.
        // Reporting success would be a lie about the library.
        throw new AttributeApplyConflictError(
          'FINDING_STALE',
          'The binding was removed by someone else while this application was running. The finding no longer describes the library — re-run the audit to refresh it.',
        );
      }
      return {
        target,
        sortOrder: null,
        bindingId: null,
        createdDefinition: null,
      };
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
   * Creates the definition the proposal describes, binds it to its category, and
   * reports the new identities.
   *
   * Order inside the transaction: definition, then options, then binding. The
   * definition must exist before either dependent row, and the binding last so the
   * expectation the finding asserted is closed only once the attribute is fully
   * representable.
   *
   * A unique violation is possible despite the pre-checks — a concurrent creation
   * outside this transaction, or an option code that the option table's own unique
   * index rejects — so it is translated into `TARGET_ALREADY_EXISTS` rather than
   * escaping as a 500. The check above is the ordinary path; this is the
   * defence-in-depth the contract requires for a predictable conflict.
   */
  private async createDefinition(
    tx: DbExecutor,
    proposal: AttributeDefinitionProposal,
    category: ResolvedCategory,
  ): Promise<MutationOutcome> {
    const definitionRepository = new DrizzleAttributeDefinitionRepository(tx);
    const optionRepository = new DrizzleAttributeOptionRepository(tx);
    const bindingRepository: CategoryAttributeRepository =
      new DrizzleCategoryAttributeRepository(tx);

    let definitionId: string;
    let definitionRow: {
      id: string;
      code: string;
      name: string;
      dataType: string;
      unitCategory: string | null;
      defaultUnit: string | null;
    };

    try {
      const definition = AttributeDefinitionAggregate.create({
        code: proposal.code,
        name: proposal.name,
        description: proposal.description,
        dataType: proposal.dataType as NonNullable<
          AttributeDefinitionProposal['dataType']
        >,
        unitCategory: proposal.unitCategory,
        defaultUnit: proposal.defaultUnit,
        groupName: proposal.groupName,
        aliases: proposal.aliases,
      });
      const saved = await definitionRepository.save(definition);
      definitionId = saved.id;
      definitionRow = {
        id: saved.id,
        code: saved.code,
        name: saved.name,
        dataType: saved.dataType,
        unitCategory: saved.unitCategory ?? null,
        defaultUnit: saved.defaultUnit ?? null,
      };

      for (const option of proposal.options) {
        await optionRepository.save(
          AttributeOptionAggregate.create({
            attributeDefinitionId: saved.id,
            code: option.code,
            label: option.label,
            sortOrder: option.sortOrder,
          }),
        );
      }
    } catch (error) {
      throw this.translateDefinitionWriteFailure(error);
    }

    const existing =
      await bindingRepository.findByAttributeDefinitionId(definitionId);
    const sortOrder =
      existing.length === 0
        ? 10
        : Math.max(...existing.map((binding) => binding.sortOrder)) + 10;

    let bindingId: string | null = null;
    try {
      const binding = CategoryAttribute.create({
        categoryId: category.id,
        attributeDefinitionId: definitionId,
        isRequired: proposal.isRequired,
        sortOrder,
      });
      const savedBinding = await bindingRepository.save(binding);
      bindingId = savedBinding.id;
    } catch (error) {
      throw this.translateDefinitionWriteFailure(error);
    }

    return {
      target: {
        attributeDefinitionId: definitionRow.id,
        attributeCode: definitionRow.code,
        attributeName: definitionRow.name,
        categoryId: category.id,
        categoryCode: category.code,
        categoryName: category.name,
      },
      sortOrder,
      bindingId,
      createdDefinition: {
        id: definitionRow.id,
        code: definitionRow.code,
        name: definitionRow.name,
        dataType: definitionRow.dataType,
        unitCategory: definitionRow.unitCategory,
        defaultUnit: definitionRow.defaultUnit,
        optionCount: proposal.options.length,
      },
    };
  }

  /**
   * Turns a creation failure into the route's conflict vocabulary.
   *
   * A unique violation means the library gained a definition (or an option code)
   * that collides with this proposal between the check and the write, which is
   * exactly what `TARGET_ALREADY_EXISTS` describes; a domain error is
   * `DOMAIN_REFUSED` with the aggregate's own message. Anything else stays
   * unexpected, so a real infrastructure failure is never dressed up as a conflict.
   */
  private translateDefinitionWriteFailure(error: unknown): Error {
    if (error instanceof AttributeApplyConflictError) return error;

    const code = getPostgresErrorCode(error);
    if (code === POSTGRES_UNIQUE_VIOLATION) {
      return new AttributeApplyConflictError(
        'TARGET_ALREADY_EXISTS',
        'The attribute library gained a matching attribute or option while this application was running. Nothing was created — re-run the library audit to refresh this finding.',
      );
    }

    return new AttributeApplyConflictError(
      'DOMAIN_REFUSED',
      `The attribute domain refused to create the definition: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  /**
   * Records the application in the existing telemetry ledger.
   *
   * Uses `ai_suggestion_feedback` rather than a new table. `userAction` stays within
   * the ledger's existing `ACCEPTED | REJECTED | EDITED` vocabulary — an application
   * is recorded as ACCEPTED with a distinguishing `action` in metadata, the same
   * convention the component apply path uses, so existing feedback queries keep
   * working.
   *
   * A `CREATE_DEFINITION` application records the created definition and the binding
   * in metadata as well as in `finalValue`, so the ledger says what was added to the
   * library rather than only which rule was accepted.
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
    mutation: MutationOutcome;
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
          bindingId: input.mutation.bindingId,
          createdDefinition: input.mutation.createdDefinition,
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
          bindingId: input.mutation.bindingId,
          createdDefinitionId: input.mutation.createdDefinition?.id ?? null,
          createdDefinitionCode: input.mutation.createdDefinition?.code ?? null,
          createdDefinitionDataType:
            input.mutation.createdDefinition?.dataType ?? null,
          createdDefinitionUnitCategory:
            input.mutation.createdDefinition?.unitCategory ?? null,
          createdDefinitionOptionCount:
            input.mutation.createdDefinition?.optionCount ?? null,
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
   * **`CREATE_DEFINITION` is scoped to the created definition, never the category.**
   * The category-wide sweep the binding actions perform would retire every other
   * expectation for that category — creating `termination` would stale "this
   * category is missing `operating_temperature`" — which is false: each expectation
   * depends on its own attribute being bound, exactly as
   * `describeExpectedAttributeStaleness` encodes. The created definition is brand
   * new, so no existing finding references it and the correct number of siblings to
   * retire is zero. A second finding expecting the *same* code in a different
   * category is genuinely still valid and stays applicable.
   *
   * Best-effort: the mutation is committed and the finding truthfully records it, so
   * a failure here must not turn a successful application into an error.
   */
  private async reconcileBindingFindings(
    outcome: Omit<ApplyAttributeFindingResult, 'staledFindingCount'>,
  ): Promise<number> {
    const verb =
      outcome.action === 'CREATE_DEFINITION'
        ? 'created'
        : outcome.action === 'ADD_BINDING'
          ? 'added'
          : 'removed';

    try {
      const byAttribute = await this.findingsService.markFindingsStale({
        attributeDefinitionId: outcome.attributeDefinitionId,
        issueTypes: BINDING_FAMILY_ISSUE_TYPES,
        reason: `Binding ${verb} by applying finding ${outcome.findingId}`,
      });

      if (outcome.action === 'CREATE_DEFINITION') {
        return byAttribute.staledCount;
      }

      const byCategory = await this.findingsService.markFindingsStale({
        categoryId: outcome.categoryId,
        issueTypes: BINDING_FAMILY_ISSUE_TYPES,
        reason: `Binding ${verb} by applying finding ${outcome.findingId}`,
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
          // Present only for a creation, so the audit trail distinguishes "added a
          // definition to the library" from "edited a binding" without inferring it
          // from the action name alone.
          createdDefinition: outcome.createdDefinition,
          bindingId: outcome.bindingId,
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

/**
 * The human-readable before/after pair recorded on the finding, the feedback row and
 * the security audit.
 *
 * A binding transition is described in the library's own terms, unchanged from Pass
 * 4. Creating a definition is described as creating *and* binding it, because that is
 * what happened: a `CREATE_DEFINITION` that left the category unbound would not have
 * resolved the expectation the reviewer approved.
 */
function describeTransition(input: {
  action: AttributeApplyAction;
  target: ResolvedTarget;
  createdDefinition: CreatedDefinitionSummary | null;
}): { previousState: string; appliedState: string } {
  if (input.action === 'ADD_BINDING') {
    return { previousState: 'Not bound', appliedState: 'Bound' };
  }
  if (input.action === 'REMOVE_BINDING') {
    return { previousState: 'Bound', appliedState: 'Not bound' };
  }

  const created = input.createdDefinition;
  const name = created?.name ?? input.target.attributeName;
  const code = created?.code ?? input.target.attributeCode;
  return {
    previousState: `No attribute '${code}' in the library`,
    appliedState: `Created '${name}' (${code}) and bound it to '${input.target.categoryName}'`,
  };
}

/** Milliseconds to two decimals, matching the HTTP interceptor's precision. */
function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
