import { apiClient } from "../api-client";

/**
 * Component Intelligence Review Queue API client.
 *
 * Mirrors the backend contracts in `apps/api/src/ml/component-review-*.ts`.
 * This module is deliberately transport + types only: it contains no review
 * business logic, no component mutation, and no derived counts.
 *
 * IMPORTANT: The review queue is a lifecycle/review system. Every endpoint here
 * records or reads *review findings* only. None of them modify a component's
 * manufacturer, category, MPN, SKU, attributes, or existence.
 */

// ---------------------------------------------------------------------------
// Taxonomy (authoritative source: backend COMPONENT_REVIEW_ISSUE_TYPES)
// ---------------------------------------------------------------------------

export type ComponentReviewIssueCategory =
  | "IDENTITY"
  | "CLASSIFICATION"
  | "DUPLICATE"
  | "DATA_QUALITY";

export type ComponentReviewIssueType =
  | "MPN_MISSING"
  | "MPN_CONFLICT"
  | "MANUFACTURER_UNRESOLVED"
  | "MANUFACTURER_CONFLICT"
  | "CATEGORY_UNRESOLVED"
  | "CATEGORY_CONFLICT"
  | "EXACT_DUPLICATE"
  | "POTENTIAL_DUPLICATE";

export type ComponentReviewStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "DISMISSED"
  | "STALE";

export type ComponentReviewDecision = "ACCEPTED" | "REJECTED" | "DISMISSED";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ComponentReviewSortField = "createdAt" | "updatedAt" | "confidence";

export type ComponentReviewAuditScope =
  | "SELECTED"
  | "RECENTLY_UPDATED"
  | "ALL";

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface ComponentReviewComponentSummaryDto {
  id: string;
  sku: string;
  name: string;
  manufacturerPartNumber: string | null;
  manufacturerId: string | null;
  categoryId: string | null;
  unit: string;
  isActive: boolean;
}

export interface ComponentReviewEvidenceItemDto {
  type?: string;
  description?: string;
  weight?: number;
  source?: string;
  [key: string]: unknown;
}

export interface ComponentReviewFindingDto {
  id: string;
  componentId: string;
  relatedComponentId: string | null;
  issueType: string;
  issueCategory: string;
  title: string;
  description: string;
  currentValue: Record<string, unknown> | null;
  suggestedValue: Record<string, unknown> | null;
  confidence: number | null;
  confidenceLevel: ConfidenceLevel | null;
  evidence: ComponentReviewEvidenceItemDto[];
  source: string;
  modelVersion: string | null;
  intelligenceVersion: string | null;
  fingerprint: string;
  status: ComponentReviewStatus;
  reviewerId: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  decisionNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  component: ComponentReviewComponentSummaryDto | null;
  relatedComponent: ComponentReviewComponentSummaryDto | null;
}

export interface ComponentReviewQueueSummaryDto {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  dismissed: number;
  stale: number;
  byCategory: Record<string, number>;
}

export interface ComponentReviewQueuePageDto {
  summary: ComponentReviewQueueSummaryDto;
  items: ComponentReviewFindingDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ComponentReviewAuditResultDto {
  scope: ComponentReviewAuditScope;
  analyzedCount: number;
  notFoundCount: number;
  failedCount: number;
  mlActiveCount: number;
  persistedCount: number;
  staledCount: number;
  duplicateFindingsCount: number;
  duplicateFindingsTruncated: boolean;
  findingsByCategory: Record<string, number>;
  pendingTotal: number;
  batchLimitReached: boolean;
  durationMs: number;
  intelligenceVersion: string;
  issueTypes: Record<string, readonly string[]>;
}

// ---------------------------------------------------------------------------
// Request models
// ---------------------------------------------------------------------------

export interface ListComponentFindingsParams {
  /** Comma-separated for multiple statuses, e.g. `PENDING,STALE`. */
  status?: string;
  issueCategory?: ComponentReviewIssueCategory;
  issueType?: ComponentReviewIssueType;
  componentId?: string;
  confidenceLevel?: ConfidenceLevel;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: ComponentReviewSortField;
  sortDirection?: "asc" | "desc";
}

export interface RecordComponentDecisionPayload {
  decision: ComponentReviewDecision;
  decisionNotes?: string;
  /** Optimistic concurrency token; a mismatch returns 409. */
  expectedFingerprint?: string;
}

/**
 * Request body for applying a finding.
 *
 * It carries the revision proof and notes ONLY. The component field and its
 * new value are decided by the backend from the finding type, so the queue
 * cannot be used as a generic write API.
 */
export interface ApplyComponentFindingPayload {
  expectedFingerprint: string;
  decisionNotes?: string;
}

/** Machine-readable refusal reasons returned with HTTP 409. */
export type ApplyConflictReason =
  | "UNSUPPORTED_FINDING_TYPE"
  | "FINDING_NOT_PENDING"
  | "FINGERPRINT_MISMATCH"
  | "COMPONENT_CHANGED"
  | "SUGGESTED_ENTITY_NOT_FOUND"
  | "SUGGESTED_ENTITY_INACTIVE"
  | "INVALID_SUGGESTED_VALUE";

export interface ApplyComponentFindingResultDto {
  findingId: string;
  componentId: string;
  issueType: string;
  /** Backend-declared field that was written. */
  field: "manufacturerPartNumber" | "manufacturerId" | "categoryId";
  fieldLabel: string;
  previousValue: string | null;
  appliedValue: string | null;
  appliedValueLabel: string | null;
  fingerprint: string;
  appliedAt: string;
  reviewerId: string | null;
  reviewerEmail: string | null;
  component: {
    id: string;
    sku: string;
    name: string;
    manufacturerPartNumber: string | null;
    manufacturerId: string | null;
    categoryId: string | null;
    updatedAt: string;
  };
  staledFindingCount: number;
}

export interface RunComponentAuditPayload {
  scope?: ComponentReviewAuditScope;
  componentIds?: string[];
  sinceDays?: number;
  limit?: number;
  includeInactive?: boolean;
}

/** Backend page-size ceiling (`MAX_COMPONENT_AUDIT_LIMIT` equivalent). */
export const MAX_QUEUE_PAGE_SIZE = 100;

export const DEFAULT_QUEUE_PAGE_SIZE = 20;

/**
 * Builds the decision request body from a finding.
 *
 * Only lifecycle fields are ever sent. Component fields are intentionally
 * absent: accepting a finding records a review decision and does NOT mutate the
 * component.
 */
export function buildDecisionPayload(
  finding: Pick<ComponentReviewFindingDto, "fingerprint">,
  decision: ComponentReviewDecision,
  decisionNotes?: string,
): RecordComponentDecisionPayload {
  const payload: RecordComponentDecisionPayload = {
    decision,
    expectedFingerprint: finding.fingerprint,
  };
  const notes = decisionNotes?.trim();
  if (notes) payload.decisionNotes = notes;
  return payload;
}

/**
 * Builds the apply request from a finding.
 *
 * Only the fingerprint (revision proof) and optional notes are sent. The field
 * and its new value are decided by the backend, so this function deliberately
 * has no way to express a field or value mutation.
 */
export function buildApplyPayload(
  finding: Pick<ComponentReviewFindingDto, "fingerprint">,
  decisionNotes?: string,
): ApplyComponentFindingPayload {
  const payload: ApplyComponentFindingPayload = {
    expectedFingerprint: finding.fingerprint,
  };
  const notes = decisionNotes?.trim();
  if (notes) payload.decisionNotes = notes;
  return payload;
}

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

const BASE_PATH = "/ml/components/review-queue";

export const componentReviewQueueApi = {
  listFindings: (
    params: ListComponentFindingsParams = {},
  ): Promise<ComponentReviewQueuePageDto> => {
    const pageSize = Math.min(
      Math.max(1, params.pageSize ?? DEFAULT_QUEUE_PAGE_SIZE),
      MAX_QUEUE_PAGE_SIZE,
    );
    return apiClient.get<ComponentReviewQueuePageDto>(
      `${BASE_PATH}${buildQueryString({
        status: params.status,
        issueCategory: params.issueCategory,
        issueType: params.issueType,
        componentId: params.componentId,
        confidenceLevel: params.confidenceLevel,
        search: params.search,
        page: params.page ?? 1,
        pageSize,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      })}`,
    );
  },

  getFinding: (id: string): Promise<ComponentReviewFindingDto> =>
    apiClient.get<ComponentReviewFindingDto>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
    ),

  recordDecision: (
    id: string,
    payload: RecordComponentDecisionPayload,
  ): Promise<ComponentReviewFindingDto> =>
    apiClient.post<ComponentReviewFindingDto, RecordComponentDecisionPayload>(
      `${BASE_PATH}/${encodeURIComponent(id)}/decision`,
      payload,
    ),

  /**
   * Applies the finding's suggestion to the component and marks it ACCEPTED.
   *
   * Only the six identity/classification finding types are applicable; the
   * backend refuses duplicates and any unsupported type with 409
   * `UNSUPPORTED_FINDING_TYPE`.
   */
  applyFinding: (
    id: string,
    payload: ApplyComponentFindingPayload,
  ): Promise<ApplyComponentFindingResultDto> =>
    apiClient.post<ApplyComponentFindingResultDto, ApplyComponentFindingPayload>(
      `${BASE_PATH}/${encodeURIComponent(id)}/apply`,
      payload,
    ),

  runAudit: (
    payload: RunComponentAuditPayload = {},
  ): Promise<ComponentReviewAuditResultDto> =>
    apiClient.post<ComponentReviewAuditResultDto, RunComponentAuditPayload>(
      `${BASE_PATH}/audit`,
      payload,
    ),
};
