import { apiClient } from "../api-client";

/**
 * Attribute Intelligence Review Queue API client.
 *
 * Mirrors the backend contracts in
 * `apps/api/src/ml/attribute-findings/attribute-review-queue.*.ts`.
 *
 * Transport and types only: no review business logic, no attribute mutation, no
 * derived counts. Everything here reads or records *review* state.
 *
 * Two boundaries this module deliberately encodes:
 *
 *  1. **Listing is a read.** `listFindings`/`getFinding` hit persisted findings;
 *     they never trigger analysis. Only `runAudit` does, and it is an explicit
 *     action.
 *  2. **A decision is not an application.** `recordDecision` sends a lifecycle
 *     decision and (optionally) notes. There is no field, target or value in any
 *     payload, because this pass does not mutate the attribute library.
 */

// ---------------------------------------------------------------------------
// Taxonomy (authoritative source: backend attribute-finding.dtos.ts)
// ---------------------------------------------------------------------------

export type AttributeReviewIssueCategory =
  | "ATTRIBUTE_IDENTITY"
  | "ATTRIBUTE_BINDING"
  | "ATTRIBUTE_CONFIG"
  | "ATTRIBUTE_ENUM"
  | "ATTRIBUTE_USAGE"
  | "ATTRIBUTE_QUALITY";

export type AttributeReviewIssueType =
  | "DUPLICATE_ATTRIBUTE"
  | "POSSIBLE_DUPLICATE"
  | "SUGGESTED_BINDING"
  | "MISSING_EXPECTED_ATTRIBUTE"
  | "SUSPICIOUS_BINDING"
  | "SUGGESTED_ENUM_VALUE"
  | "INCONSISTENT_CONFIG"
  | "UNUSED_ATTRIBUTE";

export type AttributeReviewStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "DISMISSED"
  | "STALE";

export type AttributeReviewDecision = "ACCEPTED" | "REJECTED" | "DISMISSED";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type AttributeReviewSortField = "createdAt" | "updatedAt" | "confidence";

export type AttributeReviewAuditSource =
  | "audit:attribute-library:ml"
  | "audit:attribute-library:deterministic";

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface AttributeFindingEvidenceItemDto {
  type?: string;
  description?: string;
  weight?: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * One persisted finding.
 *
 * `metadata.expectedState` is the machine-comparable state the finding was
 * generated against; `metadata.producerIssueType` records the producer's own
 * name for the condition (the persisted type can differ).
 */
export interface AttributeReviewFindingDto {
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
  evidence: AttributeFindingEvidenceItemDto[];
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

export interface AttributeReviewQueueCountsDto {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  dismissed: number;
  stale: number;
  byCategory: Record<string, number>;
  byIssueType: Record<string, number>;
}

export interface AttributeReviewQueuePageDto {
  items: AttributeReviewFindingDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: AttributeReviewQueueCountsDto;
}

/** One producer issue that could not be persisted. */
export interface AttributeAuditWarningDto {
  code: string;
  producerIssueId: string | null;
  producerIssueType: string | null;
  message: string;
}

/** Result of an explicit audit run. */
export interface AttributeAuditResultDto {
  source: AttributeReviewAuditSource;
  intelligenceVersion: string;
  scope: string;
  scannedCount: number;
  scannedCategoryCount: number;
  rawFindingCount: number;
  persistedCount: number;
  createdCount: number;
  refreshedCount: number;
  revivedCount: number;
  staleCount: number;
  skippedCount: number;
  warningCount: number;
  warnings: AttributeAuditWarningDto[];
  byIssueType: Partial<Record<AttributeReviewIssueType, number>>;
  isMlActive: boolean;
  executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Request models
// ---------------------------------------------------------------------------

export interface ListAttributeFindingsParams {
  /** Comma-separated for multiple statuses, e.g. `PENDING,STALE`. */
  status?: string;
  /** Comma-separated for multiple issue types. */
  issueType?: string;
  /** Comma-separated for multiple issue categories. */
  issueCategory?: string;
  confidenceLevel?: ConfidenceLevel;
  attributeDefinitionId?: string;
  categoryId?: string;
  relatedAttributeDefinitionId?: string;
  source?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: AttributeReviewSortField;
  sortDirection?: "asc" | "desc";
}

export interface RecordAttributeDecisionPayload {
  decision: AttributeReviewDecision;
  decisionNotes?: string;
  /** Optimistic concurrency token; a mismatch returns 409. */
  expectedFingerprint?: string;
}

export interface MarkAttributeFindingsStalePayload {
  ids?: string[];
  attributeDefinitionId?: string;
  categoryId?: string;
  reason?: string;
}

/** Backend page-size ceiling (`MAX_ATTRIBUTE_QUEUE_PAGE_SIZE`). */
export const MAX_ATTRIBUTE_QUEUE_PAGE_SIZE = 100;

/** Default page size, matching the backend's `DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE`. */
export const DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE = 20;

/**
 * Builds the decision request body from a finding.
 *
 * Only lifecycle fields are ever sent. There is no field, attribute target or
 * value: recording ACCEPTED states that a human approved the finding, and does
 * not create a binding, remove one, create an option or touch a component value.
 */
export function buildAttributeDecisionPayload(
  finding: Pick<AttributeReviewFindingDto, "fingerprint">,
  decision: AttributeReviewDecision,
  decisionNotes?: string,
): RecordAttributeDecisionPayload {
  const payload: RecordAttributeDecisionPayload = {
    decision,
    expectedFingerprint: finding.fingerprint,
  };
  const notes = decisionNotes?.trim();
  if (notes) payload.decisionNotes = notes;
  return payload;
}

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

const BASE_PATH = "/ml/attributes/review-queue";

export const attributeReviewQueueApi = {
  /**
   * Reads a page of persisted findings.
   *
   * This is a READ: it does not run the producer and does not create findings, so
   * opening the queue is cheap regardless of how expensive analysis is.
   */
  listFindings: (
    params: ListAttributeFindingsParams = {},
  ): Promise<AttributeReviewQueuePageDto> => {
    const pageSize = Math.min(
      Math.max(1, params.pageSize ?? DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE),
      MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
    );
    return apiClient.get<AttributeReviewQueuePageDto>(
      `${BASE_PATH}${buildQueryString({
        status: params.status,
        issueType: params.issueType,
        issueCategory: params.issueCategory,
        confidenceLevel: params.confidenceLevel,
        attributeDefinitionId: params.attributeDefinitionId,
        categoryId: params.categoryId,
        relatedAttributeDefinitionId: params.relatedAttributeDefinitionId,
        source: params.source,
        search: params.search,
        page: params.page ?? 1,
        pageSize,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      })}`,
    );
  },

  getFinding: (id: string): Promise<AttributeReviewFindingDto> =>
    apiClient.get<AttributeReviewFindingDto>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
    ),

  /**
   * Records a review decision using the persisted finding id.
   *
   * Not an application: no attribute data is changed.
   */
  recordDecision: (
    id: string,
    payload: RecordAttributeDecisionPayload,
  ): Promise<AttributeReviewFindingDto> =>
    apiClient.post<AttributeReviewFindingDto, RecordAttributeDecisionPayload>(
      `${BASE_PATH}/${encodeURIComponent(id)}/decision`,
      payload,
    ),

  /**
   * Marks findings stale.
   *
   * Lifecycle maintenance for a subject the caller knows changed; it does not run
   * the producer and does not reconcile a scope.
   */
  markStale: (
    payload: MarkAttributeFindingsStalePayload,
  ): Promise<{ staledCount: number }> =>
    apiClient.post<
      { staledCount: number },
      MarkAttributeFindingsStalePayload
    >(`${BASE_PATH}/mark-stale`, payload),

  /**
   * Runs the existing attribute-library audit and persists its findings.
   *
   * The only route that invokes intelligence. Requires `Inventory.Update`, and a
   * second concurrent run is refused with 409.
   */
  runAudit: (): Promise<AttributeAuditResultDto> =>
    apiClient.post<AttributeAuditResultDto, Record<string, never>>(
      `${BASE_PATH}/audit`,
      {},
    ),
};
