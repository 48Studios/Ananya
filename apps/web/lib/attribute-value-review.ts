import type {
  AttributeCandidateDto,
  AttributeInapplicableReason,
  DocumentAnalysisDto,
  DocumentAnalysisStateDto,
} from "./api/documentation-intelligence-api";
import type {
  ApplyComponentFindingResultDto,
  ComponentReviewFindingDto,
} from "./api/component-review-queue-api";
/**
 * Attribute Value Review in the documentation context (Pass 3).
 *
 * Pure presentation logic for reviewing extracted specifications exactly where
 * they were found: what state each specification is in, which actions are
 * available, what the reviewer is told when an action is refused, and how the
 * analysis state is updated after a decision or an application.
 *
 * Two boundaries are enforced here as well as in the API:
 *  - nothing in this module writes component data; applying goes through the
 *    existing review-queue apply endpoint;
 *  - an action is only offered when it can actually succeed, so the UI never
 *    presents a control the backend would refuse.
 */

// ---------------------------------------------------------------------------
// Review state
// ---------------------------------------------------------------------------

export const CANDIDATE_REVIEW_STATE_LABELS: Record<string, string> = {
  PENDING: "Awaiting review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DISMISSED: "Dismissed",
  STALE: "Stale — re-analyze required",
};

export function candidateReviewStateLabel(
  status: string | null | undefined,
): string | null {
  if (!status) return null;
  return CANDIDATE_REVIEW_STATE_LABELS[status] ?? status;
}

/** Why a specification is not actionable, in the reviewer's terms. */
export const INAPPLICABLE_REASON_LABELS: Record<
  AttributeInapplicableReason,
  string
> = {
  ATTRIBUTE_NOT_FOUND: "Attribute definition not found",
  ATTRIBUTE_NOT_ACTIVE: "Attribute definition is inactive",
  AMBIGUOUS_ATTRIBUTE: "Matches more than one attribute",
  INVALID_VALUE: "Value does not fit the attribute type",
  VALUE_ALREADY_CURRENT: "Component already records this value",
};

export function inapplicableReasonLabel(
  reason: AttributeInapplicableReason | null,
): string | null {
  if (!reason) return null;
  return INAPPLICABLE_REASON_LABELS[reason] ?? reason;
}

/** Short badge text for a specification row. */
export function candidateStatusBadge(candidate: AttributeCandidateDto): string {
  if (candidate.review?.applied) return "Applied";
  const label = candidateReviewStateLabel(candidate.review?.status);
  if (label) return label;
  if (!candidate.applicable) {
    return inapplicableReasonLabel(candidate.inapplicableReason) ?? "Not actionable";
  }
  return candidate.conflict ? "Conflict" : "Not analyzed";
}

/** True when the specification can be applied right now. */
export function canApplyCandidate(
  candidate: AttributeCandidateDto,
  canWriteComponents: boolean,
): boolean {
  return (
    canWriteComponents &&
    candidate.applicable &&
    candidate.review?.status === "PENDING" &&
    candidate.review.findingId !== null &&
    !candidate.review.applied
  );
}

/** True when a decision (accept / reject / dismiss) can be recorded. */
export function canDecideCandidate(
  candidate: AttributeCandidateDto,
  canWriteComponents: boolean,
): boolean {
  if (!canWriteComponents) return false;
  const status = candidate.review?.status;
  return (
    Boolean(candidate.review?.findingId) &&
    (status === "PENDING" || status === "STALE")
  );
}

/** Explains why Apply is unavailable, so a dead control is never shown. */
export function applyUnavailableReason(
  candidate: AttributeCandidateDto,
  canWriteComponents: boolean,
): string | null {
  if (candidate.review?.applied) {
    return "This value was already applied to the component.";
  }
  if (candidate.review?.status === "STALE") {
    return "This suggestion is stale because the component changed after it was extracted. Re-run datasheet analysis to refresh it.";
  }
  if (
    candidate.review?.status === "REJECTED" ||
    candidate.review?.status === "DISMISSED"
  ) {
    return "This suggestion was closed without applying it.";
  }
  if (candidate.review?.status === "ACCEPTED") {
    return "This suggestion is accepted. Apply it to write the value to the component.";
  }
  if (!candidate.applicable) {
    return (
      inapplicableReasonLabel(candidate.inapplicableReason) ??
      "This specification cannot be applied automatically."
    );
  }
  if (!canWriteComponents) {
    return "Applying a specification writes to the component, which requires the Inventory.Update permission.";
  }
  if (!candidate.review?.findingId) {
    return "Analysis did not create a review item for this specification.";
  }
  return null;
}

/** Copy for an applied or decided specification row. */
export function candidateOutcomeNotice(
  candidate: AttributeCandidateDto,
): string | null {
  if (candidate.review?.applied) {
    return `Applied to the component. The recorded value was ${
      candidate.currentValue ?? "not set"
    }.`;
  }
  if (candidate.review?.status === "ACCEPTED") {
    return "Accepted. Nothing has been written to the component yet.";
  }
  if (candidate.review?.status === "REJECTED") {
    return "Rejected. The component was not modified.";
  }
  if (candidate.review?.status === "DISMISSED") {
    return "Dismissed. The component was not modified.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const CANDIDATE_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "NEEDS_REVIEW", label: "Needs review" },
  { id: "CONFLICTS", label: "Conflicts" },
  { id: "ACCEPTED", label: "Accepted" },
  { id: "APPLIED", label: "Applied" },
  { id: "INVALID", label: "Not actionable" },
] as const;

export type CandidateFilterId = (typeof CANDIDATE_FILTERS)[number]["id"];

/** Whether a specification belongs to a filter tab. */
export function matchesCandidateFilter(
  candidate: AttributeCandidateDto,
  filter: CandidateFilterId,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "NEEDS_REVIEW":
      return (
        candidate.applicable &&
        candidate.review?.status === "PENDING" &&
        !candidate.review.applied
      );
    case "CONFLICTS":
      return candidate.conflict;
    case "ACCEPTED":
      return (
        candidate.review?.status === "ACCEPTED" && !candidate.review.applied
      );
    case "APPLIED":
      return candidate.review?.applied === true;
    case "INVALID":
      return !candidate.applicable;
    default:
      return true;
  }
}

export function filterCandidates(
  candidates: AttributeCandidateDto[],
  filter: CandidateFilterId,
): AttributeCandidateDto[] {
  return candidates.filter((candidate) =>
    matchesCandidateFilter(candidate, filter),
  );
}

/** Count per filter, computed from the candidates themselves. */
export function buildCandidateFilterCounts(
  candidates: AttributeCandidateDto[],
): Record<CandidateFilterId, number> {
  const counts = {} as Record<CandidateFilterId, number>;
  for (const filter of CANDIDATE_FILTERS) {
    counts[filter.id] = candidates.filter((candidate) =>
      matchesCandidateFilter(candidate, filter.id),
    ).length;
  }
  return counts;
}

/**
 * Review progress for the analysis, stated from the candidates only.
 *
 * Returns `null` when nothing is reviewable, so the UI does not show a progress
 * strip for an analysis that produced no actionable specifications.
 */
export function summariseCandidateReview(
  candidates: AttributeCandidateDto[],
): {
  total: number;
  pending: number;
  accepted: number;
  applied: number;
  notActionable: number;
} | null {
  const actionable = candidates.filter((candidate) => candidate.applicable);
  if (actionable.length === 0) return null;

  return {
    total: candidates.length,
    pending: actionable.filter(
      (candidate) =>
        candidate.review?.status === "PENDING" && !candidate.review.applied,
    ).length,
    accepted: actionable.filter(
      (candidate) =>
        candidate.review?.status === "ACCEPTED" && !candidate.review.applied,
    ).length,
    applied: actionable.filter((candidate) => candidate.review?.applied).length,
    notActionable: candidates.length - actionable.length,
  };
}

// ---------------------------------------------------------------------------
// Targeted state updates
// ---------------------------------------------------------------------------

/**
 * Locates the specification a finding belongs to.
 *
 * Matched by fingerprint, which both the candidate's review block and the queue
 * response carry and which is stable for a given (component, attribute, value,
 * document revision) combination. Matching by fingerprint also means the web
 * layer needs no extra identifier exposed on the queue's finding contract.
 */
function replaceCandidateForFinding(
  analysis: DocumentAnalysisDto,
  finding: Pick<ComponentReviewFindingDto, "id" | "fingerprint">,
  update: (candidate: AttributeCandidateDto) => AttributeCandidateDto,
): DocumentAnalysisDto {
  return {
    ...analysis,
    attributes: analysis.attributes.map((candidate) =>
      candidate.review?.fingerprint === finding.fingerprint
        ? update(candidate)
        : candidate,
    ),
  };
}

/**
 * Applies a recorded decision to the analysis state.
 *
 * The queue returns the updated finding, so the candidate's review block is
 * rewritten from that response: no refetch, no page reload, and the row shows
 * exactly what the backend now stores.
 */
export function applyDecisionToAnalysis(
  analysis: DocumentAnalysisDto,
  finding: ComponentReviewFindingDto,
): DocumentAnalysisDto {
  return replaceCandidateForFinding(analysis, finding, (candidate) => ({
    ...candidate,
    review: {
      findingId: finding.id,
      status: finding.status,
      fingerprint: finding.fingerprint,
      isNew: false,
      applied: candidate.review?.applied ?? false,
    },
  }));
}

/**
 * Applies a completed application to the analysis state.
 *
 * The component now records the extracted value, so the row's `currentValue` is
 * updated too: leaving the old value would immediately show a contradiction the
 * reviewer just resolved.
 */
export function applyApplicationToAnalysis(
  analysis: DocumentAnalysisDto,
  finding: ComponentReviewFindingDto,
  result: ApplyComponentFindingResultDto,
): DocumentAnalysisDto {
  return replaceCandidateForFinding(analysis, finding, (candidate) => ({
    ...candidate,
    currentValue: result.appliedValueLabel ?? result.appliedValue ?? null,
    conflict: false,
    review: {
      findingId: finding.id,
      // The backend marks the finding ACCEPTED when it applies.
      status: finding.status,
      fingerprint: finding.fingerprint,
      isNew: false,
      applied: true,
    },
  }));
}

/** Rewrites the cached analysis for one document inside the state map. */
export function updateAnalysisInState(
  map: Record<string, DocumentAnalysisStateDto>,
  documentId: string,
  update: (analysis: DocumentAnalysisDto) => DocumentAnalysisDto,
): Record<string, DocumentAnalysisStateDto> {
  const current = map[documentId];
  if (!current?.analysis) return map;

  const nextAnalysis = update(current.analysis);
  return {
    ...map,
    [documentId]: {
      ...current,
      analysis: nextAnalysis,
      latestAnalysis:
        current.latestAnalysis?.id === nextAnalysis.id
          ? nextAnalysis
          : current.latestAnalysis,
    },
  };
}

/** Success message for an applied specification, from the API's own result. */
export function attributeApplySuccessMessage(
  result: Pick<
    ApplyComponentFindingResultDto,
    "fieldLabel" | "appliedValue" | "appliedValueLabel"
  >,
): string {
  const value = result.appliedValueLabel ?? result.appliedValue ?? "—";
  return `${result.fieldLabel} set to "${value}" on the component.`;
}

/** Copy shown while a decision or application is in flight. */
export const CANDIDATE_ACTION_PENDING_COPY = "Saving…";

/** Heading for the reviewable-specifications section. */
export function reviewSectionHeading(candidates: AttributeCandidateDto[]): string {
  const actionable = candidates.filter((candidate) => candidate.applicable).length;
  return `Extracted specifications (${actionable} of ${candidates.length} actionable)`;
}
