import {
  INTELLIGENCE_FINDING_DECISIONS,
  type IntelligenceFindingDecision,
  type IntelligenceFindingStatus,
} from '../intelligence-findings';

/**
 * Canonical Attribute Intelligence review contracts.
 *
 * These values are persisted as varchar columns on
 * `attribute_intelligence_findings` and are the single source of truth for the
 * analyzer, the service and the tests. Adding a rule requires adding its type
 * here, so the persisted vocabulary cannot drift from the code that produces it.
 *
 * Naming note: the issue types are deliberately the names the existing
 * Attribute Intelligence implementation already emits (`audit_library` in
 * `apps/ml/app/services/attribute_intelligence.py` and
 * `MlService.auditAttributeLibraryFallback`), and the issue categories mirror
 * the component queue's `IDENTITY` / `CLASSIFICATION` / ... convention. Pass 1
 * adds no new detection rules, so inventing a parallel vocabulary here would make
 * every future producer translate between two names for the same condition.
 */

/**
 * Lifecycle states and reviewer decisions are shared with the Component queue.
 * Aliased rather than redeclared so the transition rules cannot diverge between
 * the two queues.
 */
export const ATTRIBUTE_REVIEW_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DISMISSED',
  'STALE',
] as const;

export type AttributeReviewStatus = IntelligenceFindingStatus;

/**
 * Decisions a reviewer may record, as a runtime list.
 *
 * Re-exported from the shared lifecycle module rather than redeclared: HTTP
 * validation and the workflow's own transition rules must accept exactly the
 * same set, or the API could accept a decision the service then refuses.
 */
export const ATTRIBUTE_REVIEW_DECISIONS = INTELLIGENCE_FINDING_DECISIONS;

export type AttributeReviewDecision = IntelligenceFindingDecision;

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Issue categories describe the kind of attribute-library problem a finding
 * represents. `ATTRIBUTE_QUALITY` is intentionally empty until a rule needs it,
 * the same way the component queue reserves `DATA_QUALITY`.
 */
export const ATTRIBUTE_REVIEW_ISSUE_CATEGORIES = [
  'ATTRIBUTE_IDENTITY',
  'ATTRIBUTE_BINDING',
  'ATTRIBUTE_CONFIG',
  'ATTRIBUTE_ENUM',
  'ATTRIBUTE_USAGE',
  'ATTRIBUTE_QUALITY',
] as const;

export type AttributeReviewIssueCategory =
  (typeof ATTRIBUTE_REVIEW_ISSUE_CATEGORIES)[number];

/**
 * Canonical issue-type taxonomy for the Attribute Review queue.
 *
 * - `DUPLICATE_ATTRIBUTE` / `POSSIBLE_DUPLICATE` — two definitions appear to
 *   describe the same property. `POSSIBLE_DUPLICATE` is the queued form of the
 *   audit's `DUPLICATE_ATTRIBUTE` (the existing review queue normalises between
 *   them), so both are representable. The rule that produced the match
 *   (`EXACT_CODE`, `ALIAS_MATCH`, `TOKEN_SIMILARITY`, ...) belongs in the
 *   suggested state, exactly as the component queue carries `matchType`.
 * - `SUGGESTED_BINDING` / `MISSING_EXPECTED_ATTRIBUTE` — a category and an
 *   attribute should be bound. `SUGGESTED_BINDING` is the attribute-first form
 *   (the attribute is identified by id or by canonical code when it does not
 *   exist yet); `MISSING_EXPECTED_ATTRIBUTE` is the category-first form the
 *   whole-library audit emits, where the canonical attribute may be unknown.
 * - `SUSPICIOUS_BINDING` — an existing binding looks wrong for its category.
 * - `SUGGESTED_ENUM_VALUE` — a SELECT/MULTI_SELECT attribute is missing an
 *   option that the domain knowledge base or observed values support.
 * - `INCONSISTENT_CONFIG` — the definition's configuration (data type, unit
 *   category, default unit, validation rules) is internally inconsistent or
 *   disagrees with the domain expectation.
 * - `UNUSED_ATTRIBUTE` — the definition has no component values and no
 *   category bindings.
 */
export type AttributeReviewIssueType =
  | 'DUPLICATE_ATTRIBUTE'
  | 'POSSIBLE_DUPLICATE'
  | 'SUGGESTED_BINDING'
  | 'MISSING_EXPECTED_ATTRIBUTE'
  | 'SUSPICIOUS_BINDING'
  | 'SUGGESTED_ENUM_VALUE'
  | 'INCONSISTENT_CONFIG'
  | 'UNUSED_ATTRIBUTE';

export const ATTRIBUTE_REVIEW_ISSUE_TYPES: Record<
  AttributeReviewIssueCategory,
  readonly AttributeReviewIssueType[]
> = {
  ATTRIBUTE_IDENTITY: ['DUPLICATE_ATTRIBUTE', 'POSSIBLE_DUPLICATE'],
  ATTRIBUTE_BINDING: [
    'SUGGESTED_BINDING',
    'MISSING_EXPECTED_ATTRIBUTE',
    'SUSPICIOUS_BINDING',
  ],
  ATTRIBUTE_CONFIG: ['INCONSISTENT_CONFIG'],
  ATTRIBUTE_ENUM: ['SUGGESTED_ENUM_VALUE'],
  ATTRIBUTE_USAGE: ['UNUSED_ATTRIBUTE'],
  ATTRIBUTE_QUALITY: [],
};

/** Flat, ordered view of {@link ATTRIBUTE_REVIEW_ISSUE_TYPES}. */
export const ATTRIBUTE_REVIEW_ISSUE_TYPE_VALUES: readonly AttributeReviewIssueType[] =
  ATTRIBUTE_REVIEW_ISSUE_CATEGORIES.flatMap(
    (category) => ATTRIBUTE_REVIEW_ISSUE_TYPES[category],
  );

export const ATTRIBUTE_REVIEW_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'confidence',
] as const;

export type AttributeReviewSortField =
  (typeof ATTRIBUTE_REVIEW_SORT_FIELDS)[number];

/** Bounds mirroring the component queue's page contract. */
export const DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE = 20;
export const MAX_ATTRIBUTE_QUEUE_PAGE_SIZE = 100;

/**
 * Which issue category a finding type belongs to.
 *
 * Derived from the taxonomy rather than repeated, so a type cannot be persisted
 * under a category that does not list it.
 */
export const ATTRIBUTE_REVIEW_ISSUE_CATEGORY_BY_TYPE: Record<
  AttributeReviewIssueType,
  AttributeReviewIssueCategory
> = ATTRIBUTE_REVIEW_ISSUE_CATEGORIES.reduce(
  (map, category) => {
    for (const issueType of ATTRIBUTE_REVIEW_ISSUE_TYPES[category]) {
      map[issueType] = category;
    }
    return map;
  },
  {} as Record<AttributeReviewIssueType, AttributeReviewIssueCategory>,
);

export function resolveAttributeIssueCategory(
  issueType: string,
): AttributeReviewIssueCategory | null {
  return (
    ATTRIBUTE_REVIEW_ISSUE_CATEGORY_BY_TYPE[
      issueType as AttributeReviewIssueType
    ] ?? null
  );
}

export function isAttributeReviewIssueType(
  value: string,
): value is AttributeReviewIssueType {
  return resolveAttributeIssueCategory(value) !== null;
}

// ---------------------------------------------------------------------------
// Subject model
// ---------------------------------------------------------------------------

/**
 * What a finding is about.
 *
 * The columns are the persisted subject references. A subject that does not
 * exist yet (a suggested attribute that has not been created) is not referenced
 * by id at all — the code travels in the suggested state — because findings must
 * never invent master data.
 */
export interface AttributeFindingSubject {
  attributeDefinitionId?: string | null;
  relatedAttributeDefinitionId?: string | null;
  categoryId?: string | null;
  optionId?: string | null;
  /** Canonical attribute code, for subjects that are not persisted yet. */
  attributeCode?: string | null;
  /** Canonical category code, for subjects that are not persisted yet. */
  categoryCode?: string | null;
  /** Option code, for options that are not persisted yet. */
  optionCode?: string | null;
}

export const ATTRIBUTE_FINDING_SUBJECT_COLUMNS = [
  'attributeDefinitionId',
  'relatedAttributeDefinitionId',
  'categoryId',
  'optionId',
] as const;

export type AttributeFindingSubjectColumn =
  (typeof ATTRIBUTE_FINDING_SUBJECT_COLUMNS)[number];

/**
 * The subject shape each finding type expresses. Used for documentation, for
 * grouping in later UI passes, and by {@link validateAttributeFindingSubject}.
 *
 * - `ATTRIBUTE` — one definition.
 * - `ATTRIBUTE_RELATIONSHIP` — two definitions that are related to each other
 *   and to nothing else. Neither side owns the finding.
 * - `ATTRIBUTE_CATEGORY` — a definition and a category: the binding subject.
 * - `CATEGORY` — a category alone (a gap in a category's attribute set).
 * - `ATTRIBUTE_OPTION` — a definition and one of its options.
 */
export type AttributeFindingSubjectKind =
  | 'ATTRIBUTE'
  | 'ATTRIBUTE_RELATIONSHIP'
  | 'ATTRIBUTE_CATEGORY'
  | 'CATEGORY'
  | 'ATTRIBUTE_OPTION';

export interface AttributeFindingSubjectRule {
  kind: AttributeFindingSubjectKind;
  /**
   * Subject columns that must be present for the finding to be reviewable. A
   * finding missing a required subject reference describes a condition nobody
   * can act on, so persistence refuses it.
   */
  requires: readonly AttributeFindingSubjectColumn[];
  /**
   * Whether the finding must identify an attribute definition — by id, or by
   * canonical code when the definition does not exist yet.
   *
   * `OPTIONAL` exists for the category-first audit case where a category is
   * missing a standard attribute that the library does not define at all.
   */
  attributeIdentity: 'REQUIRED' | 'OPTIONAL';
}

export const ATTRIBUTE_FINDING_SUBJECT_RULES: Record<
  AttributeReviewIssueType,
  AttributeFindingSubjectRule
> = {
  DUPLICATE_ATTRIBUTE: {
    kind: 'ATTRIBUTE_RELATIONSHIP',
    requires: ['attributeDefinitionId', 'relatedAttributeDefinitionId'],
    attributeIdentity: 'REQUIRED',
  },
  POSSIBLE_DUPLICATE: {
    kind: 'ATTRIBUTE_RELATIONSHIP',
    requires: ['attributeDefinitionId', 'relatedAttributeDefinitionId'],
    attributeIdentity: 'REQUIRED',
  },
  SUGGESTED_BINDING: {
    kind: 'ATTRIBUTE_CATEGORY',
    requires: ['categoryId'],
    attributeIdentity: 'REQUIRED',
  },
  MISSING_EXPECTED_ATTRIBUTE: {
    kind: 'CATEGORY',
    requires: ['categoryId'],
    attributeIdentity: 'OPTIONAL',
  },
  SUSPICIOUS_BINDING: {
    kind: 'ATTRIBUTE_CATEGORY',
    requires: ['attributeDefinitionId', 'categoryId'],
    attributeIdentity: 'REQUIRED',
  },
  SUGGESTED_ENUM_VALUE: {
    kind: 'ATTRIBUTE_OPTION',
    requires: ['attributeDefinitionId'],
    attributeIdentity: 'REQUIRED',
  },
  INCONSISTENT_CONFIG: {
    kind: 'ATTRIBUTE',
    requires: ['attributeDefinitionId'],
    attributeIdentity: 'REQUIRED',
  },
  UNUSED_ATTRIBUTE: {
    kind: 'ATTRIBUTE',
    requires: ['attributeDefinitionId'],
    attributeIdentity: 'REQUIRED',
  },
};

/** Narrows a subject value to a non-empty string. */
function readSubjectId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Validates that a finding's subject can actually be reviewed.
 *
 * Returns a human-readable violation, or `null` when the subject is well formed.
 * Pure and synchronous so the service can reject a bad finding before it reaches
 * the database, and so the rules are testable without a database.
 */
export function validateAttributeFindingSubject(input: {
  issueType: string;
  subject: AttributeFindingSubject;
}): string | null {
  if (!isAttributeReviewIssueType(input.issueType)) {
    return `Unknown attribute review issue type '${input.issueType}'. Add it to ATTRIBUTE_REVIEW_ISSUE_TYPES before persisting findings of that type.`;
  }

  const rule = ATTRIBUTE_FINDING_SUBJECT_RULES[input.issueType];

  for (const column of rule.requires) {
    if (!readSubjectId(input.subject[column])) {
      return `Finding type '${input.issueType}' requires a ${column} subject (${rule.kind}).`;
    }
  }

  if (
    rule.attributeIdentity === 'REQUIRED' &&
    !readSubjectId(input.subject.attributeDefinitionId) &&
    !readSubjectId(input.subject.attributeCode)
  ) {
    return `Finding type '${input.issueType}' must identify an attribute definition by id or by canonical code.`;
  }

  if (
    readSubjectId(input.subject.attributeDefinitionId) &&
    readSubjectId(input.subject.relatedAttributeDefinitionId) &&
    input.subject.attributeDefinitionId ===
      input.subject.relatedAttributeDefinitionId
  ) {
    return 'A relationship finding cannot relate an attribute definition to itself.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service contracts
// ---------------------------------------------------------------------------

/**
 * One finding to persist.
 *
 * The producer supplies the subject, the state it observed, the state it
 * suggests, and the evidence. It never supplies a status, reviewer, fingerprint
 * or timestamp: those are the review workflow's own state.
 */
export interface PersistAttributeFindingInput {
  issueType: string;
  /** Defaults to the category the taxonomy assigns to `issueType`. */
  issueCategory?: AttributeReviewIssueCategory;
  attributeDefinitionId?: string | null;
  relatedAttributeDefinitionId?: string | null;
  categoryId?: string | null;
  optionId?: string | null;
  /** Canonical attribute code when the definition does not exist yet. */
  attributeCode?: string | null;
  /** Canonical category code when the category is referenced by code only. */
  categoryCode?: string | null;
  /** Option code when the option does not exist yet. */
  optionCode?: string | null;
  field?: string | null;
  title: string;
  description: string;
  currentValue?: Record<string, unknown> | null;
  suggestedValue?: Record<string, unknown> | null;
  confidence?: number | null;
  confidenceLevel?: ConfidenceLevel | null;
  evidence?: Array<Record<string, unknown>>;
  source: string;
  modelVersion?: string | null;
  intelligenceVersion?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PersistAttributeFindingsResult {
  persistedCount: number;
  /** Findings that did not exist before this call. */
  createdCount: number;
  /** Findings that already existed and had their snapshot refreshed. */
  refreshedCount: number;
  /** Findings that were STALE and were returned to PENDING by re-detection. */
  revivedCount: number;
  findings: AttributeFindingDto[];
}

/**
 * Queue read filters.
 *
 * Every filter accepts either a single value or a list, and the service's
 * `normalizeQuery` validates list values against the taxonomy (unknown values are
 * a 400 rather than a silently empty page). HTTP callers therefore pass query
 * strings straight through, while internal callers can pass typed literals.
 *
 * `search` covers the finding's own text. Subject-identity search (matching an
 * attribute or category name) needs a join and is not implemented.
 */
export interface AttributeFindingListQuery {
  /** Accepts an array or a comma-separated string, like the component queue. */
  status?: string | string[];
  issueType?: string | string[];
  issueCategory?: string | string[];
  confidenceLevel?: ConfidenceLevel;
  attributeDefinitionId?: string;
  categoryId?: string;
  relatedAttributeDefinitionId?: string;
  source?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: AttributeReviewSortField;
  sortDirection?: 'asc' | 'desc';
}

/** Reviewer identity, always taken from the authenticated session by callers. */
export interface AttributeFindingReviewer {
  id?: string;
  email?: string;
}

export interface RecordAttributeFindingDecisionInput {
  decision: AttributeReviewDecision;
  decisionNotes?: string;
  /** Optimistic concurrency token; rejected with 409 when it no longer matches. */
  expectedFingerprint?: string;
  finalValue?: unknown;
}

export interface MarkAttributeFindingsStaleInput {
  ids?: string[];
  attributeDefinitionId?: string;
  categoryId?: string;
  reason?: string;
  /**
   * Producers to leave untouched, so a change that invalidates one producer's
   * findings does not age another's.
   */
  excludeSources?: string[];
}

export interface ReconcileAttributeFindingsInput {
  /** Attribute definitions that were re-analyzed in this run. */
  attributeDefinitionIds: string[];
  /**
   * Categories that were re-analyzed in this run.
   *
   * Required for a truthful whole-library sweep: a category-first finding (an
   * expectation about an attribute that does not exist yet) has no attribute
   * subject at all, so scoping reconciliation by attribute id alone would leave it
   * PENDING forever.
   */
  categoryIds?: string[];
  /** Fingerprints of findings that are still valid after re-analysis. */
  activeFingerprints: Set<string> | string[];
  /** Producer tags owned by the caller. */
  sources: string[];
  /**
   * Intelligence versions owned by the caller.
   *
   * Scoping by producer alone is not enough: the same producer under a different
   * normalization version reaches different conclusions from identical data, so a
   * v2 run must not age a v1 run's findings.
   */
  intelligenceVersions?: string[];
  /**
   * Finding families owned by the caller. A producer that emits only some families
   * must not stale another producer's findings in the families it does not cover,
   * even when both share a source tag.
   */
  issueTypes?: string[];
  reason?: string;
}

export interface MarkAttributeFindingsStaleResult {
  staledCount: number;
}

/**
 * Read projection of a persisted finding.
 *
 * Deliberately not the database row: `confidence` is a numeric string in
 * Postgres and timestamps are `Date`s, both of which must not leak into the
 * service contract.
 */
export interface AttributeFindingDto {
  id: string;
  attributeDefinitionId: string | null;
  relatedAttributeDefinitionId: string | null;
  categoryId: string | null;
  optionId: string | null;
  issueType: string;
  issueCategory: string;
  field: string | null;
  title: string;
  description: string;
  currentValue: Record<string, unknown> | null;
  suggestedValue: Record<string, unknown> | null;
  confidence: number | null;
  confidenceLevel: ConfidenceLevel | null;
  evidence: Array<Record<string, unknown>>;
  source: string;
  modelVersion: string | null;
  intelligenceVersion: string | null;
  fingerprint: string;
  status: AttributeReviewStatus;
  reviewerId: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  decisionNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AttributeFindingQueueSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  dismissed: number;
  stale: number;
  byCategory: Record<string, number>;
}

export interface AttributeFindingQueuePage {
  summary: AttributeFindingQueueSummary;
  items: AttributeFindingDto[];
  total: number;
  page: number;
  pageSize: number;
}
