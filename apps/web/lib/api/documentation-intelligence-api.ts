import { apiClient } from "../api-client";

/**
 * Datasheet Documentation Intelligence API client.
 *
 * Mirrors the versioned contract in
 * `apps/api/src/ml/documentation-intelligence.dtos.ts`. Every call targets the
 * existing documentation intelligence endpoints; nothing here mutates component
 * data — findings are reviewed through the existing Component Review Queue.
 */

export type DocumentAnalysisStatus =
  | "ANALYZING"
  | "ANALYZED"
  | "FINDINGS_AVAILABLE"
  | "ANALYSIS_FAILED";

export type AnalysisUnavailableReason =
  | "EXTERNAL_REFERENCE"
  | "NOT_A_DATASHEET"
  | "NOT_A_PDF"
  | "MISSING_STORAGE_OBJECT"
  | "TOO_LARGE";

export type AnalysisEligibilityDto =
  | { available: true }
  | {
      available: false;
      reason: AnalysisUnavailableReason;
      message: string;
    };

export type AttributeCandidateResolution =
  | "DEFINITION_MATCHED"
  | "NO_DEFINITION"
  | "UNRESOLVED_VALUE";

export type AttributeResolutionState =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "UNRESOLVED";

export type AttributeValidationState =
  | "VALID"
  | "INVALID"
  | "REQUIRES_REVIEW";

export type AttributeInapplicableReason =
  | "ATTRIBUTE_NOT_FOUND"
  | "ATTRIBUTE_NOT_ACTIVE"
  | "AMBIGUOUS_ATTRIBUTE"
  | "INVALID_VALUE"
  | "VALUE_ALREADY_CURRENT";

export type AttributeValidationReason =
  | "ATTRIBUTE_TYPE_MISMATCH"
  | "INVALID_NUMBER"
  | "INVALID_INTEGER"
  | "INVALID_BOOLEAN"
  | "INVALID_SELECT_OPTION"
  | "INVALID_MULTI_SELECT_OPTION"
  | "INVALID_DATE"
  | "INVALID_QUANTITY"
  | "UNIT_MISMATCH"
  | "UNIT_CATEGORY_MISMATCH"
  | "UNSUPPORTED_UNIT_CONVERSION"
  | "VALUE_OUT_OF_RANGE";

/**
 * What an evidence item contributes.
 *
 * Derived from the datasheet section the extractor matched: a specification table
 * states a value (PRIMARY), a secondary section repeats it (SUPPORTING), and a
 * value that only appears in prose is CONTEXTUAL.
 */
export type EvidenceRole = "PRIMARY" | "SUPPORTING" | "CONTEXTUAL";

/** Datasheet sections the extractor can identify. */
export type DatasheetSection =
  | "ELECTRICAL_CHARACTERISTICS"
  | "ABSOLUTE_MAXIMUM_RATINGS"
  | "ORDERING_INFORMATION"
  | "MECHANICAL"
  | "GENERAL";

/** One attribute a property could map onto, with why it is a candidate. */
export interface AttributeResolutionCandidateDto {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  score: number;
  reasons: string[];
}

/** Review outcome of a candidate, once its finding has been persisted. */
export interface AttributeCandidateReviewDto {
  findingId: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "DISMISSED" | "STALE" | null;
  fingerprint: string | null;
  isNew: boolean;
  applied: boolean;
}

export interface DocumentEvidenceDto {
  type: string;
  description: string;
  weight: number;
  source?: string;
  extractionMethod: string;
  documentId: string;
  documentVersion: number;
  documentFileName: string | null;
  documentContentHash: string;
  page: number | null;
  text: string | null;
  /** What this item contributes, from the section it was found in. */
  role: EvidenceRole;
  section: DatasheetSection | null;
}

export interface AttributeCandidateDto {
  extractedCode: string;
  formatted: string;
  unit: string | null;
  rawValue: unknown;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: DocumentEvidenceDto[];
  resolution: AttributeCandidateResolution;
  resolutionDetail: string | null;
  attributeDefinitionId: string | null;
  attributeCode: string | null;
  attributeName: string | null;
  dataType: string | null;
  normalizedValue: unknown;
  optionCode: string | null;
  currentValue: string | null;
  conflict: boolean;

  /** Pass 3 review state: whether this specification can be applied. */
  resolutionState: AttributeResolutionState;
  validationState: AttributeValidationState;
  validationReason: AttributeValidationReason | null;
  applicable: boolean;
  inapplicableReason: AttributeInapplicableReason | null;
  validationDetail: string | null;

  /**
   * Pass 4 mapping quality: how confidently the property was matched onto the
   * attribute, why, and — when the mapping is ambiguous — the ranked
   * alternatives, so "ambiguous" is explainable rather than final.
   */
  resolutionConfidence: number;
  resolutionReasons: string[];
  resolutionCandidates: AttributeResolutionCandidateDto[];

  /** The finding carrying this specification into review, when there is one. */
  review: AttributeCandidateReviewDto | null;
}

export interface DocumentIdentityDto {
  manufacturerName: string | null;
  manufacturerId: string | null;
  manufacturerCode: string | null;
  manufacturerResolution: string | null;
  manufacturerMatchType: string | null;
  manufacturerConfidence: number | null;
  manufacturerConfidenceLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  manufacturerPartNumber: string | null;
  manufacturerPartNumberSource: string | null;
  manufacturerPartNumberConfidence: number | null;
  categoryName: string | null;
  categoryId: string | null;
  evidence: DocumentEvidenceDto[];
}

export interface DocumentAnalysisSummaryDto {
  extractedSpecifications: number;
  matchedDefinitions: number;
  unresolvedDefinitions: number;
  unresolvedValues: number;
  conflicts: number;
  evidenceCount: number;
  findingsCreated: number;
  findingsPending: number;
}

export interface DocumentAnalysisFindingDto {
  id: string;
  issueType: string;
  issueCategory: string;
  field: string | null;
  title: string;
  status: string;
  fingerprint: string;
  confidence: number | null;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  isNew: boolean;
  /** Attribute definition an attribute-value finding targets. */
  attributeDefinitionId: string | null;
  /** True when a reviewer already applied this suggestion. */
  applied: boolean;
}

export interface DocumentAnalysisDto {
  id: string;
  document: {
    documentId: string;
    documentVersion: number;
    fileName: string | null;
    documentType: string | null;
    contentHash: string;
    fileSizeBytes: number | null;
  };
  componentId: string;
  status: DocumentAnalysisStatus;
  intelligenceVersion: string;
  extractorVersion: string | null;
  isCurrent: boolean;
  supersededByVersion: number | null;
  failureReason: string | null;
  pageCount: number | null;
  pagesAnalyzed: number | null;
  extractedTextPreview: string | null;
  identity: DocumentIdentityDto;
  summary: DocumentAnalysisSummaryDto;
  attributes: AttributeCandidateDto[];
  evidence: DocumentEvidenceDto[];
  findings: DocumentAnalysisFindingDto[];
  analyzedAt: string;
  analyzedByEmail: string | null;
}

export interface DocumentAnalysisStateDto {
  documentId: string;
  eligibility: AnalysisEligibilityDto;
  analysis: DocumentAnalysisDto | null;
  latestAnalysis: DocumentAnalysisDto | null;
  inProgress: boolean;
}

export interface RunDocumentAnalysisResultDto {
  analysis: DocumentAnalysisDto;
  createdFindingCount: number;
  staledPreviousCount: number;
  durationMs: number;
}

export const documentationIntelligenceApi = {
  getAnalysis: (documentId: string): Promise<DocumentAnalysisStateDto> =>
    apiClient.get<DocumentAnalysisStateDto>(
      `/ml/documents/${documentId}/analysis`,
    ),

  analyze: (documentId: string): Promise<RunDocumentAnalysisResultDto> =>
    apiClient.post<RunDocumentAnalysisResultDto, Record<string, never>>(
      `/ml/documents/${documentId}/analyze`,
      {},
    ),
};

// ---------------------------------------------------------------------------
// Component-level specification intelligence (Pass 4)
// ---------------------------------------------------------------------------

/** One document's contribution to an aggregated specification. */
export interface SpecificationSourceDto {
  documentId: string;
  documentVersion: number;
  documentContentHash: string;
  documentFileName: string | null;
  documentType: string | null;
  /** Value as the document states it, e.g. `0.3kΩ`. */
  display: string;
  /** Comparable form, so two equivalent values look the same. */
  normalized: string | null;
  agreement: "AGREES" | "CONFLICTS" | "INCOMPARABLE";
  erp: "AGREES" | "CONFLICTS" | "ABSENT" | "INCOMPARABLE";
  detail: string | null;
}

/** Sources that state the same value. */
export interface SpecificationValueGroupDto {
  display: string;
  normalized: string | null;
  agreement: "AGREES" | "CONFLICTS" | "INCOMPARABLE";
  sources: SpecificationSourceDto[];
}

export type SpecificationState =
  | "AGREED"
  | "CONFLICT"
  | "ALREADY_CURRENT"
  | "NOT_ACTIONABLE";

/**
 * One specification of a component, combined across its documents.
 *
 * `state` decides what a reviewer may do: AGREED can be applied once accepted,
 * CONFLICT and NOT_ACTIONABLE never can, and ALREADY_CURRENT is informational.
 */
export interface SpecificationAggregateDto {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  dataType: string;
  extractedCode: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  state: SpecificationState;
  /** Value to apply. Only set when the state is AGREED. */
  value: unknown;
  optionCode: string | null;
  display: string | null;
  sources: SpecificationSourceDto[];
  groups: SpecificationValueGroupDto[];
  evidence: DocumentEvidenceDto[];
  /** Documents that contributed evidence, agreeing or not. */
  documentCount: number;
  /** Documents that state the agreed value. Never counts a disagreement. */
  agreeingDocumentCount: number;
  currentValue: string | null;
  erpComparison: string | null;
  erpAgreement: "AGREES" | "CONFLICTS" | "ABSENT" | "INCOMPARABLE";
  confidence: number;
  /** Human-readable reasons, positives first. Never a scoring formula. */
  confidenceReasons: string[];
  notApplicableReason: string | null;
  review: AttributeCandidateReviewDto | null;
}

/** A specification the analysis could not map onto an attribute at all. */
export interface UnmappedSpecificationDto {
  extractedCode: string;
  formatted: string;
  resolutionState: AttributeResolutionState;
  inapplicableReason: AttributeInapplicableReason | null;
  candidates: AttributeResolutionCandidateDto[];
  documentIds: string[];
}

export interface ComponentDocumentSkipDto {
  reason: string;
  message: string;
  documentIds: string[];
}

/**
 * Server-derived counts for a component's documentation analysis.
 *
 * The review modal shows these as tab counts beside the specifications they
 * describe, so a number and the list it refers to are never in two places.
 */
export interface ComponentDocumentationSummaryDto {
  componentId: string;
  documentsAnalyzed: number;
  documentsNotAnalyzed: string[];
  documentsSkipped: ComponentDocumentSkipDto[];
  specificationsFound: number;
  needsReview: number;
  applied: number;
  conflicts: number;
  ambiguous: number;
  unresolved: number;
  notActionable: number;
  alreadyCurrent: number;
  analyzedAt: string;
  analyzedByEmail: string | null;
  durationMs: number;
}

export interface ComponentDocumentationStateDto {
  componentId: string;
  summary: ComponentDocumentationSummaryDto;
  specifications: SpecificationAggregateDto[];
  unmapped: UnmappedSpecificationDto[];
  eligibleDocumentIds: string[];
}

export interface RunComponentDocumentationAnalysisResultDto {
  summary: ComponentDocumentationSummaryDto;
  specifications: SpecificationAggregateDto[];
  unmapped: UnmappedSpecificationDto[];
  createdFindingCount: number;
  staledFindingCount: number;
}

export const componentSpecificationApi = {
  /**
   * The component's current specification intelligence.
   *
   * Only the component id is sent: which documents are read is derived on the
   * server from the component's own documentation, so the client cannot point
   * the analysis at another component's files.
   */
  getState: (componentId: string): Promise<ComponentDocumentationStateDto> =>
    apiClient.get<ComponentDocumentationStateDto>(
      `/ml/components/${componentId}/documentation`,
    ),

  /** Analyses every eligible document and aggregates the result. */
  analyze: (
    componentId: string,
  ): Promise<RunComponentDocumentationAnalysisResultDto> =>
    apiClient.post<
      RunComponentDocumentationAnalysisResultDto,
      Record<string, never>
    >(`/ml/components/${componentId}/documentation/analyze`, {}),
};
