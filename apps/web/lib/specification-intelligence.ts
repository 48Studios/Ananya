import type {
  ApplyComponentFindingResultDto,
  ComponentReviewFindingDto,
  ConfidenceLevel,
} from "./api/component-review-queue-api";
import type {
  ComponentDocumentationStateDto,
  ComponentDocumentationSummaryDto,
  DatasheetSection,
  DocumentEvidenceDto,
  EvidenceRole,
  SpecificationAggregateDto,
  SpecificationSourceDto,
  UnmappedSpecificationDto,
} from "./api/documentation-intelligence-api";
import {
  matchesConfidenceFilter,
  matchesStatusFilter,
} from "./intelligence-review-filters";

/**
 * Specification Intelligence presentation (Pass 4).
 *
 * Pure logic for showing what a component's documents say about it: how strong
 * the evidence is, whether the documents agree, what the component already
 * records, and what a reviewer is allowed to do about it.
 *
 * Two boundaries are enforced here as well as in the API:
 *  - nothing in this module decides a conflict. It renders one, and refuses to
 *    offer an action for it;
 *  - confidence is presented as the reasons behind it, never as a formula, and
 *    never as permission. A high-confidence value still needs a reviewer.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const SPECIFICATION_STATE_LABELS: Record<string, string> = {
  AGREED: "Ready to review",
  CONFLICT: "Documents disagree",
  ALREADY_CURRENT: "Already recorded",
  NOT_ACTIONABLE: "Not actionable",
};

export function specificationStateLabel(state: string): string {
  return SPECIFICATION_STATE_LABELS[state] ?? state;
}

/** Badge text for one specification row. */
export function specificationBadge(
  specification: SpecificationAggregateDto,
): string {
  if (specification.review?.applied) return "Applied";
  return specificationStateLabel(specification.state);
}

/** Whether a reviewer may apply this specification right now. */
export function canApplySpecification(
  specification: SpecificationAggregateDto,
  canWriteComponents: boolean,
): boolean {
  return (
    canWriteComponents &&
    specification.state === "AGREED" &&
    specification.review?.status === "PENDING" &&
    specification.review.findingId !== null &&
    !specification.review.applied
  );
}

/** Whether a reviewer may record a decision on this specification. */
export function canDecideSpecification(
  specification: SpecificationAggregateDto,
  canWriteComponents: boolean,
): boolean {
  if (!canWriteComponents) return false;
  const status = specification.review?.status;
  return (
    Boolean(specification.review?.findingId) &&
    (status === "PENDING" || status === "STALE")
  );
}

/**
 * Why an action is withheld, so the UI never shows a control that cannot work.
 *
 * A conflict is the important case: the system will not choose between sources,
 * and the copy says so rather than implying the reviewer forgot something.
 */
export function specificationUnavailableReason(
  specification: SpecificationAggregateDto,
  canWriteComponents: boolean,
): string | null {
  if (specification.review?.applied) {
    return "This value was already applied to the component.";
  }
  if (specification.state === "CONFLICT") {
    return "The component's documents disagree about this value. Decide which source is correct, then record the value on the component yourself — no source is applied automatically.";
  }
  if (specification.state === "ALREADY_CURRENT") {
    return "The component already records this value.";
  }
  if (specification.state === "NOT_ACTIONABLE") {
    return (
      specification.notApplicableReason ??
      "This specification cannot be applied automatically."
    );
  }
  if (specification.review?.status === "STALE") {
    return "This suggestion is stale because the component changed after it was extracted. Re-run the analysis to refresh it.";
  }
  if (
    specification.review?.status === "REJECTED" ||
    specification.review?.status === "DISMISSED"
  ) {
    return "This suggestion was closed without applying it.";
  }
  if (!canWriteComponents) {
    return "Applying a specification writes to the component, which requires the Inventory.Update permission.";
  }
  if (!specification.review?.findingId) {
    return "Analysis did not create a review item for this specification.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EVIDENCE_ROLE_LABELS: Record<EvidenceRole, string> = {
  PRIMARY: "Specification table",
  SUPPORTING: "Supporting section",
  CONTEXTUAL: "Contextual mention",
};

export const DATASHEET_SECTION_LABELS: Record<DatasheetSection, string> = {
  ELECTRICAL_CHARACTERISTICS: "Electrical characteristics",
  ABSOLUTE_MAXIMUM_RATINGS: "Absolute maximum ratings",
  ORDERING_INFORMATION: "Ordering information",
  MECHANICAL: "Mechanical data",
  GENERAL: "General information",
};

export function evidenceRoleLabel(role: EvidenceRole | null): string {
  return role ? (EVIDENCE_ROLE_LABELS[role] ?? role) : "Evidence";
}

export function sectionLabel(section: DatasheetSection | null): string | null {
  return section ? (DATASHEET_SECTION_LABELS[section] ?? section) : null;
}

/**
 * Where one evidence item came from, in the reviewer's terms.
 *
 * A page is named only when the extractor located the value; otherwise the
 * source is the document, never a fabricated page.
 */
export function describeSpecificationEvidence(input: {
  fileName: string | null;
  documentType: string | null;
  version: number;
  page: number | null;
  section: DatasheetSection | null;
}): string {
  const file = input.fileName ?? input.documentType ?? "document";
  const parts = [file];
  if (input.version > 1) parts.push(`v${input.version}`);
  const section = sectionLabel(input.section);
  if (section) parts.push(section);
  parts.push(input.page === null ? "page unknown" : `page ${input.page}`);
  return parts.join(" · ");
}

/**
 * How many independent documents state the agreed value.
 *
 * Read from the server-derived count, which never includes a document that
 * disagrees: one document is "from the datasheet", more than one is corroboration
 * — the point of the pass — so the copy says so explicitly.
 */
export function describeCorroboration(
  specification: SpecificationAggregateDto,
): string | null {
  if (specification.agreeingDocumentCount <= 1) return null;
  return `${specification.agreeingDocumentCount} documents agree on this value.`;
}

/** Whether any evidence came from a specification section. */
export function hasPrimaryEvidence(
  specification: SpecificationAggregateDto,
): boolean {
  return specification.evidence.some((item) => item.role === "PRIMARY");
}

/**
 * What the documents state, for the row's "Documented" line.
 *
 * `display` is only populated for a value that can actually be applied, so an
 * already-recorded or conflicting specification would otherwise read as "—" next
 * to a current value the reviewer can plainly see. The stated values are read
 * from the value groups instead — the same source `describeConflict` uses — so
 * the line always says what the documents say.
 */
export function documentedValueText(
  specification: SpecificationAggregateDto,
): string {
  if (specification.display) return specification.display;

  const stated =
    specification.groups.length > 0
      ? specification.groups.map((group) => group.display)
      : specification.sources.map((source) => source.display);

  const unique = [...new Set(stated.filter(Boolean))];
  return unique.length > 0 ? unique.join(" · ") : "—";
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/** The value groups a conflict is between, strongest first. */
export function conflictGroups(
  specification: SpecificationAggregateDto,
): Array<{ display: string; fileNames: string[]; documentIds: string[] }> {
  return specification.groups.map((group) => ({
    display: group.display,
    fileNames: group.sources.map(
      (source) => source.documentFileName ?? source.documentType ?? "document",
    ),
    documentIds: group.sources.map((source) => source.documentId),
  }));
}

/**
 * One line per side of a conflict, e.g. `datasheet.pdf says 50 V`.
 *
 * Written so a reviewer can read the disagreement without opening a file, and
 * with no hint that either side is preferred.
 */
export function describeConflict(
  specification: SpecificationAggregateDto,
): string[] {
  return conflictGroups(specification).map(
    (group) => `${group.fileNames.join(", ")} state ${group.display}`,
  );
}

/** How the evidence relates to the value the component records. */
export function describeErpComparison(
  specification: SpecificationAggregateDto,
): string | null {
  if (specification.erpAgreement === "ABSENT") {
    return "The component does not record this attribute.";
  }
  if (specification.erpAgreement === "AGREES") {
    return `The component already records ${specification.currentValue ?? "this value"}.`;
  }
  if (specification.erpAgreement === "CONFLICTS") {
    return `The component records ${specification.currentValue ?? "a different value"}.`;
  }
  return "The recorded value could not be compared with the documentation.";
}

/** Per-source agreement with the value the component records. */
export function sourceErpLabel(source: SpecificationSourceDto): string | null {
  switch (source.erp) {
    case "AGREES":
      return "agrees with the recorded value";
    case "CONFLICTS":
      return "differs from the recorded value";
    case "INCOMPARABLE":
      return "could not be compared";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Ambiguity
// ---------------------------------------------------------------------------

/** Whether a property could not be mapped onto exactly one attribute. */
export function isAmbiguous(unmapped: UnmappedSpecificationDto): boolean {
  return unmapped.resolutionState === "AMBIGUOUS";
}

/**
 * The ranked attributes a property could belong to, with why.
 *
 * Shown when the mapping is ambiguous, so "ambiguous" comes with the choices and
 * their reasons instead of being a dead end.
 */
export function describeAmbiguity(
  unmapped: UnmappedSpecificationDto,
): Array<{ name: string; reasons: string[] }> {
  return unmapped.candidates.map((candidate) => ({
    name: candidate.attributeName,
    reasons: candidate.reasons,
  }));
}

export function ambiguityHeading(unmapped: UnmappedSpecificationDto): string {
  return `${unmapped.formatted} could belong to more than one attribute`;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** Confidence as a percentage, for display. */
export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/**
 * The confidence bucket, on the thresholds the label already used.
 *
 * Exposed separately so a review card can badge the level with the design
 * system's canonical tones, the way the Component queue badges a finding's
 * confidence, instead of inventing a second scale.
 */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return "HIGH";
  if (confidence >= 0.6) return "MEDIUM";
  return "LOW";
}

/** A short word for the confidence, so a number is not the whole story. */
export function confidenceLevelLabel(confidence: number): string {
  const level = confidenceLevel(confidence);
  if (level === "HIGH") return "High confidence";
  if (level === "MEDIUM") return "Medium confidence";
  return "Low confidence";
}

/**
 * The reasons behind a confidence, split by direction.
 *
 * The API supplies these as `+ reason` / `- reason` strings; splitting them here
 * keeps the sign out of the rendering while leaving one source of truth.
 */
export function confidenceReasons(
  specification: SpecificationAggregateDto,
): { positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const reason of specification.confidenceReasons) {
    if (reason.startsWith("- ")) negative.push(reason.slice(2));
    else if (reason.startsWith("+ ")) positive.push(reason.slice(2));
    else positive.push(reason);
  }

  return { positive, negative };
}

// ---------------------------------------------------------------------------
// Card presentation
// ---------------------------------------------------------------------------

/**
 * Colour family for a review card's state chip.
 *
 * A vocabulary rather than a class name, so the rule for *which* family a
 * specification belongs to is testable and the class strings stay in the
 * component beside the rest of its styling.
 */
export type SpecificationChipTone =
  | "PRIMARY"
  | "WARNING"
  | "SUCCESS"
  | "NEUTRAL";

/**
 * The chip tone for one specification, mirroring the state it reports.
 *
 * An applied specification reads as success because the library change is the
 * outcome a reviewer is looking for; a conflict is the one state that always
 * needs a human, so it is the warning case.
 */
export function specificationChipTone(
  specification: SpecificationAggregateDto,
): SpecificationChipTone {
  if (specification.review?.applied) return "SUCCESS";
  switch (specification.state) {
    case "CONFLICT":
      return "WARNING";
    case "ALREADY_CURRENT":
      return "SUCCESS";
    case "NOT_ACTIONABLE":
      return "NEUTRAL";
    default:
      return "PRIMARY";
  }
}

/** Copy for a run that produced nothing, explaining why. */
export function emptySpecificationMessage(
  summary: ComponentDocumentationSummaryDto,
): string {
  if (summary.documentsAnalyzed === 0 && summary.documentsNotAnalyzed.length > 0) {
    return "None of this component's documents could be analyzed. Check that they are uploaded PDFs of a supported type.";
  }
  if (summary.documentsSkipped.length > 0) {
    return `No specifications were found. ${summary.documentsSkipped.length} document(s) could not be analyzed.`;
  }
  return "No specifications were found in this component's documents.";
}

/** A one-line description of what a run changed, from its own counts. */
export function describeRunOutcome(input: {
  createdFindingCount: number;
  staledFindingCount: number;
  documentsAnalyzed: number;
}): string {
  const parts: string[] = [];
  parts.push(
    input.documentsAnalyzed === 1
      ? "1 document analyzed"
      : `${input.documentsAnalyzed} documents analyzed`,
  );
  if (input.createdFindingCount > 0) {
    parts.push(
      input.createdFindingCount === 1
        ? "1 new specification"
        : `${input.createdFindingCount} new specifications`,
    );
  }
  if (input.staledFindingCount > 0) {
    parts.push(
      input.staledFindingCount === 1
        ? "1 superseded suggestion retired"
        : `${input.staledFindingCount} superseded suggestions retired`,
    );
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export const SPECIFICATION_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "NEEDS_REVIEW", label: "Needs review" },
  { id: "CONFLICTS", label: "Conflicts" },
  { id: "ALREADY_CURRENT", label: "Already recorded" },
  { id: "APPLIED", label: "Applied" },
  { id: "AMBIGUOUS", label: "Ambiguous" },
] as const;

export type SpecificationFilterId =
  (typeof SPECIFICATION_FILTERS)[number]["id"];

/**
 * The review filters this surface shares with the two review queues.
 *
 * Documentation Intelligence used to be the one review surface with no status or
 * confidence control: its tab row was the only way to narrow the list, and the
 * tab row mixes specification state ("Documents disagree") with review lifecycle
 * ("Applied"). Adding the same two selects the Component and Attribute queues
 * offer is what makes "what needs review, at what confidence" answerable here too.
 *
 * The selects are SCOPING filters: they narrow which specifications are under
 * discussion, so the tab counts describe the narrowed set (the rule both queues
 * document — counts ignore the navigation dimension, which here is the tab row).
 */
export interface SpecificationReviewFilters {
  /** Shared status vocabulary; `ALL` means "no status filter". */
  status: string;
  /** Shared confidence vocabulary; `ALL` means "no confidence filter". */
  confidence: string;
}

/** Whether a specification's review status matches the status filter. */
export function matchesSpecificationStatusFilter(
  specification: SpecificationAggregateDto,
  statusFilter: string,
): boolean {
  return matchesStatusFilter(specification.review?.status, statusFilter);
}

/** Whether a specification's confidence band matches the confidence filter. */
export function matchesSpecificationConfidenceFilter(
  specification: SpecificationAggregateDto,
  confidenceFilter: string,
): boolean {
  return matchesConfidenceFilter(
    confidenceLevel(specification.confidence),
    confidenceFilter,
  );
}

/** Whether a specification passes the shared review filters. */
export function matchesSpecificationReviewFilters(
  specification: SpecificationAggregateDto,
  filters: SpecificationReviewFilters,
): boolean {
  return (
    matchesSpecificationStatusFilter(specification, filters.status) &&
    matchesSpecificationConfidenceFilter(specification, filters.confidence)
  );
}

/** Whether a specification belongs to a filter. */
export function matchesSpecificationFilter(
  specification: SpecificationAggregateDto,
  filter: SpecificationFilterId,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "NEEDS_REVIEW":
      // Deliberately the server's definition, which is what the summary strip
      // shows: a finding that is still open. Deriving it from the aggregate
      // state instead would put a different number under the same label — a
      // conflict also gets a pending finding, and a suggestion accepted without
      // being applied stops being pending while staying AGREED.
      return (
        specification.review?.status === "PENDING" &&
        !specification.review.applied
      );
    case "CONFLICTS":
      return specification.state === "CONFLICT";
    case "ALREADY_CURRENT":
      return specification.state === "ALREADY_CURRENT";
    case "APPLIED":
      return specification.review?.applied === true;
    case "AMBIGUOUS":
      // Ambiguity is a property of an unmapped property, not of a mapped one;
      // this filter exists so the chip counts stay comparable across the row.
      return false;
    default:
      return true;
  }
}

/** Counts per filter, from the specifications themselves.
 *
 * Computed over the specifications that already passed the shared review filters,
 * so the tabs describe the set the reviewer narrowed to rather than the whole
 * component.
 */
export function buildSpecificationFilterCounts(
  specifications: SpecificationAggregateDto[],
  unmapped: UnmappedSpecificationDto[],
): Record<SpecificationFilterId, number> {
  const counts = {} as Record<SpecificationFilterId, number>;
  for (const filter of SPECIFICATION_FILTERS) {
    counts[filter.id] =
      filter.id === "AMBIGUOUS"
        ? unmapped.filter(isAmbiguous).length
        : specifications.filter((specification) =>
            matchesSpecificationFilter(specification, filter.id),
          ).length;
  }
  return counts;
}

/**
 * The specifications a filter shows, with ambiguities folded into the list.
 *
 * Ambiguous properties are not aggregates — there is no attribute to aggregate
 * on — but a reviewer looking for "everything that needs attention" expects to
 * see them, so they are presented alongside. The shared review filters apply to
 * mapped specifications only: an unmapped property has no review status or
 * confidence of its own, so filtering it out by either would hide a property that
 * still needs a decision.
 */
export function filterSpecifications(
  specifications: SpecificationAggregateDto[],
  filter: SpecificationFilterId,
  reviewFilters?: SpecificationReviewFilters,
): SpecificationAggregateDto[] {
  if (filter === "AMBIGUOUS") return [];
  return specifications
    .filter((specification) =>
      matchesSpecificationFilter(specification, filter),
    )
    .filter((specification) =>
      reviewFilters
        ? matchesSpecificationReviewFilters(specification, reviewFilters)
        : true,
    );
}

// ---------------------------------------------------------------------------
// Entry point copy
// ---------------------------------------------------------------------------

/**
 * The label for the Documentation section's intelligence entry point.
 *
 * Reads state that has already been loaded, so opening the component page never
 * runs the analysis: the caller loads the stored state and this only names it.
 */
export function intelligenceEntryLabel(
  state: ComponentDocumentationStateDto | null,
): string {
  if (!state) return "Documentation Intelligence";
  if (state.summary.documentsAnalyzed === 0) return "Analyze documents";

  const pending = state.summary.needsReview;
  if (pending === 0) return "Documentation Intelligence";
  return `Documentation Intelligence · ${pending} ${
    pending === 1 ? "review" : "reviews"
  }`;
}

/**
 * Whether the entry point should be offered at all.
 *
 * A component with no documents has nothing to analyze and nothing to review,
 * so the control is withheld rather than offered as a dead action. A stored
 * analysis keeps the entry point available even after its documents are
 * removed, so its findings can still be reviewed.
 */
export function hasSpecificationIntelligence(
  state: ComponentDocumentationStateDto | null,
): boolean {
  if (!state) return false;
  return (
    state.eligibleDocumentIds.length > 0 || state.summary.documentsAnalyzed > 0
  );
}

// ---------------------------------------------------------------------------
// Targeted state updates
// ---------------------------------------------------------------------------

/**
 * Locates the aggregate a finding belongs to.
 *
 * Matched by fingerprint for the same reason the per-document candidates are:
 * the queue response carries it, it is stable for a given (component, attribute,
 * value, document revision) combination, and matching on it needs no extra
 * identifier on the queue's finding contract.
 */
function replaceSpecificationForFinding(
  specifications: SpecificationAggregateDto[],
  finding: Pick<ComponentReviewFindingDto, "id" | "fingerprint">,
  update: (specification: SpecificationAggregateDto) => SpecificationAggregateDto,
): SpecificationAggregateDto[] {
  return specifications.map((specification) =>
    specification.review?.fingerprint === finding.fingerprint
      ? update(specification)
      : specification,
  );
}

/**
 * Applies a recorded decision to the aggregate list.
 *
 * The queue returns the updated finding, so the row's review block is rewritten
 * from that response: no refetch, no page reload, and the row shows exactly what
 * the backend now stores. The aggregate's own `state` is deliberately untouched —
 * accepting a value does not change what the documents say.
 */
export function applyDecisionToSpecifications(
  specifications: SpecificationAggregateDto[],
  finding: Pick<ComponentReviewFindingDto, "id" | "status" | "fingerprint">,
): SpecificationAggregateDto[] {
  return replaceSpecificationForFinding(
    specifications,
    finding,
    (specification) => ({
      ...specification,
      review: {
        findingId: finding.id,
        status: finding.status,
        fingerprint: finding.fingerprint,
        isNew: false,
        applied: specification.review?.applied ?? false,
      },
    }),
  );
}

/**
 * Applies a completed application to the aggregate list.
 *
 * The component now records the extracted value, so `currentValue` moves with it
 * and the state becomes ALREADY_CURRENT. Leaving either behind would show the
 * reviewer a contradiction they had just resolved, and would keep offering an
 * Apply that can no longer succeed.
 */
export function applyApplicationToSpecifications(
  specifications: SpecificationAggregateDto[],
  finding: Pick<ComponentReviewFindingDto, "id" | "status" | "fingerprint">,
  result: ApplyComponentFindingResultDto,
): SpecificationAggregateDto[] {
  return replaceSpecificationForFinding(
    specifications,
    finding,
    (specification) => ({
      ...specification,
      currentValue:
        result.appliedValueLabel ?? result.appliedValue ?? specification.display,
      erpComparison: null,
      erpAgreement: "AGREES",
      state: "ALREADY_CURRENT",
      review: {
        findingId: finding.id,
        // The backend marks the finding ACCEPTED when it applies.
        status: finding.status,
        fingerprint: finding.fingerprint,
        isNew: false,
        applied: true,
      },
    }),
  );
}

/** Rebuilds the state after a specification row changed, keeping the summary. */
export function withUpdatedSpecifications(
  state: ComponentDocumentationStateDto,
  specifications: SpecificationAggregateDto[],
): ComponentDocumentationStateDto {
  return { ...state, specifications };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** The excerpt a reviewer reads, trimmed to what the extractor actually saw. */
export function specificationEvidenceExcerpt(
  evidence: DocumentEvidenceDto,
  maxLength = 240,
): string | null {
  const text = evidence.text?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
