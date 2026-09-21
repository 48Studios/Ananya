import { db, type DbExecutor } from '@ananya/database';
import {
  attributeDefinitions,
  attributeIntelligenceFindings,
  type AttributeIntelligenceFinding,
  type NewAttributeIntelligenceFinding,
} from '@ananya/database/schema';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  notInArray,
  or,
  sql,
} from '@ananya/database/query';
import {
  DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  type AttributeFindingListQuery,
  type AttributeReviewDecision,
  type AttributeReviewSortField,
} from './attribute-finding.dtos';
import { decidableStatusesFor } from '../intelligence-findings';

/**
 * Persistence for Attribute Intelligence findings.
 *
 * Strictly a data-access component: it stores and retrieves rows, and applies
 * guarded lifecycle updates. It contains no fingerprint logic, no lifecycle
 * rules beyond the guard each write needs, and no attribute-domain mutation — the
 * service owns the workflow and later passes own the intelligence and the apply
 * paths.
 *
 * Every method accepts a `DbExecutor` so a caller that already holds a
 * transaction can enrol this repository in it. The default is the global client,
 * so non-transactional callers stay unchanged. This is what will let the later
 * apply pass run "lock finding → verify → mutate domain → update finding →
 * insert feedback" as one transaction without restructuring anything here.
 */

/** Columns a producer may write. Status, reviewer and fingerprint are not. */
export type AttributeFindingUpsertRow = Omit<
  NewAttributeIntelligenceFinding,
  'id' | 'status' | 'reviewerId' | 'reviewerEmail' | 'reviewedAt'
>;

export interface AttributeFindingDecisionUpdate {
  id: string;
  decision: AttributeReviewDecision;
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  reviewedAt: Date;
  decisionNotes?: string | null;
  /** JSON patch merged into `metadata`. */
  metadataPatch: Record<string, unknown>;
}

export interface AttributeFindingStaleUpdate {
  ids?: string[];
  attributeDefinitionId?: string;
  categoryId?: string;
  excludeSources?: string[];
  reason?: string;
  staledAt: Date;
}

/**
 * A single attempt to record a decision.
 *
 * `decision`, `reviewerId`, `reviewedAt` and `metadata` are the only columns
 * written: a decision never changes the condition, so it must never rewrite the
 * evidence or the suggested state that the reviewer judged.
 */
export class AttributeFindingRepository {
  constructor(private readonly client: DbExecutor = db) {}

  /**
   * Inserts or refreshes findings by fingerprint.
   *
   * Idempotency is enforced by the unique index on `fingerprint`, not by a
   * read-then-write: two concurrent audits of the same condition therefore
   * converge on one row instead of racing to insert two. The update deliberately
   * does NOT touch `status`, `reviewer_id`, `reviewer_email` or `decision_notes`:
   * a human decision is never overwritten by re-analysis. The one status change is
   * the established revival of STALE to PENDING, which records that the condition
   * was detected again and is therefore reviewable once more.
   */
  async upsertMany(
    rows: AttributeFindingUpsertRow[],
  ): Promise<AttributeIntelligenceFinding[]> {
    if (rows.length === 0) return [];

    const now = new Date();
    // Postgres refuses ON CONFLICT DO UPDATE affecting the same row twice within
    // one statement, so identical conditions in a batch collapse to the last
    // snapshot rather than erroring.
    const byFingerprint = new Map<string, AttributeFindingUpsertRow>();
    for (const row of rows) {
      byFingerprint.set(row.fingerprint, row);
    }

    return this.client
      .insert(attributeIntelligenceFindings)
      .values(
        Array.from(byFingerprint.values()).map((row) => ({
          ...row,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: attributeIntelligenceFindings.fingerprint,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          field: sql`excluded.field`,
          currentValue: sql`excluded.current_value`,
          suggestedValue: sql`excluded.suggested_value`,
          confidence: sql`excluded.confidence`,
          confidenceLevel: sql`excluded.confidence_level`,
          evidence: sql`excluded.evidence`,
          source: sql`excluded.source`,
          modelVersion: sql`excluded.model_version`,
          intelligenceVersion: sql`excluded.intelligence_version`,
          metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || excluded.metadata`,
          updatedAt: now,
          status: sql`case when ${attributeIntelligenceFindings.status} = 'STALE' then 'PENDING' else ${attributeIntelligenceFindings.status} end`,
        },
      })
      .returning();
  }

  async findById(
    id: string,
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const [row] = await client
      .select()
      .from(attributeIntelligenceFindings)
      .where(eq(attributeIntelligenceFindings.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Looks a finding up by its deterministic identity. Used by producers and tests
   * that need "the finding for this condition", and by the later apply pass as a
   * non-locking preflight read.
   */
  async findByFingerprint(
    fingerprint: string,
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const [row] = await client
      .select()
      .from(attributeIntelligenceFindings)
      .where(eq(attributeIntelligenceFindings.fingerprint, fingerprint))
      .limit(1);
    return row ?? null;
  }

  /** Locked read for a decision/apply transaction. */
  async findByIdForUpdate(
    id: string,
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const [row] = await client
      .select()
      .from(attributeIntelligenceFindings)
      .where(eq(attributeIntelligenceFindings.id, id))
      .limit(1)
      .for('update');
    return row ?? null;
  }

  /**
   * Applies the queue filters shared by the page, totals and summary queries.
   *
   * Kept private so every read path filters identically: a summary that disagrees
   * with the list it summarises is worse than no summary.
   */
  private buildConditions(query: AttributeFindingListQuery) {
    const statuses = normalizeList(query.status);
    const issueTypes = normalizeList(query.issueType);
    const issueCategories = normalizeList(query.issueCategory);
    const term = query.search?.trim();

    const conditions = [
      statuses.length > 0
        ? inArray(attributeIntelligenceFindings.status, statuses)
        : undefined,
      issueTypes.length > 0
        ? inArray(attributeIntelligenceFindings.issueType, issueTypes)
        : undefined,
      issueCategories.length > 0
        ? inArray(attributeIntelligenceFindings.issueCategory, issueCategories)
        : undefined,
      query.confidenceLevel
        ? eq(
            attributeIntelligenceFindings.confidenceLevel,
            query.confidenceLevel,
          )
        : undefined,
      query.attributeDefinitionId
        ? eq(
            attributeIntelligenceFindings.attributeDefinitionId,
            query.attributeDefinitionId,
          )
        : undefined,
      query.categoryId
        ? eq(attributeIntelligenceFindings.categoryId, query.categoryId)
        : undefined,
      query.relatedAttributeDefinitionId
        ? eq(
            attributeIntelligenceFindings.relatedAttributeDefinitionId,
            query.relatedAttributeDefinitionId,
          )
        : undefined,
      query.source
        ? eq(attributeIntelligenceFindings.source, query.source)
        : undefined,
      // Free-text search covers the finding's own text. Matching the subject's
      // attribute/category *names* needs a join, and belongs to the pass that
      // adds the HTTP endpoint and its UI.
      term
        ? or(
            ilike(attributeIntelligenceFindings.title, `%${term}%`),
            ilike(attributeIntelligenceFindings.description, `%${term}%`),
            ilike(attributeIntelligenceFindings.issueType, `%${term}%`),
          )
        : undefined,
    ];

    return conditions.filter(
      (condition): condition is NonNullable<typeof condition> =>
        Boolean(condition),
    );
  }

  /**
   * Filtered, paginated queue read.
   *
   * Returns the rows and the filtered total together, so a caller cannot
   * paginate over a different predicate than it counted.
   */
  async list(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<{ rows: AttributeIntelligenceFinding[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(
      MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
      Math.max(1, query.pageSize ?? DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE),
    );

    const conditions = this.buildConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totals] = await Promise.all([
      client
        .select()
        .from(attributeIntelligenceFindings)
        .where(where)
        .orderBy(resolveOrderBy(query))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      client
        .select({ value: count() })
        .from(attributeIntelligenceFindings)
        .where(where),
    ]);

    return { rows, total: Number(totals[0]?.value ?? 0) };
  }

  /**
   * Counts findings grouped by lifecycle status.
   *
   * Deliberately ignores the query's own status filter, so queue tabs can show
   * true totals ("3 pending, 12 accepted") while the list shows one status at a
   * time. Every other filter still applies.
   */
  async countByStatus(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({ ...query, status: undefined });
    const rows = await client
      .select({
        status: attributeIntelligenceFindings.status,
        value: count(),
      })
      .from(attributeIntelligenceFindings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(attributeIntelligenceFindings.status);

    return Object.fromEntries(
      rows.map((row) => [row.status, Number(row.value)]),
    );
  }

  /**
   * Counts findings grouped by issue category, for queue tab counts.
   *
   * Ignores the status filter for the same reason {@link countByStatus} does: the
   * summary describes the filtered slice, not the current page or tab.
   */
  async countByIssueCategory(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({ ...query, status: undefined });
    const rows = await client
      .select({
        issueCategory: attributeIntelligenceFindings.issueCategory,
        value: count(),
      })
      .from(attributeIntelligenceFindings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(attributeIntelligenceFindings.issueCategory);

    return Object.fromEntries(
      rows.map((row) => [row.issueCategory, Number(row.value)]),
    );
  }

  /**
   * Records a reviewer decision with a guarded update.
   *
   * The `status IN (...)` predicate is the concurrency control: two reviewers who
   * both decide the same PENDING finding cannot both succeed, because the second
   * update matches no row. `applicationResult` is not consulted here — applying a
   * suggestion is a separate operation owned by a later pass, and this method only
   * records the decision.
   *
   * Returns `null` when no row matched, which the service reports as a conflict.
   */
  async applyDecision(
    update: AttributeFindingDecisionUpdate,
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const metadataPatch = JSON.stringify(update.metadataPatch);
    const rows = await client
      .update(attributeIntelligenceFindings)
      .set({
        status: update.decision,
        reviewerId: update.reviewerId ?? null,
        reviewerEmail: update.reviewerEmail ?? null,
        reviewedAt: update.reviewedAt,
        decisionNotes: update.decisionNotes ?? null,
        updatedAt: update.reviewedAt,
        metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || ${metadataPatch}::jsonb`,
      })
      .where(
        and(
          eq(attributeIntelligenceFindings.id, update.id),
          inArray(
            attributeIntelligenceFindings.status,
            decidableStatusesFor(update.decision),
          ),
        ),
      )
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Marks PENDING findings STALE.
   *
   * Only PENDING rows are touched: a terminal decision is review history and must
   * survive a later change to the record it was about.
   */
  async markStale(
    update: AttributeFindingStaleUpdate,
    client: DbExecutor = this.client,
  ): Promise<number> {
    const ids = (update.ids ?? []).filter((id) => Boolean(id));
    const excluded = (update.excludeSources ?? []).filter((source) =>
      Boolean(source),
    );

    const conditions = [
      ids.length > 0
        ? inArray(attributeIntelligenceFindings.id, ids)
        : undefined,
      update.attributeDefinitionId
        ? eq(
            attributeIntelligenceFindings.attributeDefinitionId,
            update.attributeDefinitionId,
          )
        : undefined,
      update.categoryId
        ? eq(attributeIntelligenceFindings.categoryId, update.categoryId)
        : undefined,
      excluded.length > 0
        ? notInArray(attributeIntelligenceFindings.source, excluded)
        : undefined,
      eq(attributeIntelligenceFindings.status, 'PENDING'),
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );

    const patch = JSON.stringify({
      staleReason: update.reason ?? null,
      staledAt: update.staledAt.toISOString(),
    });

    const rows = await client
      .update(attributeIntelligenceFindings)
      .set({
        status: 'STALE',
        updatedAt: update.staledAt,
        metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || ${patch}::jsonb`,
      })
      .where(and(...conditions))
      .returning({ id: attributeIntelligenceFindings.id });

    return rows.length;
  }

  /** PENDING findings from the given producers, used by reconciliation. */
  /**
   * Returns the referenced attribute definition ids that do not exist.
   *
   * The service uses this to reject a finding whose subject reference is already
   * gone, so the caller gets a 400 naming the missing id rather than a foreign-key
   * violation from the insert. Runs on this repository's executor, so it observes
   * the same transaction as the write it protects.
   */
  async findMissingAttributeDefinitionIds(
    ids: string[],
    client: DbExecutor = this.client,
  ): Promise<string[]> {
    const unique = Array.from(new Set(ids.filter((id) => Boolean(id))));
    if (unique.length === 0) return [];

    const known = await client
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(inArray(attributeDefinitions.id, unique));
    const knownIds = new Set(known.map((row) => row.id));

    return unique.filter((id) => !knownIds.has(id));
  }

  /**
   * PENDING findings from the given producers, for reconciliation.
   *
   * Matches the attribute on *either* side of the finding: when attribute A is
   * re-analyzed, relationship findings (`A ≍ B`) are in scope whether A was stored
   * as the primary or the related side. Scoping only by the primary column would
   * leave one side's findings alive forever.
   */
  async findPendingForReconciliation(
    input: {
      attributeDefinitionIds: string[];
      sources: string[];
    },
    client: DbExecutor = this.client,
  ): Promise<Array<{ id: string; fingerprint: string }>> {
    if (
      input.attributeDefinitionIds.length === 0 ||
      input.sources.length === 0
    ) {
      return [];
    }

    return client
      .select({
        id: attributeIntelligenceFindings.id,
        fingerprint: attributeIntelligenceFindings.fingerprint,
      })
      .from(attributeIntelligenceFindings)
      .where(
        and(
          or(
            inArray(
              attributeIntelligenceFindings.attributeDefinitionId,
              input.attributeDefinitionIds,
            ),
            inArray(
              attributeIntelligenceFindings.relatedAttributeDefinitionId,
              input.attributeDefinitionIds,
            ),
          ),
          eq(attributeIntelligenceFindings.status, 'PENDING'),
          inArray(attributeIntelligenceFindings.source, input.sources),
        ),
      );
  }
}

/** Normalizes a status/type filter that may arrive as a list or CSV string. */
function normalizeList(input?: string | string[]): string[] {
  if (!input) return [];
  const tokens = (Array.isArray(input) ? input : input.split(','))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return Array.from(new Set(tokens));
}

function resolveOrderBy(query: AttributeFindingListQuery) {
  const sortBy: AttributeReviewSortField = query.sortBy ?? 'createdAt';
  const column =
    sortBy === 'updatedAt'
      ? attributeIntelligenceFindings.updatedAt
      : sortBy === 'confidence'
        ? attributeIntelligenceFindings.confidence
        : attributeIntelligenceFindings.createdAt;
  return query.sortDirection === 'asc' ? asc(column) : desc(column);
}
