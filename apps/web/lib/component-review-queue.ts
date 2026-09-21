import type {
  ApplyComponentFindingResultDto,
  ApplyConflictReason,
  ComponentReviewComponentSummaryDto,
  ComponentReviewDecision,
  ComponentReviewFindingDto,
  ComponentReviewIssueCategory,
  ComponentReviewIssueType,
  ComponentReviewQueuePageDto,
  ComponentReviewQueueSummaryDto,
  ComponentReviewStatus,
  ConfidenceLevel,
  ConsolidationAttributeEntryDto,
  ConsolidationDependencyClassification,
  ConsolidationPreviewDto,
  ConsolidationResultDto,
  ConsolidationSeverity,
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
  ATTRIBUTE_VALUE_SUGGESTION: "Specification from Datasheet",
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
    ATTRIBUTE_VALUE_SUGGESTION: "Specification",
  };

export const ISSUE_CATEGORY_LABELS: Record<
  ComponentReviewIssueCategory,
  string
> = {
  IDENTITY: "Identity",
  CLASSIFICATION: "Classification",
  DUPLICATE: "Duplicate",
  DATA_QUALITY: "Data Quality",
  ATTRIBUTE_VALUE: "Specifications",
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
  ["IDENTITY", "CLASSIFICATION", "ATTRIBUTE_VALUE", "DUPLICATE"] as const
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
      key: "attributeValue",
      label: "Specifications",
      value: byCategory.ATTRIBUTE_VALUE ?? 0,
      hint: "Specifications extracted from datasheets",
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
  | "ATTRIBUTES"
  | "DUPLICATES"
  | "STALE";

/** Tab definitions, in the same order and style as the Attribute queue. */
export const QUEUE_TABS: readonly { id: QueueTabId; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "IDENTITY", label: "Identity" },
  { id: "CLASSIFICATION", label: "Classification" },
  { id: "ATTRIBUTES", label: "Specifications" },
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
    case "ATTRIBUTES":
      return finding.issueCategory === "ATTRIBUTE_VALUE";
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
    ATTRIBUTES: 0,
    DUPLICATES: 0,
    STALE: 0,
  };
  for (const item of items) {
    if (matchesQueueTab(item, "IDENTITY")) counts.IDENTITY += 1;
    if (matchesQueueTab(item, "CLASSIFICATION")) counts.CLASSIFICATION += 1;
    if (matchesQueueTab(item, "ATTRIBUTES")) counts.ATTRIBUTES += 1;
    if (matchesQueueTab(item, "DUPLICATES")) counts.DUPLICATES += 1;
    if (matchesQueueTab(item, "STALE")) counts.STALE += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Targeted status reconciliation
// ---------------------------------------------------------------------------

/** The summary counter that holds a finding in a given status. */
const SUMMARY_COUNTER_FOR_STATUS: Record<
  ComponentReviewStatus,
  keyof Omit<ComponentReviewQueueSummaryDto, "total" | "byCategory">
> = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  DISMISSED: "dismissed",
  STALE: "stale",
};

/**
 * Apply a single finding's new status to an already-loaded queue page.
 *
 * Used after a mutation whose authoritative response tells us the finding's new
 * status (today: consolidation, which commits `ACCEPTED` inside its own
 * transaction). The alternative — only refetching — leaves the queue showing
 * stale rows until the round trip returns, so the review card the operator just
 * acted on appears unchanged.
 *
 * The update is deliberately surgical:
 *
 * - Only the matching row is replaced; the rest of the page keeps its identity,
 *   so unrelated cards do not re-render and no scroll position is lost.
 * - Only the two affected summary counters are adjusted, preserving
 *   `byCategory` (which keys off issue category, not status) and every other
 *   bucket.
 * - Nothing is added or removed. When the active filter excludes the finding's
 *   new status the row stays visible until the authoritative refetch lands; a
 *   row that silently vanished would be worse than one that is briefly stale.
 * - The page cursor (`page`, `pageSize`, `total`) is untouched.
 *
 * Passing the status the finding already has returns the input page unchanged.
 * Returning the input when nothing matched also lets callers feed this the
 * dialog's detached finding copy without risking a partial update.
 */
export function applyFindingStatusToQueuePage(
  page: ComponentReviewQueuePageDto,
  findingId: string,
  status: ComponentReviewStatus,
): ComponentReviewQueuePageDto {
  const index = page.items.findIndex((item) => item.id === findingId);
  if (index === -1) return page;
  const previous = page.items[index]!;
  if (previous.status === status) return page;

  const items = page.items.slice();
  items[index] = { ...previous, status };

  const summary = { ...page.summary };
  summary[SUMMARY_COUNTER_FOR_STATUS[previous.status]] = Math.max(
    0,
    summary[SUMMARY_COUNTER_FOR_STATUS[previous.status]] - 1,
  );
  summary[SUMMARY_COUNTER_FOR_STATUS[status]] =
    summary[SUMMARY_COUNTER_FOR_STATUS[status]] + 1;

  return { ...page, items, summary };
}

/**
 * Resolve the finding to show after a consolidation completed.
 *
 * The dialog holds a snapshot of the finding taken when it was opened, and the
 * consolidation response is the authoritative statement of the post-operation
 * state. This merges the confirmed status into that snapshot so the review card
 * and the duplicate investigation header reflect the change immediately, while
 * leaving every other field (component names, SKUs, notes) exactly as the
 * dialog loaded them.
 *
 * Returns the input unchanged when the response concerns a different finding,
 * so a late completion cannot repaint an unrelated card.
 */
export function applyConsolidationToFinding(
  finding: ComponentReviewFindingDto | null,
  result: Pick<ConsolidationResultDto, "findingId">,
): ComponentReviewFindingDto | null {
  if (!finding) return finding;
  if (finding.id !== result.findingId) return finding;
  if (finding.status === "ACCEPTED") return finding;
  return { ...finding, status: "ACCEPTED" };
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
      suggested:
        finding.relatedComponent?.manufacturerPartNumber?.trim() || "—",
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
  "EVIDENCE" | "INSPECT" | "OPEN_COMPONENT" | "APPLY" | "ACCEPT" | "REJECT";

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
  "primaryMatchType",
  "supportingMatchTypes",
  "duplicateOfSku",
  "duplicateOfManufacturerPartNumber",
  "normalizedMpnValue",
  "normalizedName",
  "manufacturerIdentity",
  "matchingAttributes",
  "similarityScore",
  "nameSimilarity",
  "sharedTokens",
  "matchedSignals",
  "penalizedSignals",
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
      : matchingMatchType === "NAME_ATTRIBUTE_IDENTITY"
        ? "Not the duplicate signal — this match is based on name and recorded specifications"
        : matchingMatchType === "SEMANTIC_NAME_SIMILARITY"
          ? "Not the duplicate signal — this match is based on overall similarity"
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
    if (matchType === "MPN_MANUFACTURER_CONFLICT") {
      return {
        heading: "Potential duplicate (manufacturer conflict)",
        explanation: relatedSku
          ? `The manufacturer part number is identical to ${
              relatedMpn ? `"${relatedMpn}"` : "the related component"
            } recorded on ${relatedSku}, but the two records claim different manufacturers. Verify which record is authoritative.`
          : "The manufacturer part number is identical to the related component, but the two records claim different manufacturers.",
      };
    }

    if (matchType === "NAME_ATTRIBUTE_IDENTITY") {
      return {
        heading: "Potential duplicate (matching identity)",
        explanation: relatedSku
          ? `The component name, manufacturer and recorded specifications match ${
              relatedMpn ? `"${relatedMpn}"` : "the related component"
            } on ${relatedSku}. Verify whether both records describe the same physical part.`
          : "The component name, manufacturer and recorded specifications match the related component.",
      };
    }

    if (matchType === "SEMANTIC_NAME_SIMILARITY") {
      const similarity =
        typeof finding.suggestedValue?.similarityScore === "number"
          ? Math.round(finding.suggestedValue.similarityScore * 100)
          : null;
      return {
        heading: "Potential duplicate (similar records)",
        explanation: relatedSku
          ? `Similarity analysis scored this component ${
              similarity === null ? "" : `${similarity}% `
            }against ${relatedSku} using name, manufacturer, category and recorded specifications. No shared manufacturer part number was found, so this is a candidate to review rather than a confirmed duplicate.`
          : "Similarity analysis matched this component against the related component using name, manufacturer, category and recorded specifications.",
      };
    }

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
// Duplicate investigation (Pass 5C)
// ---------------------------------------------------------------------------

/**
 * Canonical duplicate match types emitted by the analyzer (Pass 5A/5B).
 *
 * The frontend does not classify duplicates itself: it only renders the match
 * type the backend recorded, so the UI can never disagree with the engine.
 */
export const DUPLICATE_MATCH_TYPES = [
  "EXACT_MPN",
  "PACKAGING_VARIANT",
  "MPN_MANUFACTURER_CONFLICT",
  "NAME_ATTRIBUTE_IDENTITY",
  "SEMANTIC_NAME_SIMILARITY",
] as const;

export type DuplicateMatchType = (typeof DUPLICATE_MATCH_TYPES)[number];

export function isDuplicateMatchType(
  value: unknown,
): value is DuplicateMatchType {
  return (
    typeof value === "string" &&
    (DUPLICATE_MATCH_TYPES as readonly string[]).includes(value)
  );
}

/** Human-readable rule name, matching the analyzer's rule vocabulary. */
export const DUPLICATE_MATCH_TYPE_LABELS: Record<DuplicateMatchType, string> = {
  EXACT_MPN: "Exact MPN match",
  PACKAGING_VARIANT: "Packaging variant",
  MPN_MANUFACTURER_CONFLICT: "Manufacturer conflict",
  NAME_ATTRIBUTE_IDENTITY: "Name + attribute identity",
  SEMANTIC_NAME_SIMILARITY: "Semantic name similarity",
};

export function duplicateMatchTypeLabel(
  matchType: string | null,
): string | null {
  return isDuplicateMatchType(matchType)
    ? DUPLICATE_MATCH_TYPE_LABELS[matchType]
    : matchType;
}

export type DuplicateMatchOrigin = "deterministic" | "semantic";

/** Deterministic rules are authoritative identity; semantic ones are candidates. */
export const DUPLICATE_MATCH_TYPE_ORIGINS: Record<
  DuplicateMatchType,
  DuplicateMatchOrigin
> = {
  EXACT_MPN: "deterministic",
  PACKAGING_VARIANT: "deterministic",
  MPN_MANUFACTURER_CONFLICT: "deterministic",
  NAME_ATTRIBUTE_IDENTITY: "deterministic",
  SEMANTIC_NAME_SIMILARITY: "semantic",
};

export const DUPLICATE_ORIGIN_LABELS: Record<DuplicateMatchOrigin, string> = {
  deterministic: "Deterministic match",
  semantic: "Semantic candidate",
};

export function isSemanticDuplicateMatch(matchType: string | null): boolean {
  return isDuplicateMatchType(matchType)
    ? DUPLICATE_MATCH_TYPE_ORIGINS[matchType] === "semantic"
    : false;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The rule that produced this finding: `primaryMatchType`, falling back to
 * `matchType` (older rows) and finally to the issue type.
 */
export function duplicateMatchType(
  finding: ComponentReviewFindingDto,
): DuplicateMatchType | null {
  const candidates = [
    finding.suggestedValue?.primaryMatchType,
    finding.suggestedValue?.matchType,
    finding.metadata?.primaryMatchType,
    finding.metadata?.matchType,
  ];
  for (const candidate of candidates) {
    if (isDuplicateMatchType(candidate)) return candidate;
  }
  if (finding.issueType === "EXACT_DUPLICATE") return "EXACT_MPN";
  return null;
}

/** Other rules that also matched the same pair (never a second finding). */
export function supportingDuplicateMatchTypes(
  finding: ComponentReviewFindingDto,
): DuplicateMatchType[] {
  const raw = [
    ...readStringArray(finding.suggestedValue?.supportingMatchTypes),
    ...readStringArray(finding.metadata?.supportingMatchTypes),
  ];
  const seen = new Set<DuplicateMatchType>();
  for (const value of raw) {
    if (isDuplicateMatchType(value)) seen.add(value);
  }
  return [...seen].sort(
    (left, right) =>
      DUPLICATE_MATCH_TYPES.indexOf(left) -
      DUPLICATE_MATCH_TYPES.indexOf(right),
  );
}

export interface DuplicateIdentitySummary {
  /** EXACT_DUPLICATE or POTENTIAL_DUPLICATE. */
  verdict: string;
  /** Plain-language statement of the identity rule that matched. */
  rule: string;
  matchType: DuplicateMatchType | null;
  matchTypeLabel: string;
  origin: DuplicateMatchOrigin;
  originLabel: string;
  /** Supporting rules, strongest first. */
  supporting: Array<{ matchType: DuplicateMatchType; label: string }>;
}

/**
 * Explanation text per rule. Each sentence states what the rule actually
 * compares - it is never a generic "these look similar".
 */
const DUPLICATE_RULE_EXPLANATIONS: Record<DuplicateMatchType, string> = {
  EXACT_MPN:
    "Same manufacturer identity and the same manufacturer part number after normalization.",
  PACKAGING_VARIANT:
    "Same manufacturer identity and the same part number once the packaging or reel suffix is removed.",
  MPN_MANUFACTURER_CONFLICT:
    "The same normalized manufacturer part number recorded under two different manufacturer identities.",
  NAME_ATTRIBUTE_IDENTITY:
    "The same normalized name, the same manufacturer, compatible categories, and no conflicting recorded specification.",
  SEMANTIC_NAME_SIMILARITY:
    "Similarity across name, manufacturer, category and recorded specifications, with no shared manufacturer part number.",
};

/**
 * Compact identity summary for the top of the duplicate detail.
 *
 * The text comes from the recorded match type, never from a hard-coded
 * assumption, so an exact MPN match and a semantic candidate can never be
 * described with the same words.
 */
export function describeDuplicateIdentity(
  finding: ComponentReviewFindingDto,
): DuplicateIdentitySummary {
  const matchType = duplicateMatchType(finding);
  const origin: DuplicateMatchOrigin = matchType
    ? DUPLICATE_MATCH_TYPE_ORIGINS[matchType]
    : "deterministic";
  const rule = matchType
    ? DUPLICATE_RULE_EXPLANATIONS[matchType]
    : finding.issueType === "EXACT_DUPLICATE"
      ? "The two records share an authoritative manufacturer part number."
      : "The two records share several identity signals without a shared manufacturer part number.";

  return {
    verdict:
      finding.issueType === "EXACT_DUPLICATE"
        ? "Exact duplicate"
        : "Potential duplicate",
    rule,
    matchType,
    matchTypeLabel: matchType
      ? DUPLICATE_MATCH_TYPE_LABELS[matchType]
      : "Duplicate candidate",
    origin,
    originLabel: DUPLICATE_ORIGIN_LABELS[origin],
    supporting: supportingDuplicateMatchTypes(finding).map((type) => ({
      matchType: type,
      label: DUPLICATE_MATCH_TYPE_LABELS[type],
    })),
  };
}

/** Side-by-side identity row for the duplicate comparison. */
export interface DuplicateSideBySideRow {
  label: string;
  current: string;
  related: string;
  emphasis: ComparisonEmphasis;
  note?: string;
  /** Identity-bearing fields the reviewer should scan first. */
  identity: boolean;
}

/**
 * Side-by-side identity comparison: SKU, name, manufacturer, part number,
 * category and active status for both records, from the finding payload only.
 */
export function buildDuplicateSideBySideRows(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): DuplicateSideBySideRow[] {
  const current = finding.component;
  const related = finding.relatedComponent;
  if (!current || !related) return [];

  const normalize = (value: string | null | undefined) =>
    (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const manufacturerOf = (component: ComponentReviewComponentSummaryDto) =>
    component.manufacturerId
      ? (refs.manufacturerNames?.get(component.manufacturerId) ?? "Assigned")
      : "—";
  const categoryOf = (component: ComponentReviewComponentSummaryDto) =>
    component.categoryId
      ? (refs.categoryNames?.get(component.categoryId) ?? "Assigned")
      : "—";
  const statusOf = (component: ComponentReviewComponentSummaryDto) =>
    component.isActive ? "Active" : "Inactive";

  const currentMpn = normalize(current.manufacturerPartNumber);
  const relatedMpn = normalize(related.manufacturerPartNumber);
  const mpnMatches = currentMpn.length > 0 && currentMpn === relatedMpn;
  const matchType = duplicateMatchType(finding);

  const mpnNote = mpnMatches
    ? "Identical after normalization — the duplicate signal"
    : matchType === "PACKAGING_VARIANT"
      ? "Matches once the packaging/reel suffix is removed"
      : matchType === "NAME_ATTRIBUTE_IDENTITY"
        ? "Not the duplicate signal — this match is based on name and recorded specifications"
        : matchType === "SEMANTIC_NAME_SIMILARITY"
          ? "Not the duplicate signal — this match is based on overall similarity"
          : "Compared after removing packaging suffixes";

  const currentManufacturer = manufacturerOf(current);
  const relatedManufacturer = manufacturerOf(related);
  const currentCategory = categoryOf(current);
  const relatedCategory = categoryOf(related);

  return [
    {
      label: "Component",
      current: current.name,
      related: related.name,
      emphasis: "neutral",
      identity: false,
    },
    {
      label: "Internal SKU",
      current: current.sku,
      related: related.sku,
      emphasis: "neutral",
      note: "Internal SKUs are always distinct",
      identity: false,
    },
    {
      label: "Manufacturer Part Number",
      current: current.manufacturerPartNumber?.trim() || "—",
      related: related.manufacturerPartNumber?.trim() || "—",
      emphasis: mpnMatches ? "match" : "difference",
      note: mpnNote,
      identity: true,
    },
    {
      label: "Manufacturer",
      current: currentManufacturer,
      related: relatedManufacturer,
      emphasis:
        currentManufacturer === relatedManufacturer ? "match" : "difference",
      identity: true,
    },
    {
      label: "Category",
      current: currentCategory,
      related: relatedCategory,
      emphasis: currentCategory === relatedCategory ? "match" : "difference",
      identity: true,
    },
    {
      label: "Status",
      current: statusOf(current),
      related: statusOf(related),
      emphasis:
        current.isActive === related.isActive ? "neutral" : "difference",
      ...(current.isActive === related.isActive
        ? {}
        : { note: "One record is inactive" }),
      identity: false,
    },
  ];
}

/** Row of the structured attribute comparison table. */
export interface DuplicateAttributeRow {
  code: string;
  label: string;
  current: string;
  related: string;
  result: "match" | "different";
}

function readAttributeComparison(
  finding: ComponentReviewFindingDto,
): DuplicateAttributeRow[] {
  // The API surfaces the comparison as a typed field; the metadata copy is the
  // persisted form, so it is used as a fallback for payloads persisted before
  // the field was exposed.
  const raw = Array.isArray(finding.attributeComparison)
    ? finding.attributeComparison
    : finding.metadata?.attributeComparison;
  if (!Array.isArray(raw)) return [];

  const rows: DuplicateAttributeRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const code = typeof entry.code === "string" ? entry.code : "";
    if (!code) continue;
    if (entry.result !== "MATCH" && entry.result !== "DIFFERENT") continue;
    rows.push({
      code,
      label:
        typeof entry.label === "string" && entry.label ? entry.label : code,
      current: typeof entry.current === "string" ? entry.current : "",
      related: typeof entry.related === "string" ? entry.related : "",
      result: entry.result === "MATCH" ? "match" : "different",
    });
  }
  return rows;
}

/**
 * Structured attribute comparison recorded with the finding.
 *
 * Differences come first for potential duplicates, so a reviewer never has to
 * scroll past matching specifications to reach the reason the pair is only a
 * candidate. Exact duplicates keep the analyzer's attribute order because the
 * authoritative MPN match is the headline.
 */
export function buildDuplicateAttributeRows(
  finding: ComponentReviewFindingDto,
  options: { differencesFirst?: boolean } = {},
): DuplicateAttributeRow[] {
  const rows = readAttributeComparison(finding);
  const differencesFirst =
    options.differencesFirst ?? finding.issueType !== "EXACT_DUPLICATE";

  if (!differencesFirst) return rows;
  return [
    ...rows.filter((row) => row.result === "different"),
    ...rows.filter((row) => row.result === "match"),
  ];
}

/** One explained difference between the two records. */
export interface DuplicateDifference {
  label: string;
  current: string;
  related: string;
  note?: string;
}

/**
 * Differences worth surfacing before anything else.
 *
 * Built from the recorded match type plus the attribute comparison, so an
 * exact MPN match that also disagrees on a specification exposes the
 * inconsistency instead of hiding it behind the MPN.
 */
export function describeDuplicateDifferences(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): DuplicateDifference[] {
  const current = finding.component;
  const related = finding.relatedComponent;
  if (!current || !related) return [];

  const differences: DuplicateDifference[] = [];
  const matchType = duplicateMatchType(finding);

  const currentMpn = current.manufacturerPartNumber?.trim() || null;
  const relatedMpn = related.manufacturerPartNumber?.trim() || null;
  if (currentMpn !== relatedMpn) {
    differences.push({
      label: "Manufacturer Part Number",
      current: currentMpn ?? "—",
      related: relatedMpn ?? "—",
      ...(matchType === "PACKAGING_VARIANT"
        ? { note: "Interpreted as a packaging/reel suffix difference" }
        : matchType === "NAME_ATTRIBUTE_IDENTITY" ||
            matchType === "SEMANTIC_NAME_SIMILARITY"
          ? { note: "Different part numbers — verify they are not variants" }
          : {}),
    });
  }

  const manufacturerOf = (component: ComponentReviewComponentSummaryDto) =>
    component.manufacturerId
      ? (refs.manufacturerNames?.get(component.manufacturerId) ?? "Assigned")
      : "—";
  const currentManufacturer = manufacturerOf(current);
  const relatedManufacturer = manufacturerOf(related);
  if (currentManufacturer !== relatedManufacturer) {
    differences.push({
      label: "Manufacturer",
      current: currentManufacturer,
      related: relatedManufacturer,
      note:
        matchType === "MPN_MANUFACTURER_CONFLICT"
          ? "The same part number under two manufacturer identities"
          : "Different manufacturers",
    });
  }

  const categoryOf = (component: ComponentReviewComponentSummaryDto) =>
    component.categoryId
      ? (refs.categoryNames?.get(component.categoryId) ?? "Assigned")
      : "—";
  const currentCategory = categoryOf(current);
  const relatedCategory = categoryOf(related);
  if (currentCategory !== relatedCategory) {
    differences.push({
      label: "Category",
      current: currentCategory,
      related: relatedCategory,
    });
  }

  if (current.isActive !== related.isActive) {
    differences.push({
      label: "Status",
      current: current.isActive ? "Active" : "Inactive",
      related: related.isActive ? "Active" : "Inactive",
      note: "One record is inactive",
    });
  }

  for (const row of readAttributeComparison(finding)) {
    if (row.result !== "different") continue;
    differences.push({
      label: row.label,
      current: row.current || "—",
      related: row.related || "—",
    });
  }

  return differences;
}

/** Identity-bearing fields that match, for the at-a-glance match list. */
export interface DuplicateMatch {
  label: string;
  value: string;
}

export function describeDuplicateMatches(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const row of buildDuplicateSideBySideRows(finding, refs)) {
    if (!row.identity || row.emphasis !== "match") continue;
    matches.push({ label: row.label, value: row.current });
  }

  for (const row of readAttributeComparison(finding)) {
    if (row.result !== "match") continue;
    matches.push({ label: row.label, value: row.current || "—" });
  }

  return matches;
}

/** Semantic signal codes → reviewer-facing labels. */
export const DUPLICATE_SIGNAL_LABELS: Record<string, string> = {
  MANUFACTURER_SAME: "Same manufacturer",
  CATEGORY_SAME: "Same category",
  CATEGORY_RELATED: "Compatible categories",
  NAME_SIMILARITY: "Strong name similarity",
  TECHNICAL_VALUES_AGREE: "Technical values match",
  PACKAGE_AGREES: "Package matches",
  ATTRIBUTES_AGREE: "Recorded specifications match",
  MPN_FAMILY: "Same manufacturer part family",
  MANUFACTURER_CONFLICT: "Different manufacturers",
  PACKAGE_CONFLICT: "Different package",
};

function duplicateSignalLabel(code: string): string {
  return DUPLICATE_SIGNAL_LABELS[code] ?? humanizeKey(code);
}

export interface DuplicateSignalSummary {
  matched: string[];
  penalized: string[];
}

/**
 * Matching and penalized signals recorded by the semantic scorer.
 *
 * Only the signal codes the analyzer recorded are shown; scoring weights are
 * deliberately not surfaced (they are implementation detail, not reviewer
 * information).
 */
export function describeDuplicateSignals(
  finding: ComponentReviewFindingDto,
): DuplicateSignalSummary {
  const codes = [
    ...readStringArray(finding.suggestedValue?.matchedSignals),
    ...readStringArray(finding.metadata?.matchedSignals),
  ];
  const penaltyCodes = [
    ...readStringArray(finding.suggestedValue?.penalizedSignals),
    ...readStringArray(finding.metadata?.penalizedSignals),
  ];

  const unique = (values: string[]) => [...new Set(values)];
  return {
    matched: unique(codes).map(duplicateSignalLabel),
    penalized: unique(penaltyCodes).map(duplicateSignalLabel),
  };
}

export interface DuplicateSimilaritySummary {
  /** Overall similarity in [0, 1]. */
  score: number | null;
  scorePercent: number | null;
  nameSimilarity: number | null;
  nameSimilarityPercent: number | null;
  sharedTokens: string[];
}

/**
 * Semantic similarity numbers, or null for deterministic matches that recorded
 * none. Percentages are rounded for display only.
 */
export function summarizeDuplicateSimilarity(
  finding: ComponentReviewFindingDto,
): DuplicateSimilaritySummary | null {
  const score = readNumber(
    finding.suggestedValue?.similarityScore ??
      finding.metadata?.similarityScore,
  );
  const nameSimilarity = readNumber(
    finding.suggestedValue?.nameSimilarity ?? finding.metadata?.nameSimilarity,
  );
  const sharedTokens = [
    ...readStringArray(finding.suggestedValue?.sharedTokens),
    ...readStringArray(finding.metadata?.sharedTokens),
  ];

  if (score === null && nameSimilarity === null && sharedTokens.length === 0) {
    return null;
  }

  return {
    score,
    scorePercent: score === null ? null : Math.round(score * 100),
    nameSimilarity,
    nameSimilarityPercent:
      nameSimilarity === null ? null : Math.round(nameSimilarity * 100),
    sharedTokens: [...new Set(sharedTokens)],
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface DuplicatePackagingExplanation {
  baseMpn: string;
  variantMpn: string;
  /** Suffix the deterministic rule removed, when the two MPNs confirm it. */
  removedSuffix: string | null;
  note: string;
}

/**
 * Packaging-variant explanation: base part number, variant part number, and the
 * deterministic rule that connects them.
 *
 * The removed suffix is only reported when one part number literally extends the
 * other, so the UI never claims a suffix that the records do not show.
 */
export function describePackagingVariant(
  finding: ComponentReviewFindingDto,
): DuplicatePackagingExplanation | null {
  if (duplicateMatchType(finding) !== "PACKAGING_VARIANT") return null;

  const current = finding.component?.manufacturerPartNumber?.trim() || "";
  const related =
    finding.relatedComponent?.manufacturerPartNumber?.trim() || "";
  if (!current || !related) return null;

  const normalize = (value: string) =>
    value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const ordered = [current, related].sort(
    (left, right) => normalize(left).length - normalize(right).length,
  );
  const shorter = ordered[0] as string;
  const longer = ordered[1] as string;
  const shorterNormalized = normalize(shorter);
  const longerNormalized = normalize(longer);

  const extendsBase =
    shorterNormalized.length > 0 &&
    longerNormalized.startsWith(shorterNormalized);

  return {
    baseMpn: extendsBase ? shorter : current,
    variantMpn: extendsBase ? longer : related,
    removedSuffix: extendsBase
      ? longerNormalized.slice(shorterNormalized.length) || null
      : null,
    note: "The difference is interpreted as a packaging or reel suffix by the deterministic packaging rule. The records are not necessarily interchangeable: verify the physical part and its packaging before acting.",
  };
}

export interface DuplicateManufacturerConflict {
  currentManufacturer: string;
  relatedManufacturer: string;
  note: string;
}

/**
 * Manufacturer-conflict explanation. Deliberately worded as a data question
 * rather than a duplicate verdict, because the two records cannot both be
 * authoritative for the same part number.
 */
export function describeManufacturerConflict(
  finding: ComponentReviewFindingDto,
  refs: ReviewReferenceMaps = {},
): DuplicateManufacturerConflict | null {
  if (duplicateMatchType(finding) !== "MPN_MANUFACTURER_CONFLICT") return null;

  const nameOf = (component: ComponentReviewComponentSummaryDto | null) =>
    component?.manufacturerId
      ? (refs.manufacturerNames?.get(component.manufacturerId) ?? "Assigned")
      : "Not assigned";

  return {
    currentManufacturer: nameOf(finding.component),
    relatedManufacturer: nameOf(finding.relatedComponent),
    note: "The same normalized part number is recorded under two manufacturer identities. Check which manufacturer is correct, and whether one part number was copied onto the wrong component record.",
  };
}

/**
 * Wording for each decision on a duplicate finding.
 *
 * Rejection is presented as "Not a duplicate" because that is the reviewer's
 * actual judgement; it records the existing REJECTED decision, so audit history
 * and feedback telemetry are unchanged. Acceptance never implies a merge.
 */
export function duplicateDecisionCopy(
  finding: Pick<ComponentReviewFindingDto, "issueCategory" | "issueType">,
  decision: ComponentReviewDecision,
): DecisionCopy {
  if (finding.issueCategory !== "DUPLICATE") return DECISION_COPY[decision];

  if (decision === "REJECTED") {
    return {
      label: "Not a duplicate",
      description:
        "Records that these records are different parts. No component is modified, merged, or deleted.",
      confirmTitle: "Not a duplicate",
      confirmText: "Not a duplicate",
      variant: "destructive",
    };
  }

  if (decision === "ACCEPTED") {
    return {
      label: "Accept finding",
      description:
        "Acknowledges that this duplication is real. No component is merged, modified, or deleted — consolidating the two records stays a separate, explicitly confirmed step.",
      confirmTitle: "Accept finding",
      confirmText: "Accept finding",
      variant: "default",
    };
  }

  return {
    label: "Dismiss",
    description:
      "Records that this duplicate candidate is not worth pursuing. No component is modified.",
    confirmTitle: "Dismiss",
    confirmText: "Dismiss",
    variant: "destructive",
  };
}

/** Placeholder that makes reviewer notes most useful for duplicate judgement. */
export function duplicateDecisionNotesPlaceholder(
  finding: Pick<ComponentReviewFindingDto, "issueType">,
): string {
  return finding.issueType === "EXACT_DUPLICATE"
    ? "For example: same part number but the manufacturer is wrong on this record."
    : "For example: not a duplicate because these are different voltage variants.";
}

/** Plain-language next step for the reviewer, per rule. */
export function duplicateReviewGuidance(
  finding: ComponentReviewFindingDto,
): string {
  const matchType = duplicateMatchType(finding);

  switch (matchType) {
    case "EXACT_MPN":
      return "Both records carry the same manufacturer identity and part number. Decide which record to keep and resolve the duplication outside this queue.";
    case "PACKAGING_VARIANT":
      return "The part numbers differ only by a packaging or reel suffix. Confirm whether the records describe the same engineering part in different packaging.";
    case "MPN_MANUFACTURER_CONFLICT":
      return "Investigate which manufacturer is authoritative for this part number before treating either record as correct.";
    case "NAME_ATTRIBUTE_IDENTITY":
      return "Name, manufacturer, category and specifications agree, but no shared part number was found. Confirm whether one record is a duplicate entry.";
    case "SEMANTIC_NAME_SIMILARITY":
      return "This is a similarity candidate rather than a confirmed duplicate. Compare the differing fields above before deciding.";
    default:
      return "Review the comparison above and decide whether both records describe the same part.";
  }
}

// ---------------------------------------------------------------------------
// Consolidation preview (Pass 6A — read-only analysis)
// ---------------------------------------------------------------------------

/**
 * Consolidation analysis is READ-ONLY in this pass.
 *
 * These helpers format the preview returned by the backend. They never build an
 * execution request, because no execution endpoint exists: the pass deliberately
 * ships analysis without mutation while the Phase 0 blockers remain open.
 */
export const CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY =
  "Consolidation execution is currently unavailable.";

/** Explains, in one sentence, what the current feature does. */
export function consolidationScopeNotice(): string {
  return "This analysis is read-only. It does not consolidate, merge, delete, retire, repoint, or mutate components or any related record.";
}

/**
 * Confirms a completed consolidation against the backend's own result.
 *
 * Every fact comes from the response — the canonical SKU, the retired SKUs, and
 * the replay flag. Nothing is inferred from what the reviewer had on screen, so
 * the message cannot claim an outcome the server did not report.
 */
export function consolidationSuccessMessage(
  result: Pick<
    ConsolidationResultDto,
    "canonical" | "sources" | "idempotentReplay"
  >,
): string {
  const retired = result.sources.map((source) => source.sku);
  const retiredLabel =
    retired.length === 1
      ? `${retired[0]} was retired into ${result.canonical.sku}`
      : `${retired.join(", ")} were retired into ${result.canonical.sku}`;
  const replay = result.idempotentReplay
    ? " This request had already been applied, so inventory was not moved twice."
    : "";
  return `Consolidation complete. ${retiredLabel}. The finding is now ACCEPTED.${replay}`;
}

export interface ConsolidationConflictGroup {
  severity: ConsolidationSeverity;
  label: string;
  /** Blocking first, then warnings, then informational. */
  conflicts: Array<{
    code: string;
    title: string;
    description: string;
    entityType: string;
    affectedCount: number | null;
    resolutionRequired: boolean;
    resolutionSupported: boolean;
    blocksExecution: boolean;
  }>;
}

/** Canonical severity presentation order: blockers are never buried. */
export const CONSOLIDATION_SEVERITY_ORDER: readonly ConsolidationSeverity[] = [
  "BLOCKING",
  "WARNING",
  "INFORMATIONAL",
];

export const CONSOLIDATION_SEVERITY_LABELS: Record<
  ConsolidationSeverity,
  string
> = {
  BLOCKING: "Blocking",
  WARNING: "Warning",
  INFORMATIONAL: "Information",
};

/**
 * Groups conflicts by severity, most severe first, preserving backend order
 * within each group so the UI never reshuffles the evidence.
 */
export function groupConsolidationConflicts(
  preview: Pick<ConsolidationPreviewDto, "conflicts">,
): ConsolidationConflictGroup[] {
  return CONSOLIDATION_SEVERITY_ORDER.map((severity) => ({
    severity,
    label: CONSOLIDATION_SEVERITY_LABELS[severity],
    conflicts: preview.conflicts
      .filter((conflict) => conflict.severity === severity)
      .map((conflict) => ({
        code: conflict.code,
        title: conflict.title,
        description: conflict.description,
        entityType: conflict.entityType,
        affectedCount: conflict.affectedCount,
        resolutionRequired: conflict.resolutionRequired,
        resolutionSupported: conflict.resolutionSupported,
        blocksExecution: conflict.blocksExecution,
      })),
  })).filter((group) => group.conflicts.length > 0);
}

export interface ConsolidationImpactRow {
  label: string;
  value: string;
  detail?: string;
}

/** Human impact summary, built only from numbers the backend returned. */
export function buildConsolidationImpactRows(
  preview: ConsolidationPreviewDto,
): ConsolidationImpactRow[] {
  const rows: ConsolidationImpactRow[] = [];

  rows.push({
    label: "Inventory",
    value: `${preview.inventory.canonical.totalQuantity} → ${preview.inventory.combinedTotalQuantity}`,
    detail: `${preview.inventory.byLocation.length} location(s) · source holds ${preview.inventory.source.totalQuantity}`,
  });

  const affectedReferences = preview.dependencies
    .filter((dependency) => dependency.count > 0)
    .reduce((total, dependency) => total + dependency.count, 0);
  rows.push({
    label: "Component references",
    value: String(affectedReferences),
    detail: `${preview.dependencies.filter((entry) => entry.count > 0).length} of ${preview.dependencies.length} dependency types affected`,
  });

  rows.push({
    label: "Historical records",
    value: String(preview.historicalReferences.historicalCount),
    detail: "Kept on the retired record; history is never rewritten",
  });

  rows.push({
    label: "BOM lines",
    value: String(
      preview.bom.canonicalLines.length + preview.bom.sourceLines.length,
    ),
    detail:
      preview.bom.collisionCount > 0
        ? `${preview.bom.collisionCount} collision(s) block execution`
        : "No collisions detected",
  });

  rows.push({
    label: "Attributes",
    value: `${preview.attributes.entries.length}`,
    detail: `${preview.attributes.conflictingCount} conflicting · ${preview.attributes.sourceOnlyCount} source-only`,
  });

  rows.push({
    label: "Other findings",
    value: String(preview.history.relatedFindingCount),
    detail: `${preview.history.feedbackCount} feedback record(s)`,
  });

  return rows;
}

/** Dependencies worth showing first: blockers, then anything with references. */
export function sortConsolidationDependencies(
  preview: Pick<ConsolidationPreviewDto, "dependencies">,
): ConsolidationPreviewDto["dependencies"] {
  return [...preview.dependencies].sort((left, right) => {
    if (left.blocking !== right.blocking) return left.blocking ? -1 : 1;
    if (left.count !== right.count) return right.count - left.count;
    return left.id.localeCompare(right.id);
  });
}

export const CONSOLIDATION_CLASSIFICATION_LABELS: Record<
  ConsolidationDependencyClassification,
  string
> = {
  MUST_PRESERVE: "Preserve",
  MUST_REPOINT: "Repoint",
  MUST_RECONCILE: "Reconcile",
  MUST_NOT_CHANGE: "Unchanged",
  UNKNOWN: "Undefined",
};

export function consolidationClassificationLabel(
  classification: string,
): string {
  return (
    CONSOLIDATION_CLASSIFICATION_LABELS[
      classification as ConsolidationDependencyClassification
    ] ?? classification
  );
}

export const CONSOLIDATION_ATTRIBUTE_LABELS: Record<
  ConsolidationAttributeEntryDto["classification"],
  string
> = {
  IDENTICAL: "Same",
  CANONICAL_ONLY: "Surviving only",
  SOURCE_ONLY: "Retired only",
  CONFLICTING: "Conflicts",
};

/**
 * Attribute rows for the preview, conflicts first so a reviewer sees the
 * decisions they would have to make before the many matching values.
 */
export function buildConsolidationAttributeRows(
  preview: Pick<ConsolidationPreviewDto, "attributes">,
): ConsolidationAttributeEntryDto[] {
  const rank = (entry: ConsolidationAttributeEntryDto) =>
    entry.classification === "CONFLICTING"
      ? 0
      : entry.classification === "SOURCE_ONLY"
        ? 1
        : entry.classification === "CANONICAL_ONLY"
          ? 2
          : 3;

  return [...preview.attributes.entries].sort(
    (left, right) =>
      rank(left) - rank(right) || left.code.localeCompare(right.code),
  );
}

/** Plain-language summary of the eligibility verdict. */
export function explainConsolidationEligibility(
  preview: ConsolidationPreviewDto,
): string {
  if (preview.eligibility.eligible) {
    return preview.executable
      ? "The finding is eligible and nothing blocks this consolidation. Review the impact below, then consolidate when you are ready."
      : "The finding is eligible for consolidation analysis. Resolve the conflicts listed above before consolidating.";
  }
  return preview.eligibility.explanations.length > 0
    ? preview.eligibility.explanations.join(" ")
    : "This finding cannot be analysed for consolidation.";
}

/** True when the preview could not be analysed at all (no dependency surface). */
export function isConsolidationPreviewUnanalyzable(
  preview: ConsolidationPreviewDto,
): boolean {
  return preview.dependencies.length === 0;
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
  "COMPONENT_RETIRED",
  "ATTRIBUTE_VALUE_CHANGED",
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
  if (finding.issueCategory === "ATTRIBUTE_VALUE") return "Attribute Value";
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

  // Attribute-value findings carry the value the component recorded when the
  // suggestion was generated; the live value is re-checked from it at apply time.
  if (issueType === "ATTRIBUTE_VALUE_SUGGESTION") {
    const recorded = finding.currentValue?.value;
    return typeof recorded === "string" && recorded.trim().length > 0
      ? recorded.trim()
      : "Not set";
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

  if (finding.issueType === "ATTRIBUTE_VALUE_SUGGESTION") {
    const display = suggested.display;
    if (typeof display === "string" && display.trim().length > 0) {
      return display.trim();
    }
    const code =
      typeof suggested.attributeCode === "string"
        ? suggested.attributeCode
        : null;
    return code ?? "—";
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

/**
 * What the detail dialog's primary action does, stated in the dialog body.
 *
 * The consequence belongs with the finding rather than in the footer: the footer
 * carries actions only (DESIGN.md), and a reviewer should meet the consequence
 * while reading the finding, before reaching for a button. The applicable wording
 * is composed from the action label so it cannot drift from the button it
 * describes; the review-only wording is its own sentence because it names no
 * button ("Accept" is not what writes, and not what a duplicate gets offered).
 */
export function actionConsequenceNote(applicable: boolean): string {
  return applicable
    ? `${APPLY_COPY.label} writes the suggested value to the component.`
    : "Accepting this finding does not modify the component.";
}

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
    case "COMPONENT_RETIRED":
      return "This component was consolidated into another component and can no longer be modified. The suggestion was not applied.";
    case "ATTRIBUTE_VALUE_CHANGED":
      return "The component's recorded value for this attribute changed after this finding was generated. The suggestion was not applied — re-run datasheet analysis to refresh it.";
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
  semanticCandidatesTruncated?: boolean;
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
  if (result.semanticCandidatesTruncated) {
    notes.push("similarity candidates were capped for this run");
  }

  const summary = parts.join(" · ");
  return notes.length > 0
    ? `${summary}. Note: ${notes.join("; ")}.`
    : `${summary}.`;
}
