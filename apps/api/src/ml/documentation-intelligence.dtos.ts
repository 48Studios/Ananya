import type { DocumentType } from '../documents/document-types';
import type { DocumentActor } from '../documents/documents.service';
import type { DatasheetSection, EvidenceRole } from './specification-evidence';

/**
 * Datasheet Documentation Intelligence — contract.
 *
 * This module is the *only* place where the Python extractor's wire format is
 * interpreted. Nothing outside it may consume a raw ML response: the Nest layer
 * converts the extraction into the versioned, evidence-backed shapes below, so
 * a change to the Python payload cannot silently leak into the ERP.
 *
 * Architectural rule enforced by this contract: documentation intelligence is
 * ADVISORY. Nothing here is applicable by the machinery that produces it. Identity
 * candidates become ordinary Component Review Queue findings (existing types,
 * existing fingerprinting, existing authenticated apply workflow); extracted
 * specifications become reviewable candidates that a human applies through the
 * existing component attribute endpoint. No component field is ever written by
 * analysis.
 */

/**
 * Version of the extraction contract consumed by this layer.
 *
 * Bumped when the mapping (not the extractor) changes meaning. It is stored on
 * every analysis row and folded into every finding fingerprint, so a bump makes
 * old results identifiable and recomputable instead of silently reinterpreted.
 */
export const DATASHEET_INTELLIGENCE_VERSION = 'datasheet-extract-v2';

/** Producer tag for findings produced by document analysis. */
export const DOCUMENT_ANALYSIS_SOURCE = 'document:datasheet';

/**
 * Document types that can be analyzed for specifications.
 *
 * Pass 2 analysed datasheets only. Pass 4 compares specifications across a
 * component's documents, so the set is widened to the types that legitimately
 * state a specification — deliberately bounded, and ordered by how authoritative
 * the source is for a *specification*. Nothing here resolves a conflict between
 * them: the order is documentation, and no source silently outranks another.
 */
export const ANALYZABLE_DOCUMENT_TYPES: readonly DocumentType[] = [
  'DATASHEET',
  'TECHNICAL_MANUAL',
  'PRODUCT_PAGE',
  'REFERENCE_DESIGN',
  'APPLICATION_NOTE',
  'TEST_REPORT',
  'CERTIFICATE',
];

/**
 * The document type Pass 2 named in its contract.
 *
 * Kept because it is the canonical specification source and because stored
 * analyses and findings reference it; `ANALYZABLE_DOCUMENT_TYPES` is the set
 * that is actually accepted.
 */
export const ANALYZABLE_DOCUMENT_TYPE: DocumentType = 'DATASHEET';

/** Only PDF bytes are supported by the existing extractor. */
export const ANALYZABLE_MIME_TYPE = 'application/pdf';

/**
 * The extractor reads at most five pages; a larger PDF is still analyzable, but
 * the analysis records how much of it was actually read.
 */
export const MAX_ANALYZED_PAGES = 5;

/**
 * Bound on the text forwarded to the existing identity/category intelligence.
 * Identity keywords live in the document header, and this keeps the lexical
 * pass bounded for very large documents.
 */
export const MAX_IDENTITY_TEXT_CHARS = 8000;

/**
 * Longest PDF handed to the extractor. Mirrors the ML service's own request
 * bound (`apps/ml/app/config.py`, 10 MB decoded payload) so the API refuses an
 * oversized document with a clear message instead of producing a confusing ML
 * failure. Never silently raised: the ML limit is the authority.
 */
export const MAX_ANALYZABLE_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Analysis lifecycle. Mirrors the `status` column on the analysis table. */
export const DOCUMENT_ANALYSIS_STATUSES = [
  'ANALYZING',
  'ANALYZED',
  'FINDINGS_AVAILABLE',
  'ANALYSIS_FAILED',
] as const;

export type DocumentAnalysisStatus =
  (typeof DOCUMENT_ANALYSIS_STATUSES)[number];

/** Why a document cannot be analyzed. Machine-readable for the UI. */
export const ANALYSIS_UNAVAILABLE_REASONS = [
  'EXTERNAL_REFERENCE',
  'NOT_A_DATASHEET',
  'NOT_A_PDF',
  'MISSING_STORAGE_OBJECT',
  'TOO_LARGE',
] as const;

export type AnalysisUnavailableReason =
  (typeof ANALYSIS_UNAVAILABLE_REASONS)[number];

export interface AnalysisUnavailable {
  available: false;
  reason: AnalysisUnavailableReason;
  message: string;
}

export interface AnalysisAvailable {
  available: true;
}

export type AnalysisEligibility = AnalysisAvailable | AnalysisUnavailable;

/**
 * How an extracted property maps onto the ERP attribute system.
 */
export const ATTRIBUTE_CANDIDATE_RESOLUTIONS = [
  /** Matched an existing attribute definition and the value was coerced. */
  'DEFINITION_MATCHED',
  /** No attribute definition exists for the extracted property. */
  'NO_DEFINITION',
  /** A definition exists but the extracted value could not be represented. */
  'UNRESOLVED_VALUE',
] as const;

export type AttributeCandidateResolution =
  (typeof ATTRIBUTE_CANDIDATE_RESOLUTIONS)[number];

/**
 * How well an extracted property maps onto the authoritative attribute catalog.
 *
 *  - RESOLVED   — exactly one attribute definition matches and can represent it
 *  - AMBIGUOUS  — several definitions match; choosing one is a human decision
 *  - UNRESOLVED — no definition matches
 */
export const ATTRIBUTE_RESOLUTION_STATES = [
  'RESOLVED',
  'AMBIGUOUS',
  'UNRESOLVED',
] as const;

export type AttributeResolutionState =
  (typeof ATTRIBUTE_RESOLUTION_STATES)[number];

/**
 * Whether the extracted value can be written to the resolved attribute.
 *
 *  - VALID           — provably representable; may be applied once accepted
 *  - INVALID         — not representable; never executable
 *  - REQUIRES_REVIEW — representable, but it contradicts a recorded value
 */
export const ATTRIBUTE_VALIDATION_STATES = [
  'VALID',
  'INVALID',
  'REQUIRES_REVIEW',
] as const;

export type AttributeValidationState =
  (typeof ATTRIBUTE_VALIDATION_STATES)[number];

/**
 * Why a value is INVALID, in terms of the existing attribute value
 * representation. Reported by the same switch that performs the coercion, so the
 * reason always describes the refusal that actually happened.
 */
export const ATTRIBUTE_VALIDATION_REASONS = [
  'ATTRIBUTE_TYPE_MISMATCH',
  'INVALID_NUMBER',
  'INVALID_INTEGER',
  'INVALID_BOOLEAN',
  'INVALID_SELECT_OPTION',
  'INVALID_MULTI_SELECT_OPTION',
  'INVALID_DATE',
  'INVALID_QUANTITY',
  'UNIT_MISMATCH',
  /**
   * The extracted unit is a real unit, but measures a different dimension than
   * the attribute declares (a `mV` reading on a resistance attribute). The
   * comparison layer refuses to convert across dimensions, so the value is not
   * written rather than stored under the wrong dimension.
   */
  'UNIT_CATEGORY_MISMATCH',
  'UNSUPPORTED_UNIT_CONVERSION',
  'VALUE_OUT_OF_RANGE',
] as const;

export type AttributeValidationReason =
  (typeof ATTRIBUTE_VALIDATION_REASONS)[number];

/**
 * Why a candidate cannot become an actionable finding.
 *
 * Distinct from a validation reason: a value can be perfectly VALID and still
 * not actionable (the component already records it), and an unresolved property
 * is not an invalid value — it is a property this ERP has no attribute for.
 */
export const ATTRIBUTE_INAPPLICABLE_REASONS = [
  /** No attribute definition matches the extracted property. */
  'ATTRIBUTE_NOT_FOUND',
  /** A definition matches but is deactivated. */
  'ATTRIBUTE_NOT_ACTIVE',
  /** Several definitions match; choosing one is a human decision. */
  'AMBIGUOUS_ATTRIBUTE',
  /** The definition cannot represent the extracted value. */
  'INVALID_VALUE',
  /** The component already records exactly this value. */
  'VALUE_ALREADY_CURRENT',
] as const;

export type AttributeInapplicableReason =
  (typeof ATTRIBUTE_INAPPLICABLE_REASONS)[number];

/** Review state of one extracted specification. */
export interface AttributeCandidateReviewState {
  resolutionState: AttributeResolutionState;
  validationState: AttributeValidationState;
  validationReason: AttributeValidationReason | null;
  /** True when the candidate may become a reviewable, applicable finding. */
  applicable: boolean;
  inapplicableReason: AttributeInapplicableReason | null;
}

/** Review outcome of a candidate, once its finding has been persisted. */
export interface AttributeCandidateReviewDto {
  /** Finding id, when an actionable finding was persisted for this candidate. */
  findingId: string | null;
  /**
   * Persisted review state. A plain string, mirroring the finding row's `status`
   * column exactly as {@link DocumentAnalysisFindingDto} does; the canonical
   * vocabulary lives in `COMPONENT_REVIEW_STATUSES`.
   */
  status: string;
  fingerprint: string | null;
  /** True when this analysis produced the finding rather than refreshing it. */
  isNew: boolean;
  /**
   * True when the stored value was applied to the component through the review
   * workflow. Read from the finding's application metadata; analysis never sets
   * it directly.
   */
  applied: boolean;
}

/** One evidence item, tied to the exact document revision that produced it. */
export interface DocumentEvidenceDto {
  type: string;
  description: string;
  weight: number;
  source?: string;
  /** Existing EvidenceItemDto-compatible extraction method tag. */
  extractionMethod: string;
  documentId: string;
  documentVersion: number;
  documentFileName: string | null;
  documentContentHash: string;
  /** 1-based page, only when the extractor could locate the value. */
  page: number | null;
  /** Verbatim excerpt of the analysed text that produced the value. */
  text: string | null;
  /**
   * What this item contributes: a specification section states the value
   * (PRIMARY), a secondary section repeats it (SUPPORTING), or it only appears
   * in prose (CONTEXTUAL). Derived from the section the extractor identified. A
   * document can only ever strengthen evidence when it states the value where a
   * specification belongs.
   */
  role: EvidenceRole;
  /** Datasheet section the extractor matched, or null when it could not tell. */
  section: DatasheetSection | null;
}

/**
 * One attribute definition candidate for an extracted property, ranked.
 *
 * Returned when the mapping is ambiguous, so a reviewer can see which attributes
 * claim the term and on what basis, instead of being told only that the system
 * could not choose.
 */
export interface AttributeResolutionCandidateDto {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  /** Deterministic ranking score, strongest first. Not shown as a formula. */
  score: number;
  /** Human-readable reasons this attribute is a candidate. */
  reasons: string[];
}

/** An extracted specification, with everything a reviewer needs to judge it. */
export interface AttributeCandidateDto {
  /** Property code as emitted by the extractor, e.g. `resistance`. */
  extractedCode: string;
  /** Display value exactly as extracted, e.g. `300Ω`. */
  formatted: string;
  unit: string | null;
  rawValue: unknown;
  confidence: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: DocumentEvidenceDto[];

  resolution: AttributeCandidateResolution;
  /** Human-readable reason when the candidate is not directly applicable. */
  resolutionDetail: string | null;

  /** Existing attribute definition this property maps onto, when it exists. */
  attributeDefinitionId: string | null;
  attributeCode: string | null;
  attributeName: string | null;
  dataType: string | null;

  /**
   * Value shaped for the existing component attribute endpoint
   * (`POST /components/:componentId/attributes`). `null` when unresolved.
   * The domain validates it again; this is a convenience, not the authority.
   */
  normalizedValue: unknown;
  optionCode: string | null;

  /** The component's current value for this attribute, when it has one. */
  currentValue: string | null;
  /** True when the component already records a different value. */
  conflict: boolean;

  /**
   * Pass 3 review state: whether this specification can become a reviewable,
   * applicable finding, and if not, exactly why (a reason and validation
   * detail are always supplied). Informational candidates remain visible with
   * `applicable: false` rather than being hidden or silently coerced.
   */
  resolutionState: AttributeResolutionState;
  validationState: AttributeValidationState;
  validationReason: AttributeValidationReason | null;
  applicable: boolean;
  inapplicableReason: AttributeInapplicableReason | null;
  /** Detail for an invalid value, mirroring the domain's own wording. */
  validationDetail: string | null;

  /**
   * Pass 4 mapping quality: how confidently the property was matched onto the
   * attribute, and why. `resolutionReasons` is the human-readable evidence for
   * the mapping; `resolutionCandidates` lists the ranked alternatives whenever
   * the mapping is ambiguous, so "ambiguous" is explainable rather than final.
   */
  resolutionConfidence: number;
  resolutionReasons: string[];
  resolutionCandidates: AttributeResolutionCandidateDto[];

  /** The finding that carries this candidate into review, when there is one. */
  review: AttributeCandidateReviewDto | null;
}

/** Identity candidates, resolved by the existing component intelligence. */
export interface DocumentIdentityDto {
  manufacturerName: string | null;
  /** Resolved against the ERP manufacturer table by existing intelligence. */
  manufacturerId: string | null;
  manufacturerCode: string | null;
  manufacturerResolution: string | null;
  manufacturerMatchType: string | null;
  manufacturerConfidence: number | null;
  manufacturerConfidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  manufacturerPartNumber: string | null;
  /** Where the MPN candidate came from, so a reviewer can weigh it. */
  manufacturerPartNumberSource: string | null;
  manufacturerPartNumberConfidence: number | null;

  categoryName: string | null;
  categoryId: string | null;
  evidence: DocumentEvidenceDto[];
}

/** Counts computed from the actual extraction — never estimated. */
export interface DocumentAnalysisSummaryDto {
  extractedSpecifications: number;
  matchedDefinitions: number;
  /** Extracted properties with no attribute definition in the ERP. */
  unresolvedDefinitions: number;
  /** Definitions that exist but could not represent the extracted value. */
  unresolvedValues: number;
  /** Candidates that contradict a value the component already records. */
  conflicts: number;
  evidenceCount: number;
  findingsCreated: number;
  findingsPending: number;
}

/** A finding this analysis produced, as returned to the caller. */
export interface DocumentAnalysisFindingDto {
  id: string;
  issueType: string;
  issueCategory: string;
  field: string | null;
  title: string;
  status: string;
  fingerprint: string;
  confidence: number | null;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  /** True when this run created the finding rather than refreshing it. */
  isNew: boolean;
  /**
   * Attribute definition the finding targets, for attribute-value suggestions.
   * Lets the UI attach review state to the matching candidate row directly,
   * instead of parsing the finding's `field` string.
   */
  attributeDefinitionId: string | null;
  /** True when the reviewer already applied this suggestion to the component. */
  applied: boolean;
}

/** Reference to the analysed document revision. */
export interface DocumentAnalysisDocumentRefDto {
  documentId: string;
  documentVersion: number;
  fileName: string | null;
  documentType: string | null;
  contentHash: string;
  fileSizeBytes: number | null;
}

/**
 * The current-state view of a document's analysis.
 *
 * `isCurrent` compares the analysis identity against the live document: a newer
 * uploaded revision makes older analyses historical without rewriting them, so
 * evidence never silently migrates to bytes it was not derived from.
 */
export interface DocumentAnalysisDto {
  id: string;
  document: DocumentAnalysisDocumentRefDto;
  componentId: string;
  status: DocumentAnalysisStatus;
  intelligenceVersion: string;
  extractorVersion: string | null;
  isCurrent: boolean;
  /** Set when a newer revision of the document exists. */
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

/** Response of `GET /ml/documents/:documentId/analysis`. */
export interface DocumentAnalysisStateDto {
  documentId: string;
  eligibility: AnalysisEligibility;
  /** Latest analysis for the current document version, when one exists. */
  analysis: DocumentAnalysisDto | null;
  /** Most recent analysis of any version, for historical context. */
  latestAnalysis: DocumentAnalysisDto | null;
  /** True while another request is analyzing this document. */
  inProgress: boolean;
}

/** Response of `POST /ml/documents/:documentId/analyze`. */
export interface RunDocumentAnalysisResultDto {
  analysis: DocumentAnalysisDto;
  /** Findings created by this run (as opposed to refreshed). */
  createdFindingCount: number;
  /** Findings from older revisions of this document marked stale by this run. */
  staledPreviousCount: number;
  durationMs: number;
}

/** Actor performing an analysis; identity always comes from the session. */
export type DocumentAnalysisActor = DocumentActor;

/**
 * Why an analysis is being run, which decides whether it materializes findings.
 *
 *  - `STANDALONE` (the default) is a direct analysis of one document. It is the
 *    Pass 3 entry point and materializes the document's own actionable
 *    attribute findings, which a reviewer can accept and apply.
 *
 *  - `AGGREGATION_SOURCE` is an analysis run as one input to a component-level
 *    aggregation. It records the extraction, the evidence and the analysis row
 *    exactly as before — the document's history and evidence are preserved — but
 *    it does **not** materialize per-document actionable attribute findings,
 *    because the component-level aggregate is the authoritative materialization
 *    point for those. Without this, every component-level run would create a
 *    suggestion per document only to retire it immediately, and re-running would
 *    revive and re-retire them: churn that grows the stale set for no benefit.
 *
 * Identity findings (MPN, manufacturer, category) are unaffected: they are
 * statements about the document itself, are idempotent by fingerprint, and are
 * not aggregated.
 */
export const DOCUMENT_ANALYSIS_PURPOSES = [
  'STANDALONE',
  'AGGREGATION_SOURCE',
] as const;

export type DocumentAnalysisPurpose =
  (typeof DOCUMENT_ANALYSIS_PURPOSES)[number];

export interface DocumentAnalysisOptions {
  purpose?: DocumentAnalysisPurpose;
}

export type { DocumentActor };

// ---------------------------------------------------------------------------
// Component-level specification intelligence (Pass 4)
// ---------------------------------------------------------------------------

/**
 * Document types that may contribute specification evidence to a component.
 *
 * The same bounded set as {@link ANALYZABLE_DOCUMENT_TYPES}, expressed once: a
 * document that cannot be analysed cannot contribute evidence either.
 */
export const SPECIFICATION_DOCUMENT_TYPES: readonly DocumentType[] =
  ANALYZABLE_DOCUMENT_TYPES;

/**
 * Bounds on a component-level analysis. Every one of these exists so a large
 * component cannot turn one request into unbounded work; they are never raised
 * silently.
 */
export const MAX_COMPONENT_DOCUMENTS_ANALYZED = 5;
export const MAX_COMPONENT_SPECIFICATIONS = 100;
export const MAX_EVIDENCE_ITEMS_PER_SPECIFICATION = 8;

/** One document's contribution to an aggregated specification. */
export interface SpecificationSourceDto {
  documentId: string;
  documentVersion: number;
  documentContentHash: string;
  documentFileName: string | null;
  documentType: string | null;
  /** Value as the document states it, e.g. `0.3kΩ`. */
  display: string;
  /** Comparable form (base unit / option code), for the reviewer's diff. */
  normalized: string | null;
  agreement: 'AGREES' | 'CONFLICTS' | 'INCOMPARABLE';
  erp: 'AGREES' | 'CONFLICTS' | 'ABSENT' | 'INCOMPARABLE';
  detail: string | null;
}

/** Sources that state the same value. */
export interface SpecificationValueGroupDto {
  display: string;
  normalized: string | null;
  agreement: 'AGREES' | 'CONFLICTS' | 'INCOMPARABLE';
  sources: SpecificationSourceDto[];
}

/**
 * One specification of a component, combined across its documents.
 *
 * `state` is the whole point: AGREED may be applied once a reviewer accepts it,
 * CONFLICT and NOT_ACTIONABLE never can, and ALREADY_CURRENT is informational.
 */
export interface SpecificationAggregateDto {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  dataType: string;
  /** Property code the extractor used, so the document wording stays visible. */
  extractedCode: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  state: 'AGREED' | 'CONFLICT' | 'ALREADY_CURRENT' | 'NOT_ACTIONABLE';
  /** Value to apply. Only set when the state is AGREED. */
  value: unknown;
  optionCode: string | null;
  display: string | null;
  sources: SpecificationSourceDto[];
  groups: SpecificationValueGroupDto[];
  evidence: DocumentEvidenceDto[];
  /** Documents that contributed evidence, agreeing or not. */
  documentCount: number;
  /**
   * Documents that state the agreed value. Never counts a disagreement, so a
   * conflict cannot read as corroboration.
   */
  agreeingDocumentCount: number;
  currentValue: string | null;
  erpComparison: string | null;
  erpAgreement: 'AGREES' | 'CONFLICTS' | 'ABSENT' | 'INCOMPARABLE';
  confidence: number;
  /** Human-readable reasons, positives first. Never a scoring formula. */
  confidenceReasons: string[];
  notApplicableReason: string | null;
  /** The review item carrying this specification, when one exists. */
  review: AttributeCandidateReviewDto | null;
}

/** Why a document was not analysed, and how many documents fell into it. */
export interface ComponentDocumentSkipDto {
  reason: string;
  message: string;
  documentIds: string[];
}

/** A specification the analysis could not map onto an attribute at all. */
export interface UnmappedSpecificationDto {
  extractedCode: string;
  formatted: string;
  resolutionState: AttributeResolutionState;
  inapplicableReason: AttributeInapplicableReason | null;
  /** Ranked candidates, when the mapping was ambiguous. */
  candidates: AttributeResolutionCandidateDto[];
  documentIds: string[];
}

/**
 * Component-level documentation summary.
 *
 * Computed from persisted findings and the analysis run, never from a client
 * cache: the counts are what the queue will actually show.
 */
export interface ComponentDocumentationSummaryDto {
  componentId: string;
  documentsAnalyzed: number;
  /** Eligible documents that were not analysed because of the bound. */
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

/** Response of `POST /ml/components/:componentId/documentation/analyze`. */
export interface RunComponentDocumentationAnalysisResultDto {
  summary: ComponentDocumentationSummaryDto;
  specifications: SpecificationAggregateDto[];
  unmapped: UnmappedSpecificationDto[];
  /** Findings created by this run (as opposed to refreshed in place). */
  createdFindingCount: number;
  /** Pending findings superseded by this run and marked stale. */
  staledFindingCount: number;
}

/**
 * Read-only view of a component's specification intelligence.
 *
 * Answers the same questions as the analysis run without re-running anything:
 * the summary is derived from the persisted findings, and the specifications are
 * re-aggregated from the stored analyses.
 */
export interface ComponentDocumentationStateDto {
  componentId: string;
  summary: ComponentDocumentationSummaryDto;
  specifications: SpecificationAggregateDto[];
  unmapped: UnmappedSpecificationDto[];
  /** Documents that could contribute evidence and are eligible for analysis. */
  eligibleDocumentIds: string[];
}
