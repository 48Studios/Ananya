import type {
  AttributeCandidateDto,
  DocumentAnalysisDto,
  DocumentAnalysisFindingDto,
  DocumentAnalysisStateDto,
  DocumentEvidenceDto,
} from "./api/documentation-intelligence-api";
import type { DocumentDto } from "./api/documents-api";

/**
 * Documentation Intelligence presentation logic.
 *
 * Pure and React-free so every rule the analysis UI applies — who can be
 * analyzed, what an unresolved candidate means, how evidence is labelled, what
 * the summary says — is unit testable in this workspace (no DOM test library).
 *
 * The wording deliberately mirrors the backend's advisory stance: nothing here
 * claims a value was applied. Extracted values are suggestions a human accepts
 * through the existing review workflow.
 */

/** Existing write permission for component data (`Inventory.Update`). */
export const COMPONENT_WRITE_PERMISSION = "Inventory.Update";

/** Review queue route the analysis links into (existing Component queue). */
export const COMPONENT_REVIEW_QUEUE_ROUTE = "/components/review-queue";

// ---------------------------------------------------------------------------
// Analyze action availability
// ---------------------------------------------------------------------------

export interface AnalyzeActionState {
  /** True when the Analyze action should be offered at all. */
  visible: boolean;
  /** True when it can be clicked right now. */
  enabled: boolean;
  /** Why it is unavailable, for the tooltip/notice. */
  reason: string | null;
}

export interface AnalyzeActionInput {
  document: Pick<DocumentDto, "sourceType" | "documentType" | "mimeType" | "fileName">;
  eligibility: DocumentAnalysisStateDto["eligibility"] | null;
  /** True while a request for this document is in flight. */
  analyzing: boolean;
  /** True when the user may modify component data. */
  canWrite: boolean;
}

/**
 * Decides whether "Analyze with AI" is offered for a document.
 *
 * Server-side eligibility is the authority; the local checks only avoid
 * showing an action the API would refuse, and always explain why.
 */
export function deriveAnalyzeAction(input: AnalyzeActionInput): AnalyzeActionState {
  const { document, eligibility, analyzing, canWrite } = input;

  const looksEligible =
    document.sourceType === "UPLOADED_FILE" && document.documentType === "DATASHEET";
  if (!looksEligible && !eligibility) {
    return { visible: false, enabled: false, reason: null };
  }

  if (eligibility && !eligibility.available) {
    return { visible: false, enabled: false, reason: eligibility.message };
  }

  if (!canWrite) {
    return {
      visible: true,
      enabled: false,
      reason: `Analyzing a datasheet creates review suggestions, which requires the ${COMPONENT_WRITE_PERMISSION} permission.`,
    };
  }

  if (analyzing) {
    return { visible: true, enabled: false, reason: "Analysis is running." };
  }

  return { visible: true, enabled: true, reason: null };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  ANALYZING: "Analyzing",
  ANALYZED: "Analyzed",
  FINDINGS_AVAILABLE: "Findings available",
  ANALYSIS_FAILED: "Analysis failed",
};

export function analysisStatusLabel(status: string): string {
  return ANALYSIS_STATUS_LABELS[status] ?? status;
}

/** One-line status text for a document card. */
export function describeAnalysisStatus(
  analysis: Pick<
    DocumentAnalysisDto,
    "status" | "isCurrent" | "document" | "summary"
  >,
): string {
  if (analysis.status === "ANALYSIS_FAILED") {
    return "Analysis failed";
  }
  if (!analysis.isCurrent) {
    return `From datasheet v${analysis.document.documentVersion} — re-run for the current revision`;
  }
  if (analysis.summary.findingsPending > 0) {
    return `${analysis.summary.findingsPending} suggestion${
      analysis.summary.findingsPending === 1 ? "" : "s"
    } awaiting review`;
  }
  if (analysis.summary.extractedSpecifications > 0) {
    return `${analysis.summary.extractedSpecifications} specifications extracted`;
  }
  return "Analysis complete — nothing reviewable was found";
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export const CANDIDATE_RESOLUTION_LABELS: Record<string, string> = {
  DEFINITION_MATCHED: "Matched existing attribute",
  NO_DEFINITION: "Attribute definition not found",
  UNRESOLVED_VALUE: "Value could not be applied",
};

export function candidateResolutionLabel(resolution: string): string {
  return CANDIDATE_RESOLUTION_LABELS[resolution] ?? resolution;
}

/** True when the candidate can be applied through the attribute endpoint. */
export function isApplicableCandidate(
  candidate: Pick<AttributeCandidateDto, "resolution" | "attributeDefinitionId">,
): boolean {
  return (
    candidate.resolution === "DEFINITION_MATCHED" &&
    candidate.attributeDefinitionId !== null
  );
}

export function candidateMatchesConflict(
  candidate: Pick<AttributeCandidateDto, "conflict" | "currentValue">,
): boolean {
  return candidate.conflict && candidate.currentValue !== null;
}

/** Display name for a candidate: the ERP attribute name when resolved. */
export function candidateHeading(candidate: AttributeCandidateDto): string {
  return candidate.attributeName ?? candidate.attributeCode ?? candidate.extractedCode;
}

/**
 * Whether a formatted extraction already shows its unit.
 *
 * The extractor renders the unit whenever it recognized one (`330Ω`, `1%`,
 * `0.125W`), so a letter, a percent sign, or a unit symbol after the number
 * means the value is complete; only a bare number (`330`) needs the definition's
 * unit appended. Mirrors `formattedCarriesUnit` in the API's review model, so a
 * reviewer never reads "330Ω ohm".
 */
function formattedCarriesUnit(formatted: string): boolean {
  return /[a-z%°Ωµμ]/i.test(formatted);
}

export function candidateValueText(candidate: AttributeCandidateDto): string {
  const formatted = candidate.formatted.trim();
  const unit = candidate.unit?.trim();
  if (!unit || formattedCarriesUnit(formatted)) return formatted;
  return `${formatted} ${unit}`;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Where an evidence item came from, in the reviewer's terms.
 *
 * A page number is claimed only when the extractor located the value; otherwise
 * the source is described as the document, never as a fabricated page.
 */
export function describeEvidenceSource(
  evidence: Pick<
    DocumentEvidenceDto,
    "documentFileName" | "documentVersion" | "page"
  >,
): string {
  const name = evidence.documentFileName ?? "Datasheet";
  const page = evidence.page === null ? null : `Page ${evidence.page}`;
  return [name, `v${evidence.documentVersion}`, page]
    .filter((part): part is string => Boolean(part))
    .join(" • ");
}

/** Evidence grouped for display: the excerpt is the primary evidence. */
export interface EvidenceViewModel {
  id: string;
  source: string;
  description: string;
  excerpt: string | null;
  page: number | null;
  extractionMethod: string;
  weight: number;
}

export function buildEvidenceViewModel(
  evidence: DocumentEvidenceDto[],
): EvidenceViewModel[] {
  return evidence.map((item, index) => ({
    id: `${item.documentId}-${item.page ?? "na"}-${index}`,
    source: describeEvidenceSource(item),
    description: item.description,
    excerpt: item.text,
    page: item.page,
    extractionMethod: item.extractionMethod,
    weight: item.weight,
  }));
}

/** True when an evidence item can quote the document. */
export function hasDocumentExcerpt(
  evidence: Pick<DocumentEvidenceDto, "text">,
): boolean {
  return typeof evidence.text === "string" && evidence.text.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Summary / review integration
// ---------------------------------------------------------------------------

export interface AnalysisSummaryRow {
  label: string;
  value: string;
  hint: string;
}

/**
 * Builds the post-analysis summary.
 *
 * Every number comes from the analysis payload; nothing is estimated, and rows
 * with nothing to report are omitted rather than shown as zero noise.
 */
export function buildAnalysisSummaryRows(
  analysis: Pick<DocumentAnalysisDto, "summary" | "identity" | "pageCount">,
): AnalysisSummaryRow[] {
  const rows: AnalysisSummaryRow[] = [];
  const { summary, identity } = analysis;

  if (identity.manufacturerName) {
    rows.push({
      label: "Manufacturer",
      value: identity.manufacturerName,
      hint:
        identity.manufacturerResolution === "EXISTING"
          ? "Matched an existing manufacturer"
          : "Suggested manufacturer",
    });
  }

  if (identity.manufacturerPartNumber) {
    rows.push({
      label: "Manufacturer part number",
      value: identity.manufacturerPartNumber,
      hint:
        identity.manufacturerPartNumberSource === "DOCUMENT_TEXT"
          ? "Found in the document text"
          : identity.manufacturerPartNumberSource === "DOCUMENT_FILE_NAME"
            ? "Taken from the file name"
            : "From component intelligence",
    });
  }

  if (summary.matchedDefinitions > 0) {
    rows.push({
      label: "Extracted specifications",
      value: String(summary.matchedDefinitions),
      hint: "Matched an existing attribute definition",
    });
  }

  if (summary.unresolvedDefinitions > 0) {
    rows.push({
      label: "Unresolved properties",
      value: String(summary.unresolvedDefinitions),
      hint: "No matching attribute definition",
    });
  }

  if (summary.unresolvedValues > 0) {
    rows.push({
      label: "Unapplied values",
      value: String(summary.unresolvedValues),
      hint: "Extracted value does not fit the attribute type",
    });
  }

  if (summary.conflicts > 0) {
    rows.push({
      label: "Conflicts with recorded values",
      value: String(summary.conflicts),
      hint: "The component already records a different value",
    });
  }

  if (summary.evidenceCount > 0) {
    rows.push({
      label: "Evidence items",
      value: String(summary.evidenceCount),
      hint: "Each one cites the document it came from",
    });
  }

  if (summary.findingsPending > 0) {
    rows.push({
      label: "Review suggestions",
      value: String(summary.findingsPending),
      hint: "Waiting in the Component Review Queue",
    });
  }

  return rows;
}

/** Candidates that a human can act on, for the "review" section. */
export function applicableCandidates(
  candidates: AttributeCandidateDto[],
): AttributeCandidateDto[] {
  return candidates.filter(isApplicableCandidate);
}

export function unresolvedCandidates(
  candidates: AttributeCandidateDto[],
): AttributeCandidateDto[] {
  return candidates.filter((candidate) => !isApplicableCandidate(candidate));
}

/**
 * True when the analysis produced something a reviewer should look at.
 *
 * Used to decide whether to offer "Review suggestions" and to avoid implying
 * there is work when there is none.
 */
export function hasReviewableOutput(
  analysis: Pick<DocumentAnalysisDto, "findings" | "attributes">,
): boolean {
  return (
    analysis.findings.some((finding) => finding.status === "PENDING") ||
    applicableCandidates(analysis.attributes).length > 0
  );
}

/** Review-queue link for the analysed component. */
export function reviewQueueHref(): string {
  return COMPONENT_REVIEW_QUEUE_ROUTE;
}

/** Copy for the finding list, naming the document that produced it. */
export function describeFindingForDocument(
  finding: Pick<DocumentAnalysisFindingDto, "issueType" | "title" | "status">,
  document: Pick<DocumentAnalysisDto["document"], "fileName" | "documentVersion">,
): string {
  const name = document.fileName ?? "the datasheet";
  return `${finding.title} — from ${name} v${document.documentVersion}${
    finding.status === "STALE" ? " (superseded)" : ""
  }`;
}

// ---------------------------------------------------------------------------
// Targeted state updates (no query library in this app)
// ---------------------------------------------------------------------------

/** Analysis state keyed by document id. */
export type AnalysisStateMap = Record<string, DocumentAnalysisStateDto>;

export function applyAnalysisState(
  map: AnalysisStateMap,
  documentId: string,
  state: DocumentAnalysisStateDto,
): AnalysisStateMap {
  return { ...map, [documentId]: state };
}

/**
 * Merges a completed run into one document's cached state.
 *
 * The single source of truth for "what does the UI show after an analysis
 * finishes": the response replaces the analysis and clears the in-flight flag,
 * while the previously resolved eligibility is kept because it cannot have
 * changed.
 */
export function mergeAnalysisResult(
  current: DocumentAnalysisStateDto | null,
  result: { analysis: DocumentAnalysisDto },
): DocumentAnalysisStateDto {
  const documentId = result.analysis.document.documentId;
  return {
    documentId,
    eligibility: current?.eligibility ?? { available: true },
    analysis: result.analysis,
    latestAnalysis: result.analysis,
    inProgress: false,
  };
}

/** Merges a completed run into the cached state map. */
export function applyAnalysisResult(
  map: AnalysisStateMap,
  result: { analysis: DocumentAnalysisDto },
): AnalysisStateMap {
  const documentId = result.analysis.document.documentId;
  return {
    ...map,
    [documentId]: mergeAnalysisResult(map[documentId] ?? null, result),
  };
}

/** Optimistic "analyzing" flag, cleared by the resolved result or an error. */
export function markAnalysisInProgress(
  map: AnalysisStateMap,
  documentId: string,
  inProgress: boolean,
): AnalysisStateMap {
  const previous = map[documentId];
  if (!previous) return map;
  return {
    ...map,
    [documentId]: { ...previous, inProgress },
  };
}

/**
 * Error copy for a failed analysis run.
 *
 * The API already returns a human message for the cases it can explain (too
 * large, missing file, ML unavailable); anything else falls back to a clear
 * statement that nothing was changed.
 */
export function analysisFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.trim().length > 0) return message;
  return "The datasheet could not be analyzed. Nothing on the component was changed.";
}

/** Copy shown while an analysis is running. */
export const ANALYSIS_RUNNING_COPY =
  "Extracting specifications from the datasheet. This can take a few seconds.";

/** Copy shown when a stored analysis belongs to an older revision. */
export function supersededAnalysisNotice(
  analysis: Pick<DocumentAnalysisDto, "isCurrent" | "document">,
): string | null {
  if (analysis.isCurrent) return null;
  const version = analysis.document.documentVersion;
  return `This analysis is from version ${version} of the document, which is no longer the current revision in Ananya. Its evidence no longer describes the file that is stored now. Re-run the analysis to review the current revision, or open the Component Review Queue to see whether the suggestions were already superseded.`;
}
