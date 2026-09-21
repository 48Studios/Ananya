import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db, type DbExecutor } from '@ananya/database';
import {
  aiSuggestionFeedback,
  type AttributeIntelligenceFinding,
} from '@ananya/database/schema';
import {
  INTELLIGENCE_FINDING_STATUSES,
  canDecide,
  mapDecisionToFeedbackAction,
} from '../intelligence-findings';
import {
  ATTRIBUTE_REVIEW_ISSUE_CATEGORIES,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  resolveAttributeIssueCategory,
  validateAttributeFindingSubject,
  type AttributeFindingDto,
  type AttributeFindingListQuery,
  type AttributeFindingQueuePage,
  type AttributeFindingQueueSummary,
  type AttributeFindingReviewer,
  type AttributeFindingSubject,
  type AttributeReviewIssueCategory,
  type AttributeReviewStatus,
  type ConfidenceLevel,
  type MarkAttributeFindingsStaleInput,
  type MarkAttributeFindingsStaleResult,
  type PersistAttributeFindingInput,
  type PersistAttributeFindingsResult,
  type RecordAttributeFindingDecisionInput,
  type ReconcileAttributeFindingsInput,
} from './attribute-finding.dtos';
import {
  AttributeFindingRepository,
  type AttributeFindingUpsertRow,
} from './attribute-finding.repository';
import { buildAttributeFindingFingerprint } from './attribute-finding.fingerprint';
import { describeAttributeFindingStaleness } from './attribute-finding-expected-state';
import { readAttributeFindingLiveState } from './attribute-finding-live-state';

/**
 * Attribute Intelligence findings service.
 *
 * Owns the review *workflow* for attribute-library findings: fingerprinting,
 * idempotent persistence, queue reads, lifecycle validation, and decision
 * recording (with its feedback row).
 *
 * It deliberately owns none of the following, all of which belong to later
 * passes:
 *
 *  - the detection rules that decide *what* is worth reviewing (that is an
 *    analyzer, which will call `persistFindings`);
 *  - attribute definition, binding or option mutation (that is the apply pass, and
 *    it will use the existing `@ananya/inventory` aggregates and repositories
 *    through the same executor pattern);
 *  - any HTTP surface (no controller is added in this pass, so nothing can reach
 *    this service unguarded).
 *
 * The separation is what lets a future `AttributeIntelligenceAnalyzer` depend on
 * this service without this service depending on the analyzer — the persistence
 * layer stays usable by any producer, ML-backed or deterministic.
 *
 * A default repository instance is created for callers that have no transaction
 * (the global client). A caller holding a transaction passes its executor to
 * {@link withExecutor}, and every read and write in that call chain participates
 * in the transaction.
 */
@Injectable()
export class AttributeIntelligenceFindingsService {
  private readonly logger = new Logger(
    AttributeIntelligenceFindingsService.name,
  );

  constructor(
    private readonly repository: AttributeFindingRepository = new AttributeFindingRepository(),
  ) {}

  /**
   * Binds this service to a caller-owned transaction.
   *
   * Returns a service instance backed by the same logic but a transaction-scoped
   * repository, so an apply pass can run "lock finding → verify state → mutate
   * domain → update finding → insert feedback" atomically without this class
   * needing to know about transactions itself.
   */
  withExecutor(executor: DbExecutor): AttributeIntelligenceFindingsService {
    return new AttributeIntelligenceFindingsService(
      new AttributeFindingRepository(executor),
    );
  }

  /**
   * Persists findings idempotently by fingerprint.
   *
   * Subject validation happens before any write, so a finding that nobody could
   * review (for example a binding suggestion with no category) is rejected with a
   * 400 instead of entering the queue. Subject references that are supplied as ids
   * are checked to exist: a finding pointing at a deleted definition would be
   * unreviewable, and the database would otherwise have to reject it as an FK
   * violation after the fact.
   *
   * The service never creates an attribute definition, binding or option. If a
   * suggestion concerns something that does not exist yet, it carries the
   * canonical code and `attributeDefinitionId` stays null.
   */
  async persistFindings(
    inputs: PersistAttributeFindingInput[],
  ): Promise<PersistAttributeFindingsResult> {
    if (inputs.length === 0) {
      return {
        persistedCount: 0,
        createdCount: 0,
        refreshedCount: 0,
        revivedCount: 0,
        findings: [],
      };
    }

    const rows: AttributeFindingUpsertRow[] = [];

    for (const input of inputs) {
      const issueCategory =
        input.issueCategory ?? resolveAttributeIssueCategory(input.issueType);
      if (!issueCategory) {
        throw new BadRequestException(
          `Unknown attribute review issue type '${input.issueType}'. Valid types: ${ATTRIBUTE_REVIEW_ISSUE_CATEGORIES.join(', ')}.`,
        );
      }
      validateIssueCategory(input.issueType, issueCategory);

      const subject = readSubject(input);
      const violation = validateAttributeFindingSubject({
        issueType: input.issueType,
        subject,
      });
      if (violation) {
        throw new BadRequestException(violation);
      }

      const field = input.field?.trim() || null;
      const fingerprint = buildAttributeFindingFingerprint({
        issueType: input.issueType,
        subject,
        currentState: input.currentValue ?? null,
        suggestedState: input.suggestedValue ?? null,
        field,
        intelligenceVersion: input.intelligenceVersion ?? null,
      });

      const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
      // Codes travel in metadata so the queue can render a subject that has not
      // been created yet, and so a later apply pass can resolve it by code.
      if (input.attributeCode) metadata.attributeCode = input.attributeCode;
      if (input.categoryCode) metadata.categoryCode = input.categoryCode;
      if (input.optionCode) metadata.optionCode = input.optionCode;
      if (field) metadata.field = field;

      rows.push({
        attributeDefinitionId: subject.attributeDefinitionId ?? null,
        relatedAttributeDefinitionId:
          subject.relatedAttributeDefinitionId ?? null,
        categoryId: subject.categoryId ?? null,
        optionId: subject.optionId ?? null,
        issueType: input.issueType,
        issueCategory,
        field,
        title: input.title,
        description: input.description,
        currentValue: input.currentValue ?? null,
        suggestedValue: input.suggestedValue ?? null,
        confidence:
          input.confidence === undefined || input.confidence === null
            ? null
            : String(input.confidence),
        confidenceLevel: input.confidenceLevel ?? null,
        evidence: input.evidence ?? [],
        source: input.source,
        modelVersion: input.modelVersion ?? null,
        intelligenceVersion: input.intelligenceVersion ?? null,
        fingerprint,
        metadata,
      });
    }

    await this.assertSubjectsExist(rows);

    // Classified before the write so the caller can tell a first audit from a
    // repeat one. A concurrent run can only make these counts conservative — the
    // row-level guarantee is the unique index, not this read.
    const existingStatuses = await this.repository.classifyFingerprints(
      rows.map((row) => row.fingerprint),
    );

    const persisted = await this.repository.upsertMany(rows);

    let createdCount = 0;
    let refreshedCount = 0;
    let revivedCount = 0;
    for (const row of rows) {
      const previousStatus = existingStatuses.get(row.fingerprint);
      if (!previousStatus) createdCount += 1;
      else if (previousStatus === 'STALE') revivedCount += 1;
      else refreshedCount += 1;
    }

    this.logger.log(
      `Persisted ${persisted.length} attribute intelligence finding(s) (${createdCount} created, ${refreshedCount} refreshed, ${revivedCount} revived).`,
    );

    return {
      persistedCount: persisted.length,
      createdCount,
      refreshedCount,
      revivedCount,
      findings: persisted.map(toFindingDto),
    };
  }

  /**
   * Reads one finding. `notFound` is a 404 rather than an empty result so callers
   * cannot confuse "no such finding" with "no findings".
   */
  async getFinding(id: string): Promise<AttributeFindingDto> {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new NotFoundException(`Attribute finding '${id}' not found`);
    }
    return toFindingDto(row);
  }

  /** Reads a finding by its deterministic identity, or `null` when absent. */
  async findFindingByFingerprint(
    fingerprint: string,
  ): Promise<AttributeFindingDto | null> {
    const row = await this.repository.findByFingerprint(fingerprint);
    return row ? toFindingDto(row) : null;
  }

  /**
   * Filtered, paginated queue read.
   *
   * `summary` counts ignore the status filter (so queue tabs always show true
   * totals) while `total`/`items` honour every filter, matching the component
   * queue's established behaviour.
   *
   * Not exposed over HTTP in this pass: the service contract exists so the next
   * pass can add a guarded controller without redesigning the query surface.
   */
  async listFindings(
    query: AttributeFindingListQuery = {},
  ): Promise<AttributeFindingQueuePage> {
    const normalized = this.normalizeQuery(query);

    const [{ rows, total }, statusCounts, categoryCounts] = await Promise.all([
      this.repository.list(normalized),
      this.repository.countByStatus(normalized),
      this.repository.countByIssueCategory(normalized),
    ]);

    const summary: AttributeFindingQueueSummary = {
      total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
      pending: statusCounts.PENDING ?? 0,
      accepted: statusCounts.ACCEPTED ?? 0,
      rejected: statusCounts.REJECTED ?? 0,
      dismissed: statusCounts.DISMISSED ?? 0,
      stale: statusCounts.STALE ?? 0,
      byCategory: categoryCounts,
    };

    return {
      summary,
      items: rows.map(toFindingDto),
      total,
      page: normalized.page ?? 1,
      pageSize: Math.min(
        MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
        normalized.pageSize ?? 20,
      ),
    };
  }

  /**
   * Counts findings grouped by issue family.
   *
   * Ignores the query's own `issueType` filter, for the same reason
   * {@link listFindings} ignores the status filter: family tabs show how many
   * findings exist per family, not how many match the family currently selected.
   */
  countByIssueType(
    query: AttributeFindingListQuery = {},
  ): Promise<Record<string, number>> {
    return this.repository.countByIssueType(query);
  }

  /**
   * Records a reviewer decision and appends the matching AI feedback row
   * atomically.
   *
   * This is a decision only: it does NOT mutate attribute data. Applying a finding
   * is a separate operation owned by a later pass, which is why `status` and
   * "applied" are distinct concepts in this model.
   *
   * Ordering, and why:
   *  1. read the finding (404 when absent);
   *  2. refuse a decision the current status does not permit (terminal states can
   *     never be overwritten, and a STALE finding can never be accepted);
   *  3. refuse a stale revision (`expectedFingerprint`);
   *  4. refuse a finding whose expected state no longer holds, retiring it as STALE;
   *  5. transactionally: guarded update → feedback insert. The guarded update is
   *     the concurrency control, so two reviewers racing decide exactly one
   *     outcome and the loser gets a 409.
   *
   * Step 4 is why a persisted finding carries `metadata.expectedState`: it lets the
   * decision path detect — between audits — that the world moved. A finding with no
   * expected state (a hand-written one, or one from a producer that did not snapshot
   * state) skips the check rather than being judged on nothing; the next audit
   * reconciles it.
   */
  async recordDecision(
    id: string,
    input: RecordAttributeFindingDecisionInput,
    reviewer?: AttributeFindingReviewer,
  ): Promise<AttributeFindingDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Attribute finding '${id}' not found`);
    }

    const currentStatus = existing.status as AttributeReviewStatus;
    if (!canDecide(currentStatus, input.decision)) {
      throw new ConflictException(
        currentStatus === 'STALE'
          ? `Finding '${id}' is stale (${this.describeStaleReason(existing)}). Re-run attribute analysis before accepting it.`
          : `Finding '${id}' is already ${currentStatus.toLowerCase()} and cannot be decided again.`,
      );
    }

    if (
      input.expectedFingerprint &&
      input.expectedFingerprint !== existing.fingerprint
    ) {
      throw new ConflictException(
        'This finding changed since it was loaded. Refresh the queue and try again.',
      );
    }

    const staleReason = await this.detectExpectedStateStaleness(existing);
    if (staleReason) {
      await this.markFindingsStale({ ids: [existing.id], reason: staleReason });
      throw new ConflictException(
        `Finding '${id}' is stale (${staleReason}). Re-run attribute analysis to refresh it.`,
      );
    }

    const reviewedAt = new Date();
    const hasFinalValue = input.finalValue !== undefined;

    const decided = await db.transaction(async (tx) => {
      const updated = await this.repository.applyDecision(
        {
          id,
          decision: input.decision,
          reviewerId: reviewer?.id ?? null,
          reviewerEmail: reviewer?.email ?? null,
          reviewedAt,
          decisionNotes: input.decisionNotes ?? null,
          metadataPatch: {
            decision: input.decision,
            decisionNotes: input.decisionNotes ?? null,
            finalValue: hasFinalValue ? input.finalValue : null,
          },
        },
        tx as unknown as DbExecutor,
      );

      if (!updated) return null;

      await tx.insert(aiSuggestionFeedback).values({
        // Attribute findings are about the attribute library, so the feedback's
        // subject is the attribute and/or category; `component_id` stays null.
        componentId: null,
        attributeDefinitionId: updated.attributeDefinitionId ?? null,
        categoryId: updated.categoryId ?? null,
        suggestionType: updated.issueType,
        field: resolveFeedbackField(updated),
        predictedValue: updated.suggestedValue ?? null,
        confidence: updated.confidence,
        confidenceLevel: updated.confidenceLevel ?? 'MEDIUM',
        evidence: updated.evidence ?? [],
        modelVersion: updated.modelVersion ?? '1.0.0',
        userAction: mapDecisionToFeedbackAction(input.decision, hasFinalValue),
        finalValue: hasFinalValue
          ? input.finalValue
          : input.decision === 'ACCEPTED'
            ? (updated.suggestedValue ?? null)
            : null,
        reviewerId: reviewer?.id ?? null,
        reviewerEmail: reviewer?.email ?? null,
        metadata: {
          findingId: updated.id,
          findingTable: 'attribute_intelligence_findings',
          issueCategory: updated.issueCategory,
          issueType: updated.issueType,
          decision: input.decision,
          decisionNotes: input.decisionNotes ?? null,
          intelligenceVersion: updated.intelligenceVersion ?? null,
          // The finding's subject references are recorded so the feedback row
          // remains interpretable even after the finding itself is deleted.
          relatedAttributeDefinitionId:
            updated.relatedAttributeDefinitionId ?? null,
          optionId: updated.optionId ?? null,
        },
      });

      return updated;
    });

    if (!decided) {
      throw new ConflictException(
        `Finding '${id}' was decided by another reviewer. Refresh the queue to see the current state.`,
      );
    }

    return toFindingDto(decided);
  }

  /**
   * Marks PENDING findings STALE.
   *
   * Terminal decisions are never touched: a decision is review history and must
   * survive a later change to the record it was about.
   */
  async markFindingsStale(
    input: MarkAttributeFindingsStaleInput,
  ): Promise<MarkAttributeFindingsStaleResult> {
    const ids = (input.ids ?? []).filter((id) => Boolean(id));
    if (ids.length === 0 && !input.attributeDefinitionId && !input.categoryId) {
      throw new BadRequestException(
        'Provide finding ids, an attributeDefinitionId, or a categoryId to mark findings stale.',
      );
    }

    const staledCount = await this.repository.markStale({
      ids,
      attributeDefinitionId: input.attributeDefinitionId,
      categoryId: input.categoryId,
      excludeSources: input.excludeSources,
      reason: input.reason,
      staledAt: new Date(),
    });

    if (staledCount > 0) {
      this.logger.log(`Marked ${staledCount} attribute finding(s) as STALE.`);
    }

    return { staledCount };
  }

  /**
   * Retires PENDING findings a producer no longer detects.
   *
   * Same algorithm as the component queue: only PENDING rows are affected and a
   * finding whose fingerprint was detected again stays reviewable. A condition that
   * no longer exists must not remain actionable, and a decision someone already made
   * must not be erased.
   *
   * The scope is deliberately four-dimensional — producer, intelligence version,
   * finding family and subject — because each dimension can describe a genuinely
   * different condition. Staling on a subset would let one producer's run retire
   * another producer's work, let a v2 normalization age v1 findings, or let a
   * producer that emits only some families retire findings in the families it never
   * examined.
   */
  async reconcileFindings(
    input: ReconcileAttributeFindingsInput,
  ): Promise<MarkAttributeFindingsStaleResult> {
    const attributeDefinitionIds = uniqueStrings(input.attributeDefinitionIds);
    const categoryIds = uniqueStrings(input.categoryIds ?? []);
    const sources = uniqueStrings(input.sources);
    const intelligenceVersions = uniqueStrings(
      input.intelligenceVersions ?? [],
    );
    const issueTypes = uniqueStrings(input.issueTypes ?? []);

    if (
      sources.length === 0 ||
      (attributeDefinitionIds.length === 0 && categoryIds.length === 0)
    ) {
      return { staledCount: 0 };
    }

    const active =
      input.activeFingerprints instanceof Set
        ? input.activeFingerprints
        : new Set(input.activeFingerprints);

    const pending = await this.repository.findPendingForReconciliation({
      attributeDefinitionIds,
      categoryIds,
      sources,
      intelligenceVersions,
      issueTypes,
    });

    const staleIds = pending
      .filter((row) => !active.has(row.fingerprint))
      .map((row) => row.id);
    if (staleIds.length === 0) return { staledCount: 0 };

    let staledCount = 0;
    // Chunked so a large sweep cannot build an unbounded IN list.
    for (let index = 0; index < staleIds.length; index += 200) {
      const chunk = staleIds.slice(index, index + 200);
      const result = await this.markFindingsStale({
        ids: chunk,
        reason:
          input.reason ?? 'No longer detected by the latest attribute analysis',
      });
      staledCount += result.staledCount;
    }

    return { staledCount };
  }

  /**
   * Rejects unknown filter values instead of returning a silently empty page.
   *
   * A typo in a status filter is a client bug; an empty queue looks like "nothing
   * to review", which is exactly the kind of wrong answer a review queue must not
   * give.
   */
  private normalizeQuery(
    query: AttributeFindingListQuery,
  ): AttributeFindingListQuery {
    const statuses = toStringList(query.status);
    const unknownStatuses = statuses.filter(
      (status) =>
        !(INTELLIGENCE_FINDING_STATUSES as readonly string[]).includes(status),
    );
    if (unknownStatuses.length > 0) {
      throw new BadRequestException(
        `Unknown attribute review status: ${unknownStatuses.join(', ')}`,
      );
    }

    const issueCategories = toStringList(query.issueCategory);
    const unknownCategories = issueCategories.filter(
      (category) =>
        !(ATTRIBUTE_REVIEW_ISSUE_CATEGORIES as readonly string[]).includes(
          category,
        ),
    );
    if (unknownCategories.length > 0) {
      throw new BadRequestException(
        `Unknown attribute review issue category: ${unknownCategories.join(', ')}.`,
      );
    }

    return {
      ...query,
      status: statuses.length > 0 ? statuses : undefined,
      issueType: toStringList(query.issueType),
      issueCategory: issueCategories.length > 0 ? issueCategories : undefined,
    };
  }

  /**
   * Verifies that every referenced subject row exists.
   *
   * Only ids are checked: a suggestion may legitimately reference an attribute or
   * category by *code* (it does not exist yet), and that is carried in metadata
   * rather than as a fake reference. Delegated to the repository so the check runs
   * on the same executor as the write it protects.
   */
  private async assertSubjectsExist(
    rows: AttributeFindingUpsertRow[],
  ): Promise<void> {
    const attributeIds = new Set<string>();
    for (const row of rows) {
      if (row.attributeDefinitionId)
        attributeIds.add(row.attributeDefinitionId);
      if (row.relatedAttributeDefinitionId) {
        attributeIds.add(row.relatedAttributeDefinitionId);
      }
    }

    const missing = await this.repository.findMissingAttributeDefinitionIds(
      Array.from(attributeIds),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Attribute definition(s) not found: ${missing.join(', ')}. Findings must reference existing definitions, or carry a canonical code when the definition does not exist yet.`,
      );
    }
  }

  private describeStaleReason(finding: AttributeIntelligenceFinding): string {
    const reason = finding.metadata?.staleReason;
    return typeof reason === 'string' && reason.length > 0
      ? reason
      : 'the attribute library changed after this finding was generated';
  }

  /**
   * Checks a stored finding's expected state against live ERP rows.
   *
   * Reads only the subjects the finding actually names, so a decision costs a
   * bounded number of queries regardless of library size. Returns `null` when the
   * finding has no expected state to compare, when its family has no rule, or when
   * the state still holds.
   *
   * Where the expected state comes from: `metadata.expectedState` is what the audit
   * producer writes, and `currentValue` holds the same snapshot by construction
   * (see `attribute-finding-expected-state.ts`). Both are accepted so a finding is
   * never left unprotected merely because its producer recorded the snapshot in the
   * other of the two equivalent places. A `currentValue` that is not a snapshot
   * degrades safely: the per-family rules look for named keys and return "no
   * verdict" when they are absent, so a non-snapshot can never be misread as a
   * contradiction.
   */
  private async detectExpectedStateStaleness(
    finding: AttributeIntelligenceFinding,
  ): Promise<string | null> {
    const expectedState =
      readSnapshotObject(finding.metadata, 'expectedState') ??
      finding.currentValue ??
      null;
    if (!expectedState || Object.keys(expectedState).length === 0) return null;

    const attributeDefinitionIds = [
      finding.attributeDefinitionId,
      finding.relatedAttributeDefinitionId,
    ].filter((id): id is string => Boolean(id));
    const categoryIds = [finding.categoryId].filter((id): id is string =>
      Boolean(id),
    );
    const expectedAttributeCode = readExpectedAttributeCode(expectedState);

    const live = await readAttributeFindingLiveState({
      attributeDefinitionIds,
      categoryIds,
      attributeCodes: expectedAttributeCode ? [expectedAttributeCode] : [],
    });

    return describeAttributeFindingStaleness({
      issueType: finding.issueType,
      expectedState,
      live,
    });
  }
}

/** Reads the canonical code an expectation names, for the live-state lookup. */
function readExpectedAttributeCode(
  expectedState: Record<string, unknown>,
): string | null {
  const value = expectedState.expectedAttributeCode;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Narrows a value to a non-empty object, for reading jsonb snapshots. */
function readSnapshotObject(
  source: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** De-duplicates non-empty strings, preserving order. */
function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value))));
}

/**
 * Rejects a finding whose declared category contradicts the taxonomy.
 *
 * Without this a producer could persist a binding suggestion under
 * `ATTRIBUTE_ENUM`, and every later consumer that groups by category would be
 * wrong. The service derives the category itself when the producer omits it.
 */
function validateIssueCategory(
  issueType: string,
  issueCategory: AttributeReviewIssueCategory,
): void {
  const expected = resolveAttributeIssueCategory(issueType);
  if (expected && expected !== issueCategory) {
    throw new BadRequestException(
      `Finding type '${issueType}' belongs to issue category '${expected}', not '${issueCategory}'.`,
    );
  }
}

/** Builds the normalized subject from a persistence input. */
function readSubject(
  input: PersistAttributeFindingInput,
): AttributeFindingSubject {
  return {
    attributeDefinitionId: input.attributeDefinitionId ?? null,
    relatedAttributeDefinitionId: input.relatedAttributeDefinitionId ?? null,
    categoryId: input.categoryId ?? null,
    optionId: input.optionId ?? null,
    attributeCode: input.attributeCode ?? null,
    categoryCode: input.categoryCode ?? null,
    optionCode: input.optionCode ?? null,
  };
}

/**
 * The `field` recorded on a feedback row.
 *
 * The finding's own `field` when it has one (so configuration findings report the
 * column they are about), otherwise a stable identifier derived from the issue
 * type. Feedback has always required a non-empty `field`, so this never returns
 * an empty string.
 */
function resolveFeedbackField(finding: AttributeIntelligenceFinding): string {
  const field = finding.field;
  if (typeof field === 'string' && field.length > 0) return field;
  return finding.issueType.toLowerCase();
}

/** Normalizes a filter that may arrive as an array or a comma-separated string. */
function toStringList(input?: string | string[]): string[] {
  if (!input) return [];
  const tokens = (Array.isArray(input) ? input : input.split(','))
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);
  return Array.from(new Set(tokens));
}

/**
 * Narrows a persisted row to the service contract.
 *
 * Postgres returns `numeric` as a string and timestamps as `Date`, neither of
 * which may leak into the API surface; the row shape is also deliberately not
 * returned, so database columns can change without becoming a public contract.
 */
export function toFindingDto(
  row: AttributeIntelligenceFinding,
): AttributeFindingDto {
  return {
    id: row.id,
    attributeDefinitionId: row.attributeDefinitionId ?? null,
    relatedAttributeDefinitionId: row.relatedAttributeDefinitionId ?? null,
    categoryId: row.categoryId ?? null,
    optionId: row.optionId ?? null,
    issueType: row.issueType,
    issueCategory: row.issueCategory,
    field: row.field ?? null,
    title: row.title,
    description: row.description,
    currentValue: row.currentValue ?? null,
    suggestedValue: row.suggestedValue ?? null,
    confidence: row.confidence === null ? null : Number(row.confidence),
    confidenceLevel: (row.confidenceLevel as ConfidenceLevel | null) ?? null,
    evidence: row.evidence ?? [],
    source: row.source,
    modelVersion: row.modelVersion ?? null,
    intelligenceVersion: row.intelligenceVersion ?? null,
    fingerprint: row.fingerprint,
    status: row.status as AttributeReviewStatus,
    reviewerId: row.reviewerId ?? null,
    reviewerEmail: row.reviewerEmail ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    decisionNotes: row.decisionNotes ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
