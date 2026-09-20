import type {
  ApplyComponentFindingResultDto,
  ApplyConflictReason,
  ComponentReviewComponentSummaryDto,
  ComponentReviewDecision,
  ComponentReviewFindingDto,
  ComponentReviewIssueCategory,
  ComponentReviewIssueType,
  ComponentReviewQueueSummaryDto,
  ComponentReviewStatus,
  ConfidenceLevel,
} from "./api/component-review-queue-api";

/**
 * Component Intelligence Review Queue presentation logic.
 *
 * Pure, dependency-free derivations used by the queue page and finding dialog.
 * Keeping them here (rather than inline in components) follows the repository's
 * testing convention: `apps/web` tests are vitest specs over pure logic, since
 * no DOM testing library is installed.
 *
 * NOTE: Nothing in this module mutates components. It only describes findings
 * and the review lifecycle. The backend remains authoritative for whether a
 * decision is permitted; `canDecide()` is a UI affordance so the interface does
 * not offer an action that the API would reject.
 */

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Human-readable labels for the backend's canonical issue types. */
export const ISSUE_TYPE_LABELS: Record<ComponentReviewIssueType, string> = {
  MPN_MISSING: "Missing Manufacturer Part Number",
  MPN_CONFLICT: "Manufacturer Part Number Conflict",
  MANUFACTURER_UNRESOLVED: "Manufacturer Unresolved",
  MANUFACTURER_CONFLICT: "Manufacturer Conflict",
  CATEGORY_UNRESOLVED: "Category Unresolved",
  CATEGORY_CONFLICT: "Category Conflict",
  EXACT_DUPLICATE: "Exact Duplicate",
  POTENTIAL_DUPLICATE: "Potential Duplicate",
};

/** Compact labels for dense table cells. */
export const ISSUE_TYPE_SHORT_LABELS: Record<ComponentReviewIssueType, string> =
  {
    MPN_MISSING: "MPN Missing",
    MPN_CONFLICT: "MPN Conflict",
    MANUFACTURER_UNRESOLVED: "Manufacturer Unresolved",
    MANUFACTURER_CONFLICT: "Manufacturer Conflict",
    CATEGORY_UNRESOLVED: "Category Unresolved",
    CATEGORY_CONFLICT: "Category Conflict",
    EXACT_DUPLICATE: "Exact Duplicate",
    POTENTIAL_DUPLICATE: "Potential Duplicate",
  };

export const ISSUE_CATEGORY_LABELS: Record<
  ComponentReviewIssueCategory,
  string
> = {
  IDENTITY: "Identity",
  CLASSIFICATION: "Classification",
  DUPLICATE: "Duplicate",
  DATA_QUALITY: "Data Quality",
};

export const STATUS_LABELS: Record<ComponentReviewStatus, string> = {
  PENDING: "Pending Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DISMISSED: "Dismissed",
  STALE: "Stale",
};

/**
 * Maps review statuses onto the design system's canonical `StatusBadge` values.
 *
 * STALE uses the neutral `INACTIVE` bucket because the finding is no longer
 * actionable rather than failed. It is additionally distinguished by a warning
 * row treatment, an inline explanation, and a disabled Accept action (see
 * `isStale`), which keeps the badge vocabulary canonical.
 */
export const STATUS_BADGE: Record<ComponentReviewStatus, string> = {
  PENDING: "PENDING",
  ACCEPTED: "SUCCESS",
  REJECTED: "REJECTED",
  DISMISSED: "ARCHIVED",
  STALE: "INACTIVE",
};

/** Confidence → canonical badge, matching Attribute Intelligence usage. */
export const CONFIDENCE_BADGE: Record<ConfidenceLevel, string> = {
  HIGH: "SUCCESS",
  MEDIUM: "IN_REVIEW",
  LOW: "DRAFT",
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  mpn_pattern: "MPN pattern",
  keyword: "Keyword",
  existing_data: "Existing data",
  data_pack_rule: "Data Pack rule",
  datasheet_param: "Datasheet parameter",
  classifier: "Classifier",
  anomaly: "Anomaly",
  similarity: "Similarity",
  taxonomy: "Taxonomy",
  exact_match: "Exact match",
  alias_match: "Alias match",
  manufacturer_text: "Manufacturer text",
  known_alias: "Known alias",
  exact_erp_match: "ERP match",
  erp_metadata: "ERP metadata",
  hierarchy: "Hierarchy",
  category_text: "Category text",
  category_knowledge: "Category knowledge",
  human_confirmation: "Human confirmation",
};

const ACRONYMS = new Set(["MPN", "SKU", "ID", "URL", "ERP", "JSON", "UOM"]);

export function evidenceTypeLabel(type: string | undefined | null): string {
  if (!type) return "Evidence";
  const known = EVIDENCE_TYPE_LABELS[type];
  if (known) return known;
  return humanizeKey(type);
}

/** `manufacturerPartNumber` → `Manufacturer Part Number`. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function issueTypeLabel(issueType: string): string {
  const known = ISSUE_TYPE_LABELS[issueType as ComponentReviewIssueType];
  return known ?? humanizeKey(issueType);
}

export function issueTypeShortLabel(issueType: string): string {
  const known = ISSUE_TYPE_SHORT_LABELS[issueType as ComponentReviewIssueType];
  return known ?? humanizeKey(issueType);
}

export function issueCategoryLabel(issueCategory: string): string {
  const known =
    ISSUE_CATEGORY_LABELS[issueCategory as ComponentReviewIssueCategory];
  return known ?? humanizeKey(issueCategory);
}

export function statusLabel(status: string): string {
  const known = STATUS_LABELS[status as ComponentReviewStatus];
  return known ?? humanizeKey(status);
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export function confidenceBadgeStatus(
  level: ConfidenceLevel | null | undefined,
): string {
  if (!level) return "DRAFT";
  return CONFIDENCE_BADGE[level] ?? "DRAFT";
}

export function formatConfidencePercent(
  confidence: number | null | undefined,
): string {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "—";
  return `${Math.round(confidence * 100)}%`;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Statuses a decision may be applied from. Mirrors the backend transition table
 * (`DECISION_TRANSITIONS` in `component-review-queue.service.ts`), which is the
 * authority: a stale finding can be rejected or dismissed but never accepted,
 * because its suggestion was generated against an older component state.
 */
export const DECISION_ALLOWED_STATUSES: Record<
  ComponentReviewDecision,
  ComponentReviewStatus[]
> = {
  ACCEPTED: ["PENDING"],
  REJECTED: ["PENDING", "STALE"],
  DISMISSED: ["PENDING", "STALE"],
};

export function canDecide(
  status: ComponentReviewStatus,
  decision: ComponentReviewDecision,
): boolean {
  return DECISION_ALLOWED_STATUSES[decision].includes(status);
}

export function decidableActions(
  status: ComponentReviewStatus,
): ComponentReviewDecision[] {
  return (
    ["ACCEPTED", "REJECTED", "DISMISSED"] as ComponentReviewDecision[]
  ).filter((decision) => canDecide(status, decision));
}

export function isStale(
  finding: Pick<ComponentReviewFindingDto, "status">,
): boolean {
  return finding.status === "STALE";
}

export function isTerminal(
  finding: Pick<ComponentReviewFindingDto, "status">,
): boolean {
  return ["ACCEPTED", "REJECTED", "DISMISSED"].includes(finding.status);
}

export interface DecisionCopy {
  label: string;
  /** Explains the consequence, including that the component is not modified. */
  description: string;
  confirmTitle: string;
  confirmText: string;
  variant: "default" | "destructive";
}

/**
 * Wording for each decision. Acceptance intentionally states that no component
 * data is modified so reviewers do not mistake queue acceptance for a component
 * update: applying suggestions is not part of this queue.
 */
export const DECISION_COPY: Record<ComponentReviewDecision, DecisionCopy> = {
  ACCEPTED: {
    label: "Accept finding",
    description:
      "Records that this finding is valid. The component is not modified: no manufacturer, category, or part number is applied.",
    confirmTitle: "Accept finding",
    confirmText: "Accept finding",
    variant: "default",
  },
  REJECTED: {
    label: "Reject finding",
    description:
      "Records that this finding is incorrect. The component and the underlying data are left unchanged.",
    confirmTitle: "Reject finding",
    confirmText: "Reject finding",
    variant: "destructive",
  },
  DISMISSED: {
    label: "Dismiss finding",
    description:
      "Records that this finding is not actionable. The component and the underlying data are left unchanged.",
    confirmTitle: "Dismiss finding",
    confirmText: "Dismiss finding",
    variant: "destructive",
  },
};

/** Explained reason shown alongside a stale finding. */
export function staleExplanation(finding: ComponentReviewFindingDto): string {
  const reason = finding.metadata?.staleReason;
  const detail =
    typeof reason === "string" && reason.trim().length > 0
      ? reason.trim()
      : "the component changed after this finding was generated";
  return `This finding is stale because ${detail}. Re-run the component audit to refresh it; it can be rejected or dismissed but not accepted.`;
}

// ---------------------------------------------------------------------------
// Filters and counts
// ---------------------------------------------------------------------------

export interface FilterOption {
  label: string;
  value: string;
}

export const ALL_FILTER_VALUE = "ALL";

export const STATUS_FILTER_OPTIONS: FilterOption[] = (
  ["PENDING", "ACCEPTED", "REJECTED", "DISMISSED", "STALE"] as const
).map((status) => ({ label: STATUS_LABELS[status], value: status }));

/**
 * Filterable categories.
 *
 * DATA_QUALITY is part of the canonical enum (and keeps a label so rows render
 * correctly if it is ever produced) but is omitted from the filter because the
 * backend currently emits no findings in that category.
 */
export const ISSUE_CATEGORY_FILTER_OPTIONS: FilterOption[] = (
  ["IDENTITY", "CLASSIFICATION", "DUPLICATE"] as const
).map((category) => ({
  label: ISSUE_CATEGORY_LABELS[category],
  value: category,
}));

export const ISSUE_TYPE_FILTER_OPTIONS: FilterOption[] = (
  Object.keys(ISSUE_TYPE_LABELS) as ComponentReviewIssueType[]
).map((issueType) => ({
  label: ISSUE_TYPE_LABELS[issueType],
  value: issueType,
}));

export const CONFIDENCE_FILTER_OPTIONS: FilterOption[] = (
  ["HIGH", "MEDIUM", "LOW"] as const
).map((level) => ({ label: `${level} confidence`, value: level }));

export function filterValueToParam(
  value: string | undefined,
): string | undefined {
  if (!value || value === ALL_FILTER_VALUE) return undefined;
  return value;
}

export interface QueueCountDescriptor {
  key: string;
  label: string;
  value: number;
  hint: string;
}

/**
 * Builds the summary strip from the backend's authoritative counts plus the
 * high-confidence pending count obtained from the same list endpoint (filtered
 * by `confidenceLevel=HIGH` and `status=PENDING`). No counting is re-implemented
 * client-side.
 */
export function deriveQueueCounts(
  summary: ComponentReviewQueueSummaryDto | null,
  highConfidencePending: number | null,
): QueueCountDescriptor[] {
  const safe = summary ?? {
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    dismissed: 0,
    stale: 0,
    byCategory: {},
  };
  const byCategory = safe.byCategory ?? {};

  return [
    {
      key: "pending",
      label: "Pending Review",
      value: safe.pending,
      hint: "Findings awaiting a reviewer decision",
    },
    {
      key: "highConfidence",
      label: "High Confidence",
      value: highConfidencePending ?? 0,
      hint: "Pending findings at HIGH confidence",
    },
    {
      key: "identity",
      label: "Identity",
      value: byCategory.IDENTITY ?? 0,
      hint: "MPN and manufacturer findings",
    },
    {
      key: "classification",
      label: "Classification",
      value: byCategory.CLASSIFICATION ?? 0,
      hint: "Category findings",
    },
    {
      key: "duplicate",
      label: "Duplicate",
      value: byCategory.DUPLICATE ?? 0,
      hint: "Exact and potential duplicate findings",
    },
    {
      key: "stale",
      label: "Stale",
      value: safe.stale,
      hint: "Findings whose component changed since generation",
    },
  ];
}

/**
 * Findings that still need a reviewer decision, for the header counter chip.
 *
 * PENDING findings await a first decision and STALE findings await a decision
 * on a component that changed after generation, so both are outstanding review
 * work. Resolved findings (accepted / rejected / dismissed) are history and are
 * deliberately excluded, so the counter falls as the queue is worked through.
 *
 * This mirrors the Attribute Library's counter, which counts every item in its
 * queue because that queue is entirely pending by definition.
 */
export function actionableFindingCount(
  summary: Pick<ComponentReviewQueueSummaryDto, "pending" | "stale"> | null,
): number {
  if (!summary) return 0;
  return summary.pending + summary.stale;
}

export function hasActiveFilters(input: {
  status?: string;
  issueCategory?: string;
  issueType?: string;
  confidenceLevel?: string;
  search?: string;
}): boolean {
  return Boolean(
    filterValueToParam(input.status) ||
    filterValueToParam(input.issueCategory) ||
    filterValueToParam(input.issueType) ||
    filterValueToParam(input.confidenceLevel) ||
    (input.search ?? "").trim(),
  );
}

// ---------------------------------------------------------------------------
// Queue tabs (mirrors the Attribute Intelligence Review queue tabs)
// ---------------------------------------------------------------------------

export type QueueTabId =
  | "ALL"
  | "IDENTITY"
  | "CLASSIFICATION"
  | "DUPLICATES"
  | "STALE";

/** Tab definitions, in the same order and style as the Attribute queue. */
export const QUEUE_TABS: readonly { id: QueueTabId; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "IDENTITY", label: "Identity" },
  { id: "CLASSIFICATION", label: "Classification" },
  { id: "DUPLICATES", label: "Duplicates" },
  { id: "STALE", label: "Stale" },
];

/**
 * Whether a finding belongs to a tab.
 *
 * Tabs are a presentation grouping over the loaded findings; the authoritative
 * filters are still sent to the API.
 */
export function matchesQueueTab(
  finding: Pick<ComponentReviewFindingDto, "issueCategory" | "status">,
  tabId: QueueTabId,
): boolean {
  switch (tabId) {
    case "ALL":
      return true;
    case "IDENTITY":
      return finding.issueCategory === "IDENTITY";
    case "CLASSIFICATION":
      return finding.issueCategory === "CLASSIFICATION";
    case "DUPLICATES":
      return finding.issueCategory === "DUPLICATE";
    case "STALE":
      return finding.status === "STALE";
  }
}

export function buildQueueTabCounts(
  items: ComponentReviewFindingDto[],
): Record<QueueTabId, number> {
  const counts: Record<QueueTabId, number> = {
    ALL: items.length,
    IDENTITY: 0,
    CLASSIFICATION: 0,
    DUPLICATES: 0,
    STALE: 0,
  };
  for (const item of items) {
    if (matchesQueueTab(item, "IDENTITY")) counts.IDENTITY += 1;
    if (matchesQueueTab(item, "CLASSIFICATION")) counts.CLASSIFICATION += 1;
    if (matchesQueueTab(item, "DUPLICATES")) counts.DUPLICATES += 1;
    if (matchesQueueTab(item, "STALE")) counts.STALE += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Finding card content and inline actions
// ---------------------------------------------------------------------------

export interface FindingValueSummary {
  /** Field this finding concerns, or null for duplicate findings. */
  fieldLabel: string | null;
  current: string;
  suggested: string;
  /** SKU of the related component for duplicate findings. */
  relatedSku: string | null;
}

/**
 * Compact current→suggested summary for a queue card, reusing the same value
 * resolution as the apply confirmation so the card and the confirmation can
 * never disagree.
 */
export function buildFindingValueSummary(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): FindingValueSummary {
  if (isDuplicateFinding(finding)) {
    return {
      fieldLabel: null,
      current: finding.component?.manufacturerPartNumber?.trim() || "—",
      suggested: finding.relatedComponent?.manufacturerPartNumber?.trim() || "—",
      relatedSku: finding.relatedComponent?.sku ?? null,
    };
  }

  return {
    fieldLabel: applyFieldLabel(finding),
    current: applyCurrentDisplay(finding, refs),
    suggested: applySuggestedDisplay(finding, refs),
    relatedSku: null,
  };
}

export type QueueCardAction =
  | "EVIDENCE"
  | "INSPECT"
  | "OPEN_COMPONENT"
  | "APPLY"
  | "ACCEPT"
  | "REJECT";

/**
 * Inline actions a queue card should offer.
 *
 * Read-only reviewers get inspection actions only. Write actions appear only
 * with the component-write permission, and "Accept & Apply" only for findings
 * the backend can actually apply (duplicates are review-only). The API enforces
 * all of this independently.
 */
export function queueCardActions(
  finding: Pick<ComponentReviewFindingDto, "status" | "issueCategory">,
  permissions: ReviewPermissions,
): QueueCardAction[] {
  const inspection: QueueCardAction[] = [
    "EVIDENCE",
    "INSPECT",
    "OPEN_COMPONENT",
  ];
  if (!permissions.canDecide) return inspection;

  const decidable = canDecide(finding.status, "REJECTED");
  if (!decidable) return inspection;

  if (finding.issueCategory === "DUPLICATE") {
    // Duplicate findings are review-only: no apply, no accept-as-applied.
    return [...inspection, "REJECT"];
  }

  if (
    finding.status === "PENDING" &&
    permissions.canApply &&
    canApplyFinding(finding)
  ) {
    return [...inspection, "REJECT", "APPLY"];
  }

  // Stale and other non-applicable-but-decidable findings can still be
  // resolved through the detail dialog.
  return [...inspection, "REJECT", "ACCEPT"];
}

export interface EmptyStateCopy {
  title: string;
  description: string;
}

export function queueEmptyStateCopy(filtersActive: boolean): EmptyStateCopy {
  if (filtersActive) {
    return {
      title: "No findings match these filters",
      description:
        "Adjust or clear the status, category, type, confidence, or search filters to see other findings.",
    };
  }
  return {
    title: "Component review queue is clear",
    description:
      "No component intelligence findings are currently pending. Run a component audit to analyze the catalog again.",
  };
}

// ---------------------------------------------------------------------------
// Values and evidence
// ---------------------------------------------------------------------------

export interface ValueEntry {
  label: string;
  value: string;
}

/** Preferred display order for well-known finding value keys. */
const VALUE_KEY_ORDER: string[] = [
  "manufacturerPartNumber",
  "normalizedMpn",
  "manufacturerName",
  "manufacturerCode",
  "manufacturerId",
  "categoryName",
  "categoryCode",
  "categoryPath",
  "categoryId",
  "resolution",
  "matchType",
  "duplicateOfSku",
  "duplicateOfManufacturerPartNumber",
  "normalizedMpnValue",
  "collidesWithExistingComponent",
  "sku",
  "name",
  "unit",
  "isActive",
];

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value.trim().length > 0 ? value : "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => formatScalar(item)).join(", ");
  }
  if (typeof value === "object") {
    const nested = Object.entries(value as Record<string, unknown>)
      .map(
        ([key, nestedValue]) =>
          `${humanizeKey(key)}: ${formatScalar(nestedValue)}`,
      )
      .join(" · ");
    return nested || "—";
  }
  return String(value);
}

/**
 * Converts a structured finding value into readable, ordered label/value pairs.
 * Unknown keys are appended alphabetically so nothing is silently dropped.
 */
export function formatValueEntries(
  value: Record<string, unknown> | null | undefined,
): ValueEntry[] {
  if (!value) return [];
  const keys = Object.keys(value);
  if (keys.length === 0) return [];

  const ordered: string[] = [];
  for (const preferred of VALUE_KEY_ORDER) {
    if (keys.includes(preferred)) ordered.push(preferred);
  }
  const remaining = keys
    .filter((key) => !ordered.includes(key))
    .sort((a, b) => a.localeCompare(b));

  return [...ordered, ...remaining].map((key) => ({
    label: humanizeKey(key),
    value: formatScalar(value[key]),
  }));
}

export interface ReviewEvidenceItem {
  type: string;
  typeLabel: string;
  description: string;
  weight: number | null;
  source: string | null;
}

/**
 * Normalizes the backend's `EvidenceItemDto[]` for display. Entries without a
 * description are dropped rather than rendered as empty rows; nothing is
 * synthesized.
 */
export function normalizeEvidence(
  evidence: Array<Record<string, unknown>> | null | undefined,
): ReviewEvidenceItem[] {
  if (!Array.isArray(evidence)) return [];
  const items: ReviewEvidenceItem[] = [];

  for (const raw of evidence) {
    if (!raw || typeof raw !== "object") continue;
    const description =
      typeof raw.description === "string" ? raw.description.trim() : "";
    if (!description) continue;
    const type =
      typeof raw.type === "string" && raw.type ? raw.type : "evidence";
    items.push({
      type,
      typeLabel: evidenceTypeLabel(type),
      description,
      weight:
        typeof raw.weight === "number" && Number.isFinite(raw.weight)
          ? raw.weight
          : null,
      source: typeof raw.source === "string" && raw.source ? raw.source : null,
    });
  }

  return items;
}

export function formatEvidenceWeight(weight: number | null): string | null {
  if (weight === null) return null;
  return weight.toFixed(2);
}

// ---------------------------------------------------------------------------
// Component identity and duplicate comparison
// ---------------------------------------------------------------------------

export interface ReviewReferenceMaps {
  categoryNames?: Map<string, string>;
  manufacturerNames?: Map<string, string>;
}

/** Human-readable component identity rows shared by detail and comparison. */
export interface IdentityRow {
  label: string;
  value: string;
  /** Rendered as monospace when the value is an identifier. */
  mono: boolean;
}

export function buildIdentityRows(
  component: ComponentReviewComponentSummaryDto | null,
  refs: ReviewReferenceMaps = {},
): IdentityRow[] {
  if (!component) return [];
  const manufacturer = component.manufacturerId
    ? (refs.manufacturerNames?.get(component.manufacturerId) ?? null)
    : null;
  const category = component.categoryId
    ? (refs.categoryNames?.get(component.categoryId) ?? null)
    : null;

  return [
    { label: "Component", value: component.name, mono: false },
    { label: "Internal SKU", value: component.sku, mono: true },
    {
      label: "Manufacturer Part Number",
      value: component.manufacturerPartNumber?.trim() || "—",
      mono: true,
    },
    {
      label: "Manufacturer",
      value: manufacturer ?? (component.manufacturerId ? "Assigned" : "—"),
      mono: false,
    },
    {
      label: "Category",
      value: category ?? (component.categoryId ? "Assigned" : "—"),
      mono: false,
    },
  ];
}

export type ComparisonEmphasis = "match" | "difference" | "neutral";

export interface ComparisonRow {
  label: string;
  current: string;
  related: string;
  emphasis: ComparisonEmphasis;
  /** Short note explaining why the row matters for this finding. */
  note?: string;
}

export function isDuplicateFinding(
  finding: Pick<
    ComponentReviewFindingDto,
    "issueCategory" | "relatedComponentId"
  >,
): boolean {
  return (
    finding.issueCategory === "DUPLICATE" && finding.relatedComponentId !== null
  );
}

/**
 * Side-by-side identity comparison for duplicate findings.
 *
 * Emphasis explains why the finding exists: an MPN match is the duplicate
 * signal, and a differing manufacturer or category is a conflict worth noticing.
 * Differences in internal SKU are expected and therefore neutral.
 */
export function buildDuplicateComparisonRows(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): ComparisonRow[] {
  const current = finding.component;
  const related = finding.relatedComponent;
  if (!current || !related) return [];

  const normalizeMpn = (value: string | null | undefined) =>
    (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const currentMpn = normalizeMpn(current.manufacturerPartNumber);
  const relatedMpn = normalizeMpn(related.manufacturerPartNumber);
  const mpnMatches = currentMpn.length > 0 && currentMpn === relatedMpn;

  const manufacturerName = (component: ComponentReviewComponentSummaryDto) =>
    component.manufacturerId
      ? (refs.manufacturerNames?.get(component.manufacturerId) ?? "Assigned")
      : "—";
  const categoryName = (component: ComponentReviewComponentSummaryDto) =>
    component.categoryId
      ? (refs.categoryNames?.get(component.categoryId) ?? "Assigned")
      : "—";

  const matchingMatchType =
    typeof finding.suggestedValue?.matchType === "string"
      ? (finding.suggestedValue.matchType as string)
      : null;

  const mpnNote = mpnMatches
    ? "Identical after normalization — the duplicate signal"
    : matchingMatchType === "PACKAGING_VARIANT"
      ? "Matches once the packaging/reel suffix is removed"
      : "Compared after removing packaging suffixes";

  const currentManufacturer = manufacturerName(current);
  const relatedManufacturer = manufacturerName(related);
  const currentCategory = categoryName(current);
  const relatedCategory = categoryName(related);

  const rows: ComparisonRow[] = [
    {
      label: "Component",
      current: current.name,
      related: related.name,
      emphasis: "neutral",
    },
    {
      label: "Internal SKU",
      current: current.sku,
      related: related.sku,
      emphasis: "neutral",
      note: "Internal SKUs are always distinct",
    },
    {
      label: "Manufacturer Part Number",
      current: current.manufacturerPartNumber?.trim() || "—",
      related: related.manufacturerPartNumber?.trim() || "—",
      emphasis: mpnMatches ? "match" : "difference",
      note: mpnNote,
    },
    {
      label: "Manufacturer",
      current: currentManufacturer,
      related: relatedManufacturer,
      emphasis:
        currentManufacturer === relatedManufacturer ? "match" : "difference",
    },
    {
      label: "Category",
      current: currentCategory,
      related: relatedCategory,
      emphasis: currentCategory === relatedCategory ? "match" : "difference",
    },
  ];

  return rows;
}

export interface DuplicateRelationship {
  heading: string;
  explanation: string;
}

/**
 * Explains the duplicate relationship using backend-provided values only.
 */
export function describeDuplicateRelationship(
  finding: ComponentReviewFindingDto,
): DuplicateRelationship {
  const relatedSku = finding.relatedComponent?.sku ?? null;
  const relatedMpn =
    finding.relatedComponent?.manufacturerPartNumber?.trim() || null;
  const matchType =
    typeof finding.suggestedValue?.matchType === "string"
      ? (finding.suggestedValue.matchType as string)
      : null;

  if (finding.issueType === "EXACT_DUPLICATE") {
    return {
      heading: "Exact duplicate",
      explanation: relatedSku
        ? `The normalized manufacturer part number is identical to ${
            relatedMpn ? `"${relatedMpn}"` : "the related component"
          } recorded on ${relatedSku}.`
        : "The normalized manufacturer part number is identical to the related component.",
    };
  }

  if (
    finding.issueType === "POTENTIAL_DUPLICATE" ||
    matchType === "PACKAGING_VARIANT"
  ) {
    return {
      heading: "Potential duplicate (packaging variant)",
      explanation: relatedSku
        ? `The manufacturer part number matches ${
            relatedMpn ? `"${relatedMpn}"` : "the related component"
          } on ${relatedSku} once the packaging or reel suffix is removed. Verify whether both records describe the same engineering part.`
        : "The manufacturer part number matches the related component once the packaging or reel suffix is removed.",
    };
  }

  return {
    heading: "Duplicate candidate",
    explanation:
      "Intelligence identified this component as a possible duplicate of the related component.",
  };
}

export function componentHref(componentId: string): string {
  return `/components/${encodeURIComponent(componentId)}`;
}

// ---------------------------------------------------------------------------
// Apply (writing a finding's suggestion to the component)
// ---------------------------------------------------------------------------

/**
 * Canonical permission required to modify component master data.
 *
 * Mirrors the backend guard's `COMPONENT_WRITE_PERMISSION`. The frontend only
 * hides the action; the API remains authoritative and rejects unauthorized
 * applications regardless of what the UI shows.
 */
export const COMPONENT_WRITE_PERMISSION = "Inventory.Update";

/**
 * Whether the UI should offer "Accept & Apply".
 *
 * Duplicate findings are review-only: there is no merge or delete capability,
 * so they are excluded by category. The backend independently enforces the
 * exact applicable set and refuses anything else with 409
 * `UNSUPPORTED_FINDING_TYPE`, so this is an affordance rather than the
 * authority.
 */
export function canApplyFinding(
  finding: Pick<ComponentReviewFindingDto, "status" | "issueCategory">,
): boolean {
  return finding.status === "PENDING" && finding.issueCategory !== "DUPLICATE";
}

/**
 * Whether the caller may apply this finding.
 *
 * Combines the finding's own applicability with the reviewer's permission.
 * When the permission check is omitted (unknown caller), the action is hidden
 * rather than assumed.
 */
export function canApplyFindingAsUser(
  finding: Pick<ComponentReviewFindingDto, "status" | "issueCategory">,
  canWriteComponents: boolean,
): boolean {
  return canApplyFinding(finding) && canWriteComponents;
}

/** Explains why Apply is unavailable, so the UI never shows a dead control. */
export function applyUnavailableReason(
  finding: Pick<ComponentReviewFindingDto, "status" | "issueCategory">,
  canWriteComponents: boolean,
): string | null {
  if (finding.issueCategory === "DUPLICATE") return APPLY_DUPLICATE_NOTE;
  if (finding.status !== "PENDING") return null;
  if (!canWriteComponents) {
    return `Applying a finding modifies the component, which requires the ${COMPONENT_WRITE_PERMISSION} permission. You can still accept or reject this finding as a review decision.`;
  }
  return null;
}

export interface ReviewPermissions {
  /** May record ACCEPTED / REJECTED / DISMISSED decisions. */
  canDecide: boolean;
  /** May apply an accepted suggestion to the component. */
  canApply: boolean;
  /** May run a manual component audit. */
  canAudit: boolean;
  /** True when the queue is read-only for this user. */
  isReadOnly: boolean;
}

/**
 * Derives every write capability the queue offers from the single existing
 * component-write permission.
 *
 * The review workflow is a persisted write surface (decisions, applications,
 * and audits all change stored state), so all three capabilities share the one
 * established permission rather than introducing a new vocabulary. The backend
 * enforces each independently.
 */
export function deriveReviewPermissions(
  canWriteComponents: boolean,
): ReviewPermissions {
  return {
    canDecide: canWriteComponents,
    canApply: canWriteComponents,
    canAudit: canWriteComponents,
    isReadOnly: !canWriteComponents,
  };
}

/** Read-only explanation shown when the user may inspect but not act. */
export function reviewReadOnlyNotice(): string {
  return `Read-only access: you can review findings and their evidence, but recording decisions, applying findings, and running audits require the ${COMPONENT_WRITE_PERMISSION} permission.`;
}

/** Explains why the manual audit action is unavailable. */
export function auditUnavailableReason(
  canWriteComponents: boolean,
): string | null {
  return canWriteComponents
    ? null
    : `Running a component audit requires the ${COMPONENT_WRITE_PERMISSION} permission.`;
}

export function isApplyConflictReason(
  value: unknown,
): value is ApplyConflictReason {
  return (
    typeof value === "string" &&
    (APPLY_CONFLICT_REASONS as readonly string[]).includes(value)
  );
}

export const APPLY_CONFLICT_REASONS: readonly ApplyConflictReason[] = [
  "UNSUPPORTED_FINDING_TYPE",
  "FINDING_NOT_PENDING",
  "FINGERPRINT_MISMATCH",
  "COMPONENT_CHANGED",
  "SUGGESTED_ENTITY_NOT_FOUND",
  "SUGGESTED_ENTITY_INACTIVE",
  "INVALID_SUGGESTED_VALUE",
];

export interface ApplyConfirmationRow {
  label: string;
  value: string;
  mono: boolean;
  /** True for the row describing the value about to be written. */
  emphasis: boolean;
}

/**
 * Confirmation content for an application: component identity, the field being
 * written, and the current versus new value. Built only from the finding and
 * the component summary — nothing is inferred.
 */
export function buildApplyConfirmationRows(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): ApplyConfirmationRow[] {
  const fieldLabel = applyFieldLabel(finding);
  const current = applyCurrentDisplay(finding, refs);
  const next = applySuggestedDisplay(finding, refs);

  const rows: ApplyConfirmationRow[] = [
    {
      label: "Component",
      value: finding.component?.name ?? "Unknown component",
      mono: false,
      emphasis: false,
    },
    {
      label: "Internal SKU",
      value: finding.component?.sku ?? "—",
      mono: true,
      emphasis: false,
    },
    { label: "Field", value: fieldLabel, mono: false, emphasis: false },
    { label: "Current", value: current, mono: true, emphasis: false },
    { label: "New", value: next, mono: true, emphasis: true },
  ];

  return rows;
}

/** The component field this finding will write, as a display label. */
export function applyFieldLabel(
  finding: Pick<ComponentReviewFindingDto, "issueType" | "issueCategory">,
): string {
  if (finding.issueCategory === "CLASSIFICATION") return "Category";
  if (
    finding.issueType === "MPN_MISSING" ||
    finding.issueType === "MPN_CONFLICT"
  )
    return "Manufacturer Part Number";
  if (
    finding.issueType === "MANUFACTURER_UNRESOLVED" ||
    finding.issueType === "MANUFACTURER_CONFLICT"
  )
    return "Manufacturer";
  return "—";
}

function applyCurrentDisplay(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps,
): string {
  const issueType = finding.issueType;

  if (issueType === "MPN_MISSING" || issueType === "MPN_CONFLICT") {
    return finding.component?.manufacturerPartNumber?.trim() || "Not set";
  }

  if (
    issueType === "MANUFACTURER_UNRESOLVED" ||
    issueType === "MANUFACTURER_CONFLICT"
  ) {
    const id = finding.component?.manufacturerId;
    if (!id) return "Not set";
    return refs.manufacturerNames?.get(id) ?? "Assigned";
  }

  if (
    issueType === "CATEGORY_UNRESOLVED" ||
    issueType === "CATEGORY_CONFLICT"
  ) {
    const id = finding.component?.categoryId;
    if (!id) return "Not set";
    return refs.categoryNames?.get(id) ?? "Assigned";
  }

  return "Not set";
}

function applySuggestedDisplay(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps,
): string {
  const suggested = finding.suggestedValue ?? {};

  if (
    finding.issueType === "MPN_MISSING" ||
    finding.issueType === "MPN_CONFLICT"
  ) {
    const mpn = suggested.manufacturerPartNumber;
    return typeof mpn === "string" && mpn.trim() ? mpn.trim() : "—";
  }

  if (
    finding.issueType === "MANUFACTURER_UNRESOLVED" ||
    finding.issueType === "MANUFACTURER_CONFLICT"
  ) {
    const id = suggested.manufacturerId;
    if (typeof id !== "string") return "—";
    const name =
      typeof suggested.manufacturerName === "string"
        ? suggested.manufacturerName
        : null;
    return name ?? refs.manufacturerNames?.get(id) ?? "Existing manufacturer";
  }

  if (
    finding.issueType === "CATEGORY_UNRESOLVED" ||
    finding.issueType === "CATEGORY_CONFLICT"
  ) {
    const id = suggested.categoryId;
    if (typeof id !== "string") return "—";
    const name =
      typeof suggested.categoryName === "string"
        ? suggested.categoryName
        : null;
    const path =
      typeof suggested.categoryPath === "string"
        ? suggested.categoryPath
        : null;
    return path ?? name ?? refs.categoryNames?.get(id) ?? "Existing category";
  }

  return "—";
}

export const APPLY_WARNING =
  "This will update the component. The suggested value is written to the component record and the finding is marked accepted.";

export const APPLY_DUPLICATE_NOTE =
  "Duplicate findings are review-only. Resolve duplication through the normal component workflow — this queue does not merge or delete components.";

export const APPLY_REVIEW_ONLY_COPY = {
  label: "Accept",
  description:
    "Records that the finding is valid. The component is not modified.",
};

export const APPLY_COPY = {
  label: "Accept & Apply",
  description:
    "Writes the suggested value to the component and marks the finding accepted.",
};

/** Success message for a completed application. */
export function applySuccessMessage(
  result: Pick<
    ApplyComponentFindingResultDto,
    "fieldLabel" | "appliedValueLabel" | "appliedValue" | "staledFindingCount"
  >,
): string {
  const value = result.appliedValueLabel ?? result.appliedValue ?? "—";
  const base = `${result.fieldLabel} updated to "${value}". The finding is now accepted.`;
  if (result.staledFindingCount > 0) {
    return `${base} ${result.staledFindingCount} other finding${
      result.staledFindingCount === 1 ? "" : "s"
    } for this component became stale.`;
  }
  return base;
}

/**
 * Conflict guidance shown when an application is refused.
 *
 * Every reason explains that nothing was written, because the reviewer must not
 * be left guessing whether the component changed.
 */
export function applyConflictMessage(
  reason: ApplyConflictReason | null,
  fallbackMessage?: string,
): string {
  switch (reason) {
    case "COMPONENT_CHANGED":
      return "The component changed after this finding was generated. The suggestion was not applied.";
    case "FINGERPRINT_MISMATCH":
      return "This finding was updated since you opened it. The suggestion was not applied.";
    case "FINDING_NOT_PENDING":
      return "This finding is no longer pending, so it cannot be applied. The component was not modified.";
    case "SUGGESTED_ENTITY_NOT_FOUND":
      return "The suggested manufacturer or category no longer exists. The suggestion was not applied.";
    case "SUGGESTED_ENTITY_INACTIVE":
      return "The suggested manufacturer or category is inactive. The suggestion was not applied.";
    case "INVALID_SUGGESTED_VALUE":
      return "The suggested value is not valid for this field, so it was not applied.";
    case "UNSUPPORTED_FINDING_TYPE":
      return "This finding type cannot be applied. It is review-only.";
    default:
      return (
        fallbackMessage ??
        "The suggestion could not be applied. The component was not modified."
      );
  }
}

/** Extracts the machine-readable reason from an API error payload, if present. */
export function extractApplyConflictReason(
  details: unknown,
): ApplyConflictReason | null {
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return isApplyConflictReason(reason) ? reason : null;
}

// ---------------------------------------------------------------------------
// Audit result
// ---------------------------------------------------------------------------

/** One-line, human-readable summary of a completed component audit. */
export function summarizeAuditResult(result: {
  analyzedCount: number;
  persistedCount: number;
  staledCount: number;
  duplicateFindingsCount: number;
  failedCount: number;
  notFoundCount: number;
  batchLimitReached: boolean;
  duplicateFindingsTruncated: boolean;
}): string {
  const parts: string[] = [
    `Analyzed ${result.analyzedCount} component${result.analyzedCount === 1 ? "" : "s"}`,
  ];
  parts.push(
    `${result.persistedCount} finding${result.persistedCount === 1 ? "" : "s"} persisted`,
  );
  if (result.duplicateFindingsCount > 0) {
    parts.push(`${result.duplicateFindingsCount} duplicate finding(s)`);
  }
  if (result.staledCount > 0) parts.push(`${result.staledCount} marked stale`);
  if (result.notFoundCount > 0) parts.push(`${result.notFoundCount} not found`);
  if (result.failedCount > 0) parts.push(`${result.failedCount} failed`);

  const notes: string[] = [];
  if (result.batchLimitReached) {
    notes.push("batch limit reached — run the audit again to continue");
  }
  if (result.duplicateFindingsTruncated) {
    notes.push("duplicate findings were capped for this run");
  }

  const summary = parts.join(" · ");
  return notes.length > 0
    ? `${summary}. Note: ${notes.join("; ")}.`
    : `${summary}.`;
}
