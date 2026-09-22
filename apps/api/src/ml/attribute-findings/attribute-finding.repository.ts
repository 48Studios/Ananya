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
  /** Restrict to these issue families, so a caller stales only what it affects. */
  issueTypes?: string[];
  excludeSources?: string[];
  reason?: string;
  staledAt: Date;
}

/**
 * The guarded application transition.
 *
 * `applicationResult` is deliberately not a caller-supplied field: it is always
 * the literal `APPLIED`, because there is no other value this write may produce.
 * Exposing it as a parameter would invite a future caller to "un-apply" a finding,
 * which the ledger must never express.
 */
export interface AttributeFindingApplyUpdate {
  id: string;
  appliedAt: Date;
  /** JSON patch merged into `metadata` (actor, action, before/after state). */
  metadataPatch: Record<string, unknown>;
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
    const applicationResults = normalizeList(query.applicationResult);
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
      // Application state composes with every other filter rather than replacing
      // one, so `status=ACCEPTED&applicationResult=NOT_APPLIED` is a real query.
      applicationResults.length > 0
        ? inArray(
            attributeIntelligenceFindings.applicationResult,
            applicationResults,
          )
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
   * Filtered queue read.
   *
   * Returns the rows and the filtered total together, so a caller cannot
   * paginate over a different predicate than it counted.
   *
   * Omitting `pageSize` returns EVERY match. The review surfaces read the whole
   * filtered list — a page boundary would truncate it silently while the counts
   * (read from separate grouped queries) kept reporting the larger number — so
   * the bound is only applied when a caller asks for one.
   */
  async list(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<{ rows: AttributeIntelligenceFinding[]; total: number }> {
    const unbounded = query.pageSize === undefined;
    const page = Math.max(1, query.page ?? 1);
    const pageSize = unbounded
      ? undefined
      : Math.min(
          MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
          Math.max(1, query.pageSize ?? DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE),
        );

    const conditions = this.buildConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rowsQuery = client
      .select()
      .from(attributeIntelligenceFindings)
      .where(where)
      .orderBy(resolveOrderBy(query));

    const [rows, totals] = await Promise.all([
      pageSize === undefined
        ? rowsQuery
        : rowsQuery.limit(pageSize).offset((page - 1) * pageSize),
      client
        .select({ value: count() })
        .from(attributeIntelligenceFindings)
        .where(where),
    ]);

    return { rows, total: Number(totals[0]?.value ?? 0) };
  }

  /**
   * The filters a TAB COUNT ignores.
   *
   * `status`, `issueType` and `applicationResult` are the three dimensions the
   * queue exposes as navigation (status selector, family tabs, worklist selector).
   * A count that enumerates one of them must ignore all three, or picking any
   * option changes the numbers used to choose between options — which is exactly
   * the bug Pass 3 fixed when `countByIssueType` stopped honouring `status`, and
   * which Pass 5 would have reintroduced by adding a fourth tab dimension without
   * extending the rule.
   *
   * The scoping filters — category, source, confidence, search, subject ids — are
   * NOT ignored: they narrow which findings are under discussion, so every count
   * should describe the narrowed set.
   */
  private static readonly TAB_DIMENSIONS = {
    status: undefined,
    issueType: undefined,
    applicationResult: undefined,
  } as const;

  /**
   * Counts findings grouped by lifecycle status.
   *
   * Ignores the tab dimensions (see {@link TAB_DIMENSIONS}), so queue tabs can show
   * true totals while the list shows one status at a time.
   */
  async countByStatus(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({
      ...query,
      ...AttributeFindingRepository.TAB_DIMENSIONS,
    });
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
   * Ignores the tab dimensions for the same reason {@link countByStatus} does.
   */
  async countByIssueCategory(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({
      ...query,
      ...AttributeFindingRepository.TAB_DIMENSIONS,
    });
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
   * Counts findings grouped by issue family, for the queue's family tabs.
   *
   * Ignores the tab dimensions for the same reason {@link countByStatus} does: a
   * tab count describes how many findings exist in each family, not how many match
   * the family, status or worklist currently selected.
   */
  async countByIssueType(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({
      ...query,
      ...AttributeFindingRepository.TAB_DIMENSIONS,
    });
    const rows = await client
      .select({
        issueType: attributeIntelligenceFindings.issueType,
        value: count(),
      })
      .from(attributeIntelligenceFindings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(attributeIntelligenceFindings.issueType);

    return Object.fromEntries(
      rows.map((row) => [row.issueType, Number(row.value)]),
    );
  }

  /**
   * Counts findings grouped by application state, for the queue's worklists.
   *
   * Ignores the tab dimensions, including the dimension it groups by: the numbers
   * exist so a reviewer can choose a worklist, which they cannot do if the numbers
   * change the moment they choose one.
   */
  async countByApplicationResult(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<Record<string, number>> {
    const conditions = this.buildConditions({
      ...query,
      ...AttributeFindingRepository.TAB_DIMENSIONS,
    });
    const rows = await client
      .select({
        applicationResult: attributeIntelligenceFindings.applicationResult,
        value: count(),
      })
      .from(attributeIntelligenceFindings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(attributeIntelligenceFindings.applicationResult);

    return Object.fromEntries(
      rows.map((row) => [row.applicationResult, Number(row.value)]),
    );
  }

  /**
   * Counts findings that are approved and still unapplied.
   *
   * The intersection of two dimensions, so it cannot be derived from the status
   * counts or the application counts. Ignores the tab dimensions like every other
   * tab count, so it is a stable description of how much work is waiting rather
   * than of the current selection — and so it always equals the number of rows the
   * matching filter (`status=ACCEPTED&applicationResult=NOT_APPLIED`) returns.
   */
  async countReadyToApply(
    query: AttributeFindingListQuery,
    client: DbExecutor = this.client,
  ): Promise<number> {
    const conditions = this.buildConditions({
      ...query,
      ...AttributeFindingRepository.TAB_DIMENSIONS,
    });
    const rows = await client
      .select({ value: count() })
      .from(attributeIntelligenceFindings)
      .where(
        and(
          ...conditions,
          eq(attributeIntelligenceFindings.status, 'ACCEPTED'),
          eq(attributeIntelligenceFindings.applicationResult, 'NOT_APPLIED'),
        ),
      );

    return Number(rows[0]?.value ?? 0);
  }

  /**
   * Records that the finding's suggestion was applied to the attribute library.
   *
   * The `WHERE` clause is the whole point of this method: the update only matches a
   * row that is still `ACCEPTED` and still unapplied, so the database itself
   * guarantees that a finding can be applied at most once and never while it is
   * pending, rejected, dismissed or stale. Two concurrent applies cannot both win,
   * because the second one's UPDATE matches no row.
   *
   * Returns the updated row, or `null` when the guard did not match — which the
   * caller reports as a conflict rather than as a success it cannot prove.
   */
  async markApplied(
    update: AttributeFindingApplyUpdate,
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const metadataPatch = JSON.stringify(update.metadataPatch);
    const rows = await client
      .update(attributeIntelligenceFindings)
      .set({
        applicationResult: 'APPLIED',
        updatedAt: update.appliedAt,
        metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || ${metadataPatch}::jsonb`,
      })
      .where(
        and(
          eq(attributeIntelligenceFindings.id, update.id),
          eq(attributeIntelligenceFindings.status, 'ACCEPTED'),
          eq(attributeIntelligenceFindings.applicationResult, 'NOT_APPLIED'),
        ),
      )
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Marks a finding STALE as the consequence of a refused application.
   *
   * Distinct from {@link markStale}, which the review workflow uses and which only
   * touches PENDING rows so a terminal decision is never overwritten. The apply path
   * needs the opposite: an ACCEPTED finding whose expected state no longer holds must
   * become STALE, or it would stay applicable forever and keep reporting a condition
   * that is no longer true. The guard is therefore `NOT_APPLIED` — an applied finding
   * describes a change that already happened and may never be aged back out — and the
   * `status IN ('PENDING','ACCEPTED')` predicate keeps the transition monotonic
   * towards STALE without ever overwriting a rejection or a dismissal.
   *
   * Returns `null` when no row matched.
   */
  async markStaleForApplication(
    update: { id: string; reason: string; staledAt: Date },
    client: DbExecutor = this.client,
  ): Promise<AttributeIntelligenceFinding | null> {
    const stalePatch = JSON.stringify({
      staleReason: update.reason,
      staledAt: update.staledAt.toISOString(),
    });
    const rows = await client
      .update(attributeIntelligenceFindings)
      .set({
        status: 'STALE',
        updatedAt: update.staledAt,
        metadata: sql`coalesce(${attributeIntelligenceFindings.metadata}, '{}'::jsonb) || ${stalePatch}::jsonb`,
      })
      .where(
        and(
          eq(attributeIntelligenceFindings.id, update.id),
          eq(attributeIntelligenceFindings.applicationResult, 'NOT_APPLIED'),
          inArray(attributeIntelligenceFindings.status, [
            'PENDING',
            'ACCEPTED',
          ]),
        ),
      )
      .returning();

    return rows[0] ?? null;
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
    const issueTypes = Array.from(
      new Set((update.issueTypes ?? []).filter((value) => Boolean(value))),
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
      issueTypes.length > 0
        ? inArray(attributeIntelligenceFindings.issueType, issueTypes)
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
   * Classifies a batch of fingerprints by the lifecycle state already stored.
   *
   * Used to report whether a persistence run created, refreshed or revived each
   * finding. Kept as a pre-write read rather than a `RETURNING` trick because the
   * row-level guarantee comes from the unique index, not from this read: under a
   * concurrent run the counts are advisory while the row outcome is still exactly
   * one finding per fingerprint.
   */
  async classifyFingerprints(
    fingerprints: string[],
    client: DbExecutor = this.client,
  ): Promise<Map<string, string>> {
    const unique = Array.from(
      new Set(fingerprints.filter((fingerprint) => Boolean(fingerprint))),
    );
    if (unique.length === 0) return new Map();

    const rows: Array<{ fingerprint: string; status: string }> = [];
    const chunkSize = 200;
    for (let index = 0; index < unique.length; index += chunkSize) {
      const chunk = unique.slice(index, index + chunkSize);
      rows.push(
        ...(await client
          .select({
            fingerprint: attributeIntelligenceFindings.fingerprint,
            status: attributeIntelligenceFindings.status,
          })
          .from(attributeIntelligenceFindings)
          .where(inArray(attributeIntelligenceFindings.fingerprint, chunk))),
      );
    }

    return new Map(rows.map((row) => [row.fingerprint, row.status]));
  }

  /**
   * PENDING findings from the given producers, for reconciliation.
   *
   * Scope is expressed on every dimension that can make two findings genuinely
   * different conditions: the subject (either attribute of a pair, or the category
   * a category-first finding belongs to), the producer tag, the intelligence
   * version and the finding family. Omitting any one of them would let an audit age
   * findings it never examined.
   */
  async findPendingForReconciliation(
    input: {
      attributeDefinitionIds: string[];
      categoryIds?: string[];
      sources: string[];
      intelligenceVersions?: string[];
      issueTypes?: string[];
    },
    client: DbExecutor = this.client,
  ): Promise<Array<{ id: string; fingerprint: string }>> {
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
      return [];
    }

    const subjectConditions = [
      attributeDefinitionIds.length > 0
        ? inArray(
            attributeIntelligenceFindings.attributeDefinitionId,
            attributeDefinitionIds,
          )
        : undefined,
      attributeDefinitionIds.length > 0
        ? inArray(
            attributeIntelligenceFindings.relatedAttributeDefinitionId,
            attributeDefinitionIds,
          )
        : undefined,
      categoryIds.length > 0
        ? inArray(attributeIntelligenceFindings.categoryId, categoryIds)
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );

    const conditions = [
      or(...subjectConditions),
      eq(attributeIntelligenceFindings.status, 'PENDING'),
      inArray(attributeIntelligenceFindings.source, sources),
      intelligenceVersions.length > 0
        ? inArray(
            attributeIntelligenceFindings.intelligenceVersion,
            intelligenceVersions,
          )
        : undefined,
      issueTypes.length > 0
        ? inArray(attributeIntelligenceFindings.issueType, issueTypes)
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );

    return client
      .select({
        id: attributeIntelligenceFindings.id,
        fingerprint: attributeIntelligenceFindings.fingerprint,
      })
      .from(attributeIntelligenceFindings)
      .where(and(...conditions));
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
/** De-duplicates non-empty strings, preserving order. */
function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value))));
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
