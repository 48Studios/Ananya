import type { AttributeReviewIssueType } from './attribute-finding.dtos';

/**
 * Pass 2 contracts: persisting the *existing* Attribute Intelligence audit.
 *
 * These types describe the audit run's own bookkeeping. They deliberately mirror
 * the shape of the component audit result (`ComponentAuditResult`) so the two
 * analyzers read the same way, without sharing a type: an attribute audit reports
 * attribute-library counts and the component audit reports catalog counts.
 */

/**
 * Producer identity.
 *
 * The Attribute Intelligence audit selects ONE producer per run — the Python
 * model when it answers, the in-process deterministic implementation otherwise —
 * and never merges them. The tag records which one produced the findings, so
 * reconciliation can scope a run to its own producer and never stale another's
 * work. The same state produced by the same producer yields the same fingerprint.
 */
export const ATTRIBUTE_AUDIT_SOURCES = {
  /** `apps/ml/app/services/attribute_intelligence.py`, via the ML client. */
  ML: 'audit:attribute-library:ml',
  /** `MlService.auditAttributeLibraryFallback`, in-process. */
  DETERMINISTIC: 'audit:attribute-library:deterministic',
} as const;

export type AttributeAuditSource =
  (typeof ATTRIBUTE_AUDIT_SOURCES)[keyof typeof ATTRIBUTE_AUDIT_SOURCES];

/**
 * Bump when normalization or fingerprint semantics change.
 *
 * The version is part of every fingerprint, so a change here makes re-analysis
 * produce a new finding rather than silently rewriting a decision that was made
 * against the old semantics, and reconciliation (which is scoped by version) never
 * ages findings written by an older one.
 */
export const ATTRIBUTE_AUDIT_INTELLIGENCE_VERSION = 'attribute-audit-v1';

/** Model version recorded on findings produced by the Python producer. */
export const ATTRIBUTE_AUDIT_MODEL_VERSION = '1.0.0';

/**
 * Audit scope.
 *
 * The existing Attribute Intelligence audit is whole-library: it reads every
 * attribute definition and every category. The scope is recorded on the result
 * and used to bound reconciliation, so a future scoped audit cannot stale findings
 * outside the definitions it actually examined.
 */
export const ATTRIBUTE_AUDIT_SCOPE = 'WHOLE_LIBRARY' as const;

export type AttributeAuditScope = typeof ATTRIBUTE_AUDIT_SCOPE;

/** Facts about a raw producer issue that could not be normalized. */
export const ATTRIBUTE_AUDIT_WARNING_CODES = [
  /** The producer emitted an issue type this normalizer does not persist. */
  'UNSUPPORTED_PRODUCER_ISSUE_TYPE',
  /** The producer named a subject that does not exist in the library. */
  'MISSING_SUBJECT',
  /** The producer named a subject that resolves to more than one library row. */
  'AMBIGUOUS_SUBJECT',
  /** The producer issue was missing a field the finding cannot exist without. */
  'MALFORMED_PRODUCER_ISSUE',
  /** Two producer issues normalized to the same finding (one survives). */
  'DUPLICATE_FINDING_COLLAPSED',
] as const;

export type AttributeAuditWarningCode =
  (typeof ATTRIBUTE_AUDIT_WARNING_CODES)[number];

export interface AttributeAuditWarning {
  code: AttributeAuditWarningCode;
  /** Producer issue id, when the producer supplied one. */
  producerIssueId?: string | null;
  /** Producer issue type, when it was present. */
  producerIssueType?: string | null;
  message: string;
}

/** One producer issue that could not be persisted, and why. */
export interface AttributeAuditSkip {
  code: AttributeAuditWarningCode;
  producerIssueId: string | null;
  producerIssueType: string | null;
  message: string;
}

/**
 * What the audit did.
 *
 * Counts are deliberately separate: `rawFindingCount` is what the producer
 * reported, `persistedCount` is what the library now holds for this condition, and
 * `skippedCount` is what could not be represented. Intelligence is never silently
 * discarded — anything not persisted appears in `warnings`.
 */
export interface AttributeAuditPersistenceResult {
  source: AttributeAuditSource;
  intelligenceVersion: string;
  scope: AttributeAuditScope;
  /** Attribute definitions the producer examined. */
  scannedCount: number;
  /** Categories the producer examined. */
  scannedCategoryCount: number;
  /** Issues the producer reported, before normalization. */
  rawFindingCount: number;
  /** Findings written or refreshed by this run. */
  persistedCount: number;
  /** Findings that did not exist before this run. */
  createdCount: number;
  /** Findings that already existed and had their snapshot refreshed. */
  refreshedCount: number;
  /** Findings that were STALE and were returned to PENDING by re-detection. */
  revivedCount: number;
  /** PENDING findings this run no longer detects, moved to STALE. */
  staleCount: number;
  /** Producer issues that could not be persisted. */
  skippedCount: number;
  warningCount: number;
  warnings: AttributeAuditSkip[];
  /** Producer issues per persisted issue type, for observability. */
  byIssueType: Partial<Record<AttributeReviewIssueType, number>>;
  /** Whether the Python producer answered, as reported by the audit. */
  isMlActive: boolean;
  executionTimeMs: number;
}
