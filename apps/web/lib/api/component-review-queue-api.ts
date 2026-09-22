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
  | "DATA_QUALITY"
  | "ATTRIBUTE_VALUE";

export type ComponentReviewIssueType =
  | "MPN_MISSING"
  | "MPN_CONFLICT"
  | "MANUFACTURER_UNRESOLVED"
  | "MANUFACTURER_CONFLICT"
  | "CATEGORY_UNRESOLVED"
  | "CATEGORY_CONFLICT"
  | "EXACT_DUPLICATE"
  | "POTENTIAL_DUPLICATE"
  | "ATTRIBUTE_VALUE_SUGGESTION";

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

/** One structured attribute recorded on both sides of a duplicate pair. */
export interface ComponentReviewAttributeComparisonDto {
  code: string;
  label: string;
  current: string;
  related: string;
  result: "MATCH" | "DIFFERENT";
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
  /**
   * Structured attribute comparison for duplicate findings. Empty for other
   * finding types and for duplicate rows persisted before the field existed, so
   * it must always be treated as optional.
   */
  attributeComparison?: ComponentReviewAttributeComparisonDto[];
  createdAt: string;
  updatedAt: string;
  component: ComponentReviewComponentSummaryDto | null;
  relatedComponent: ComponentReviewComponentSummaryDto | null;
}

/** Severity classes used by the consolidation conflict model. */
export type ConsolidationSeverity = "BLOCKING" | "WARNING" | "INFORMATIONAL";

export type ConsolidationDependencyClassification =
  | "MUST_PRESERVE"
  | "MUST_REPOINT"
  | "MUST_RECONCILE"
  | "MUST_NOT_CHANGE"
  | "UNKNOWN";

/** One conflict or warning produced by the consolidation analysis. */
export interface ConsolidationConflictDto {
  code: string;
  severity: ConsolidationSeverity;
  title: string;
  description: string;
  entityType: string;
  entityIds: string[];
  affectedCount: number | null;
  sourceComponentId: string | null;
  canonicalComponentId: string | null;
  resolutionRequired: boolean;
  blocksExecution: boolean;
  resolutionSupported: boolean;
}

export interface ConsolidationComponentSummaryDto {
  id: string;
  sku: string;
  name: string;
  manufacturerId: string | null;
  manufacturerPartNumber: string | null;
  categoryId: string | null;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidationCanonicalCandidateDto {
  componentId: string;
  isActive: boolean;
  hasInventory: boolean;
  createdAt: string;
  reason: string;
}

export interface ConsolidationEligibilityDto {
  eligible: boolean;
  reasonCodes: string[];
  explanations: string[];
}

export interface ConsolidationDependencyDto {
  id: string;
  label: string;
  entity: string;
  referenceKind: "FK" | "POLYMORPHIC";
  classification: ConsolidationDependencyClassification;
  executionSupport: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
  temporality: string;
  count: number;
  openCount: number | null;
  historicalCount: number | null;
  sampleIds: string[];
  supportNote: string;
  canonicalCount: number;
  sourceCount: number;
  blocking: boolean;
}

export interface ConsolidationInventoryLocationDto {
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationInventorySideDto {
  componentId: string;
  totalQuantity: number;
  locations: ConsolidationInventoryLocationDto[];
  ledgerTransactionCount: number;
}

export interface ConsolidationInventoryLocationImpactDto {
  locationId: string;
  canonicalQuantity: number;
  sourceQuantity: number;
  combinedQuantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationProposedLedgerEntryDto {
  action: "ISSUE_SOURCE" | "RECEIPT_CANONICAL";
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationInventoryDto {
  canonical: ConsolidationInventorySideDto;
  source: ConsolidationInventorySideDto;
  byLocation: ConsolidationInventoryLocationImpactDto[];
  combinedTotalQuantity: number;
  proposedReconciliation: ConsolidationProposedLedgerEntryDto[];
  executionSupport: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
  note: string;
}

export interface ConsolidationAttributeEntryDto {
  /** Used to submit a resolution for this entry. */
  attributeDefinitionId: string;
  code: string;
  label: string;
  dataType: string;
  canonicalValue: string | null;
  sourceValue: string | null;
  classification: "IDENTICAL" | "CANONICAL_ONLY" | "SOURCE_ONLY" | "CONFLICTING";
  resolutionRequired: boolean;
  resolutionSupported: boolean;
}

export interface ConsolidationAttributesDto {
  entries: ConsolidationAttributeEntryDto[];
  identicalCount: number;
  canonicalOnlyCount: number;
  sourceOnlyCount: number;
  conflictingCount: number;
}

export interface ConsolidationCategoryDto {
  canonicalCategoryId: string | null;
  canonicalCategoryName: string | null;
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  relation: "SAME" | "RELATED" | "INCOMPATIBLE" | "UNKNOWN";
  note: string;
}

export interface ConsolidationManufacturerDto {
  canonicalManufacturerId: string | null;
  canonicalManufacturerName: string | null;
  sourceManufacturerId: string | null;
  sourceManufacturerName: string | null;
  relation: "SAME" | "CONFLICT" | "INDETERMINATE";
  aliasResolved: boolean;
  note: string;
}

export interface ConsolidationBomLineDto {
  bomId: string;
  bomRevision: string;
  bomStatus: string;
  quantityPerUnit: string;
  scrapFactorPercent: string;
  notes: string | null;
}

export interface ConsolidationBomImpactDto {
  canonicalLines: ConsolidationBomLineDto[];
  sourceLines: ConsolidationBomLineDto[];
  collisions: Array<{
    bomId: string;
    canonicalLineId: string;
    sourceLineId: string;
    canonicalQuantityPerUnit: string;
    sourceQuantityPerUnit: string;
    canonicalScrapFactorPercent: string;
    sourceScrapFactorPercent: string;
    /** `source + canonical`: the quantity a COMBINE resolution produces. */
    combinedQuantityPerUnit: string;
    /** True when the two scrap factors differ and must be chosen explicitly. */
    scrapFactorDecisionRequired: boolean;
  }>;
  collisionCount: number;
  canonicalOnlyCount: number;
  sourceOnlyCount: number;
  executionSupport: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
  note: string;
}

export interface ConsolidationReferenceSummaryDto {
  /** Total rows that keep their current component identity. */
  historicalCount: number;
  /** Total rows that are still open/current. */
  openCount: number;
  /** Total rows that would need repointing. */
  repointCount: number;
  /** Total rows needing reconciliation rather than a simple repoint. */
  reconcileCount: number;
  /** Dependencies whose semantics are undefined. */
  unknownCount: number;
  /** Total rows across every classification, for display. */
  count: number;
}

export interface ConsolidationPolymorphicReferenceDto {
  id: string;
  label: string;
  entity: string;
  canonicalCount: number;
  sourceCount: number;
  sampleIds: string[];
  /** True when consolidation has defined semantics for this table. */
  supported: boolean;
  /** The defined semantics, or `UNCLASSIFIED` when none exist. */
  semantics: string;
  note: string;
}

export interface ConsolidationRetirementDto {
  canonicalIsActive: boolean;
  sourceIsActive: boolean;
  supportedMechanism: string;
  missingSemantics: string[];
  executionSupport: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
  note: string;
}

export interface ConsolidationHistoryDto {
  findingId: string;
  findingIssueType: string;
  findingMatchType: string | null;
  findingStatus: string;
  findingFingerprint: string;
  relatedFindings: Array<{
    id: string;
    componentId: string;
    relatedComponentId: string | null;
    issueType: string;
    status: string;
    matchType: string | null;
  }>;
  relatedFindingCount: number;
  feedbackCount: number;
  intelligenceVersion: string;
}

export interface ConsolidationProposedChangeDto {
  entity: string;
  action:
    | "REPOINT"
    | "RECONCILE"
    | "PRESERVE"
    | "RETIRE"
    | "POST_LEDGER_ENTRY"
    | "MANUAL_DECISION";
  recordCount: number;
  executionSupport: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
  note: string;
}

/**
 * Read-only consolidation analysis for a duplicate finding.
 *
 * `executable` is always `false`: this feature analyses consolidation and never
 * performs it.
 */
export interface ConsolidationPreviewDto {
  findingId: string;
  executable: boolean;
  executionBlockedReasons: Array<{
    code: string;
    title: string;
    description: string;
  }>;
  canonical: ConsolidationComponentSummaryDto;
  sources: ConsolidationComponentSummaryDto[];
  canonicalCandidates: ConsolidationCanonicalCandidateDto[];
  eligibility: ConsolidationEligibilityDto;
  conflicts: ConsolidationConflictDto[];
  dependencies: ConsolidationDependencyDto[];
  inventory: ConsolidationInventoryDto;
  attributes: ConsolidationAttributesDto;
  category: ConsolidationCategoryDto;
  manufacturer: ConsolidationManufacturerDto;
  bom: ConsolidationBomImpactDto;
  procurement: ConsolidationReferenceSummaryDto;
  reservations: ConsolidationReferenceSummaryDto;
  batches: ConsolidationReferenceSummaryDto;
  serials: ConsolidationReferenceSummaryDto;
  historicalReferences: ConsolidationReferenceSummaryDto;
  polymorphicReferences: ConsolidationPolymorphicReferenceDto[];
  retirement: ConsolidationRetirementDto;
  history: ConsolidationHistoryDto;
  proposedChanges: ConsolidationProposedChangeDto[];
  dependencyCoverage: {
    ok: boolean;
    databaseReferenceCount: number;
    registeredReferenceCount: number;
    unregisteredReferences: string[];
  };
  previewFingerprint: string;
  previewVersion: string;
  intelligenceVersion: string;
  computedAt: string;
}

export interface ConsolidationPreviewPayload {
  /** Optional: preview a specific surviving record. */
  canonicalComponentId?: string;
  /** Attribute decisions already made, so the preview can report readiness. */
  attributeResolutions?: Array<{
    attributeDefinitionId: string;
    strategy: string;
  }>;
  /** BOM collision decisions already made. */
  bomResolutions?: Array<{ bomId: string }>;
}

/** One attribute decision submitted with an execution request. */
export interface ConsolidationAttributeResolutionPayload {
  attributeDefinitionId: string;
  strategy:
    | "KEEP_CANONICAL_VALUE"
    | "KEEP_SOURCE_VALUE"
    | "DISCARD_SOURCE_VALUE"
    | "EXPLICIT_VALUE";
  value?: string | number | boolean | null;
}

/** One BOM collision decision submitted with an execution request. */
export interface ConsolidationBomResolutionPayload {
  bomId: string;
  resolution: "COMBINE";
  scrapFactorResolution: {
    strategy: "USE_CANONICAL" | "USE_SOURCE" | "EXPLICIT";
    value?: number;
  };
}

export interface ConsolidationExecutionPayload {
  expectedPreviewFingerprint: string;
  canonicalComponentId: string;
  sourceComponentIds?: string[];
  attributeResolutions?: ConsolidationAttributeResolutionPayload[];
  bomResolutions?: ConsolidationBomResolutionPayload[];
  decisionNotes?: string;
  /** Must be exactly `true`. The backend refuses anything else. */
  confirmation: boolean;
}

export interface ConsolidationAdapterReportDto {
  adapterId: string;
  label: string;
  entity: string;
  action: string;
  migratedCount: number;
  details: Record<string, unknown>;
  warnings: string[];
}

export interface ConsolidationResultDto {
  consolidationId: string;
  status: "COMPLETED";
  /** True when the backend returned an already-committed operation. */
  idempotentReplay: boolean;
  findingId: string;
  canonical: { id: string; sku: string; name: string; isActive: boolean };
  sources: Array<{
    id: string;
    sku: string;
    name: string;
    isActive: boolean;
    consolidatedIntoComponentId: string;
    consolidatedAt: string;
  }>;
  previewFingerprint: string;
  adapters: ConsolidationAdapterReportDto[];
  warnings: string[];
  completedAt: string;
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
  /** Pass 5B semantic layer instrumentation. */
  semanticFindingsCount: number;
  semanticCandidatesConsidered: number;
  semanticCandidatesRejected: number;
  semanticCandidatesAccepted: number;
  semanticCandidatesTruncated: boolean;
  semanticRejectionReasons: Record<string, number>;
  semanticBlocking: {
    tokensUsed: number;
    nonSelectiveTokens: string[];
    rowsRetrieved: number;
    rowsTruncated: boolean;
    cappedComponents: number;
    pairs: number;
  };
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
  /**
   * Page to read. Omit it (with `pageSize`) to receive every match.
   *
   * Kept optional for callers that need a single row; the review queue does not
   * page, because a reviewer works the whole filtered list.
   */
  page?: number;
  /**
   * Rows to read. Omitted by the review surfaces, which is what makes the
   * backend return the complete list rather than a silently truncated page.
   */
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
 * It carries the revision proof and notes ONLY, plus — for manufacturer and
 * category findings — an optional `targetEntityId` naming the existing ERP row
 * the reviewer assigned in place of the suggestion. The component field and its
 * new value are still decided by the backend from the finding type, and a
 * free-form value or a creation can never be expressed here, so the queue
 * cannot be used as a generic write API.
 */
export interface ApplyComponentFindingPayload {
  expectedFingerprint: string;
  decisionNotes?: string;
  targetEntityId?: string;
}

/** Machine-readable refusal reasons returned with HTTP 409. */
export type ApplyConflictReason =
  | "UNSUPPORTED_FINDING_TYPE"
  | "FINDING_NOT_PENDING"
  | "FINGERPRINT_MISMATCH"
  | "COMPONENT_CHANGED"
  | "SUGGESTED_ENTITY_NOT_FOUND"
  | "SUGGESTED_ENTITY_INACTIVE"
  | "INVALID_SUGGESTED_VALUE"
  | "COMPONENT_RETIRED"
  | "ATTRIBUTE_VALUE_CHANGED";

export interface ApplyComponentFindingResultDto {
  findingId: string;
  componentId: string;
  issueType: string;
  /** Backend-declared field that was written. */
  field:
    | "manufacturerPartNumber"
    | "manufacturerId"
    | "categoryId"
    | "attributes";
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
  /**
   * True when a reviewer-assigned manufacturer/category was written instead of
   * the suggested one. The backend records such an application as EDITED in the
   * feedback ledger.
   */
  assignmentEdited: boolean;
  /** The suggestion the assignment replaced, when one was recorded. */
  suggestedTarget: { id: string | null; name: string | null } | null;
}

export interface RunComponentAuditPayload {
  scope?: ComponentReviewAuditScope;
  componentIds?: string[];
  sinceDays?: number;
  limit?: number;
  includeInactive?: boolean;
}

/**
 * Ceiling applied to an explicitly requested page size.
 *
 * The review surfaces no longer page: omitting `pageSize` returns every matching
 * finding in one response, which is what a review list needs. The ceiling still
 * bounds a caller that asks for an explicit page — the catalog header chip reads
 * only the summary and asks for a single row.
 */
export const MAX_QUEUE_PAGE_SIZE = 100;

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
 * Only the fingerprint (revision proof) and optional notes are sent — the field
 * and its new value are decided by the backend. The one addition is an
 * assignment: when the reviewer replaced the suggestion with another existing
 * manufacturer/category, that row's id is sent so the backend writes the
 * reviewer's choice and records the decision as an edit. It is never sent when
 * it matches the suggestion, so an unedited acceptance still carries nothing
 * but the revision proof.
 */
export function buildApplyPayload(
  finding: Pick<ComponentReviewFindingDto, "fingerprint">,
  decisionNotes?: string,
  targetEntityId?: string | null,
): ApplyComponentFindingPayload {
  const payload: ApplyComponentFindingPayload = {
    expectedFingerprint: finding.fingerprint,
  };
  const notes = decisionNotes?.trim();
  if (notes) payload.decisionNotes = notes;
  const assigned = targetEntityId?.trim();
  if (assigned) payload.targetEntityId = assigned;
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
  /**
   * Reads the findings matching the given filters.
   *
   * `page`/`pageSize` are OPTIONAL and omitted by the review surfaces: without
   * them the backend returns every match, which is what a long review list needs.
   * They are still accepted for callers that want one row (the header counter
   * chip) or an explicit page.
   */
  listFindings: (
    params: ListComponentFindingsParams = {},
  ): Promise<ComponentReviewQueuePageDto> => {
    const pageSize =
      params.pageSize === undefined
        ? undefined
        : Math.min(
            Math.max(1, params.pageSize),
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
        page: params.page,
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

  /**
   * Builds a READ-ONLY consolidation preview for a duplicate finding.
   *
   * The endpoint analyses dependencies, conflicts and impact and never mutates
   * anything; `executable` is always false in this pass.
   */
  buildConsolidationPreview: (
    id: string,
    payload: ConsolidationPreviewPayload = {},
  ): Promise<ConsolidationPreviewDto> =>
    apiClient.post<ConsolidationPreviewDto, ConsolidationPreviewPayload>(
      `${BASE_PATH}/${encodeURIComponent(id)}/consolidation-preview`,
      payload,
    ),

  /**
   * Executes a consolidation.
   *
   * The backend recomputes the preview inside the consolidation transaction and
   * verifies `expectedPreviewFingerprint` before touching anything, so a stale
   * preview is refused rather than applied. `confirmation` must be exactly
   * `true`: the caller has to have shown the reviewer what will change.
   *
   * The operation is all-or-nothing. A refusal throws, and nothing is mutated.
   */
  consolidateComponent: (
    id: string,
    payload: ConsolidationExecutionPayload,
  ): Promise<ConsolidationResultDto> =>
    apiClient.post<ConsolidationResultDto, ConsolidationExecutionPayload>(
      `${BASE_PATH}/${encodeURIComponent(id)}/consolidate`,
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
