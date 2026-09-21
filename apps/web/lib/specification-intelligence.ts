import type {
  ComponentDocumentationSummaryDto,
  DatasheetSection,
  EvidenceRole,
  SpecificationAggregateDto,
  SpecificationSourceDto,
  UnmappedSpecificationDto,
} from "./api/documentation-intelligence-api";

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

/** A short word for the confidence, so a number is not the whole story. */
export function confidenceLevelLabel(confidence: number): string {
  if (confidence >= 0.8) return "High confidence";
  if (confidence >= 0.6) return "Medium confidence";
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
// Summary
// ---------------------------------------------------------------------------

export interface SummaryRow {
  key: string;
  label: string;
  value: number;
  hint: string;
}

/**
 * The documentation summary strip.
 *
 * Every number comes from the server-derived summary, so the panel and the review
 * queue cannot disagree. Rows with nothing to report are omitted rather than
 * shown as zero.
 */
export function buildSummaryRows(
  summary: ComponentDocumentationSummaryDto,
): SummaryRow[] {
  const rows: SummaryRow[] = [
    {
      key: "documents",
      label: "Documents analyzed",
      value: summary.documentsAnalyzed,
      hint: "Documents that contributed specification evidence",
    },
    {
      key: "specifications",
      label: "Specifications found",
      value: summary.specificationsFound,
      hint: "Distinct attributes described by the analyzed documents",
    },
    {
      key: "needsReview",
      label: "Needs review",
      value: summary.needsReview,
      hint: "Findings awaiting a reviewer decision",
    },
    {
      key: "applied",
      label: "Applied",
      value: summary.applied,
      hint: "Specifications a reviewer wrote to the component",
    },
    {
      key: "conflicts",
      label: "Conflicts",
      value: summary.conflicts,
      hint: "Documents that disagree about a value",
    },
    {
      key: "ambiguous",
      label: "Ambiguous",
      value: summary.ambiguous,
      hint: "Properties that match more than one attribute",
    },
    {
      key: "unresolved",
      label: "Unmapped",
      value: summary.unresolved,
      hint: "Properties this ERP has no attribute for",
    },
    {
      key: "alreadyCurrent",
      label: "Already recorded",
      value: summary.alreadyCurrent,
      hint: "Specifications the component already satisfies",
    },
  ];

  return rows.filter(
    (row) =>
      row.value > 0 ||
      row.key === "documents" ||
      row.key === "specifications",
  );
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

/** Whether a specification belongs to a filter. */
export function matchesSpecificationFilter(
  specification: SpecificationAggregateDto,
  filter: SpecificationFilterId,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "NEEDS_REVIEW":
      return specification.state === "AGREED" && !specification.review?.applied;
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

/** Counts per filter, from the specifications themselves. */
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
 * see them, so they are presented alongside.
 */
export function filterSpecifications(
  specifications: SpecificationAggregateDto[],
  filter: SpecificationFilterId,
): SpecificationAggregateDto[] {
  if (filter === "AMBIGUOUS") return [];
  return specifications.filter((specification) =>
    matchesSpecificationFilter(specification, filter),
  );
}
