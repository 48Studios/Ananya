import type {
  AttributeReviewDecision,
  AttributeReviewFindingDto,
  AttributeReviewIssueType,
  AttributeReviewQueuePageDto,
  AttributeReviewStatus,
} from "./api/attribute-review-queue-api";

/**
 * Attribute Intelligence review queue presentation logic.
 *
 * Pure and React-free, so every rule the queue applies — which tab a finding
 * belongs to, what a status means, who may act, what a decision is called — is
 * unit testable in this workspace (there is no DOM test library in `apps/web`).
 *
 * The wording here mirrors the backend's advisory stance: accepting a finding
 * records that a human approved it, and changes nothing in the attribute library.
 * No copy in this module may imply that a binding, option or definition changed.
 */

/** Existing write permission for the attribute library (`Inventory.Update`). */
export const ATTRIBUTE_WRITE_PERMISSION = "Inventory.Update";

/** Existing read permission (`Inventory.Read`), which the queue's reads require. */
export const ATTRIBUTE_READ_PERMISSION = "Inventory.Read";

// ---------------------------------------------------------------------------
// Queue tabs and the taxonomy mapping
// ---------------------------------------------------------------------------

export type AttributeQueueTabId =
  | "ALL"
  | "BINDINGS"
  | "DUPLICATES"
  | "SUSPICIOUS"
  | "UNUSED"
  | "ENUMS";

/**
 * Persisted issue type → queue tab.
 *
 * The tabs are the ones the queue already had. What changed is the source: the
 * persisted taxonomy rather than the producer's ad-hoc strings, so the mapping is
 * now explicit instead of a substring guess.
 *
 * Notes on the two tabs that never fill:
 *
 *  - `ENUMS` (`SUGGESTED_ENUM_VALUE`) — the type exists in the taxonomy and the
 *    persistence layer can store it, but no producer emits it today
 *    (`suggestEnumValues` is a separate, per-attribute endpoint that creates
 *    nothing). The tab is kept because it is part of the queue's information
 *    architecture and the type is representable; it is documented as empty rather
 *    than quietly removed.
 *  - `BINDINGS` covers both directions of the category/attribute relationship:
 *    `MISSING_EXPECTED_ATTRIBUTE` is the category-first form ("this category
 *    should carry this attribute") and `SUGGESTED_BINDING` the attribute-first
 *    form. Neither is invented; both are in the taxonomy.
 */
export const ATTRIBUTE_ISSUE_TYPES_BY_TAB: Record<
  Exclude<AttributeQueueTabId, "ALL">,
  readonly AttributeReviewIssueType[]
> = {
  BINDINGS: ["MISSING_EXPECTED_ATTRIBUTE", "SUGGESTED_BINDING"],
  DUPLICATES: ["POSSIBLE_DUPLICATE", "DUPLICATE_ATTRIBUTE"],
  SUSPICIOUS: ["SUSPICIOUS_BINDING"],
  UNUSED: ["UNUSED_ATTRIBUTE"],
  ENUMS: ["SUGGESTED_ENUM_VALUE"],
};

export const ATTRIBUTE_QUEUE_TABS: readonly {
  id: AttributeQueueTabId;
  label: string;
}[] = [
  { id: "ALL", label: "All" },
  { id: "BINDINGS", label: "Bindings" },
  { id: "DUPLICATES", label: "Duplicates" },
  { id: "SUSPICIOUS", label: "Suspicious" },
  { id: "UNUSED", label: "Unused" },
  { id: "ENUMS", label: "Enums" },
];

/** Whether a persisted finding belongs to a tab. */
export function findingMatchesTab(
  finding: Pick<AttributeReviewFindingDto, "issueType">,
  tabId: AttributeQueueTabId,
): boolean {
  if (tabId === "ALL") return true;
  return (ATTRIBUTE_ISSUE_TYPES_BY_TAB[tabId] as readonly string[]).includes(
    finding.issueType,
  );
}

/**
 * The issue types a tab filters on, as a comma-separated query value.
 *
 * Sent to the server so filtering happens in SQL. `undefined` for `ALL`, which
 * means "no issue-type filter" rather than "every type listed".
 */
export function tabIssueTypeFilter(
  tabId: AttributeQueueTabId,
): string | undefined {
  if (tabId === "ALL") return undefined;
  return ATTRIBUTE_ISSUE_TYPES_BY_TAB[tabId].join(",");
}

/**
 * Tab counts derived from the persisted per-type counts.
 *
 * Counts come from the backend's grouped count of stored rows; nothing here
 * re-derives them from a producer run.
 */
export function buildAttributeTabCounts(
  counts: AttributeReviewQueuePageDto["counts"] | null,
): Record<AttributeQueueTabId, number> {
  const byIssueType = counts?.byIssueType ?? {};
  const countFor = (tabId: AttributeQueueTabId): number => {
    if (tabId === "ALL") return counts?.total ?? 0;
    return ATTRIBUTE_ISSUE_TYPES_BY_TAB[tabId].reduce(
      (sum, issueType) => sum + (byIssueType[issueType] ?? 0),
      0,
    );
  };

  return {
    ALL: countFor("ALL"),
    BINDINGS: countFor("BINDINGS"),
    DUPLICATES: countFor("DUPLICATES"),
    SUSPICIOUS: countFor("SUSPICIOUS"),
    UNUSED: countFor("UNUSED"),
    ENUMS: countFor("ENUMS"),
  };
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

export const ATTRIBUTE_STATUS_LABELS: Record<AttributeReviewStatus, string> = {
  PENDING: "Needs review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DISMISSED: "Dismissed",
  STALE: "Stale",
};

/** Badge tone per status, using the shared `StatusBadge` vocabulary. */
export const ATTRIBUTE_STATUS_BADGES: Record<AttributeReviewStatus, string> = {
  PENDING: "IN_REVIEW",
  ACCEPTED: "SUCCESS",
  REJECTED: "DISMISSED",
  DISMISSED: "DRAFT",
  STALE: "WARNING",
};

export function attributeStatusLabel(status: string): string {
  return ATTRIBUTE_STATUS_LABELS[status as AttributeReviewStatus] ?? status;
}

export function attributeStatusBadge(status: string): string {
  return ATTRIBUTE_STATUS_BADGES[status as AttributeReviewStatus] ?? "DRAFT";
}

export function confidenceBadgeStatus(
  level: string | null | undefined,
): string {
  if (level === "HIGH") return "SUCCESS";
  if (level === "MEDIUM") return "IN_REVIEW";
  return "DRAFT";
}

/** Human label for a persisted issue type, falling back to the raw value. */
export const ATTRIBUTE_ISSUE_TYPE_LABELS: Record<
  AttributeReviewIssueType,
  string
> = {
  DUPLICATE_ATTRIBUTE: "Duplicate attribute",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  SUGGESTED_BINDING: "Suggested binding",
  MISSING_EXPECTED_ATTRIBUTE: "Missing expected attribute",
  SUSPICIOUS_BINDING: "Suspicious binding",
  SUGGESTED_ENUM_VALUE: "Suggested enum value",
  INCONSISTENT_CONFIG: "Inconsistent configuration",
  UNUSED_ATTRIBUTE: "Unused attribute",
};

export function attributeIssueTypeLabel(issueType: string): string {
  return (
    ATTRIBUTE_ISSUE_TYPE_LABELS[issueType as AttributeReviewIssueType] ??
    issueType
  );
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** Statuses from which a decision is still possible, mirroring the backend. */
export const ATTRIBUTE_DECIDABLE_STATUSES: Record<
  AttributeReviewDecision,
  readonly AttributeReviewStatus[]
> = {
  ACCEPTED: ["PENDING"],
  REJECTED: ["PENDING", "STALE"],
  DISMISSED: ["PENDING", "STALE"],
};

export function canDecideAttributeFinding(
  finding: Pick<AttributeReviewFindingDto, "status">,
  decision: AttributeReviewDecision,
): boolean {
  return (
    ATTRIBUTE_DECIDABLE_STATUSES[decision] as readonly string[]
  ).includes(finding.status);
}

export interface AttributeDecisionCopy {
  /** Verb on the button. */
  action: string;
  /** Label the status becomes. */
  result: string;
  /** Confirmation/summary text shown after the decision. */
  summary: string;
}

/**
 * Copy for each decision.
 *
 * The wording states plainly that a decision only records a review outcome. The
 * queue previously labelled the primary action "Accept Binding" while the handler
 * created a definition and a binding; that is no longer what happens, so the copy
 * no longer implies it.
 */
export const ATTRIBUTE_DECISION_COPY: Record<
  AttributeReviewDecision,
  AttributeDecisionCopy
> = {
  ACCEPTED: {
    action: "Accept",
    result: "Accepted",
    summary:
      "Accepted for review. Nothing in the attribute library was changed — applying findings is a later step.",
  },
  REJECTED: {
    action: "Reject",
    result: "Rejected",
    summary: "Rejected. The finding is closed and will not be proposed again.",
  },
  DISMISSED: {
    action: "Dismiss",
    result: "Dismissed",
    summary: "Dismissed. The finding stays recorded but is no longer pending.",
  },
};

/** Explains what accepting does and does not do, for the confirm step. */
export function attributeAcceptNotice(): string {
  return "Accepting records your review decision only. No binding, option, attribute definition or component value is created or changed.";
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface AttributeReviewPermissions {
  /** May record ACCEPTED / REJECTED / DISMISSED decisions. */
  canDecide: boolean;
  /** May run the library audit (which creates and stales persisted findings). */
  canAudit: boolean;
  /** True when the queue is read-only for this user. */
  isReadOnly: boolean;
}

/**
 * Derives every write capability the queue offers from the single existing
 * attribute-write permission.
 *
 * Decisions and audits are both persisted writes, so both use `Inventory.Update`
 * rather than introducing a new permission. The backend enforces each
 * independently; this only decides what the UI offers.
 *
 * There is no `canApply`: this pass has no Apply.
 */
export function deriveAttributeReviewPermissions(
  canWriteAttributes: boolean,
): AttributeReviewPermissions {
  return {
    canDecide: canWriteAttributes,
    canAudit: canWriteAttributes,
    isReadOnly: !canWriteAttributes,
  };
}

/** Read-only explanation shown when the user may inspect but not act. */
export function attributeReviewReadOnlyNotice(): string {
  return `Read-only access: you can review findings and their evidence, but recording decisions and running audits require the ${ATTRIBUTE_WRITE_PERMISSION} permission.`;
}

/** Explains why the audit action is unavailable, so it is never a dead control. */
export function attributeAuditUnavailableReason(
  canWriteAttributes: boolean,
): string | null {
  return canWriteAttributes
    ? null
    : `Running a library audit requires the ${ATTRIBUTE_WRITE_PERMISSION} permission.`;
}

// ---------------------------------------------------------------------------
// Conflict and audit messaging
// ---------------------------------------------------------------------------

/**
 * A conflict the backend reported, in the queue's own terms.
 *
 * The API returns 409 with a message; the queue's job is to explain what to do
 * next rather than echo a status code.
 */
export function attributeDecisionConflictMessage(
  statusCode: number,
  message: string,
): string | null {
  if (statusCode === 409) return message;
  if (statusCode === 403) {
    return `You do not have permission to record review decisions (requires ${ATTRIBUTE_WRITE_PERMISSION}).`;
  }
  if (statusCode === 404) {
    return "This finding no longer exists. Refresh the queue to see the current state.";
  }
  return null;
}

/**
 * Summarises an audit run.
 *
 * Reports what the audit did to persisted findings, including anything it could
 * not represent — the backend never discards a producer issue silently, so the
 * summary must not hide the warnings either.
 */
export function summarizeAttributeAudit(result: {
  persistedCount: number;
  createdCount: number;
  refreshedCount: number;
  revivedCount: number;
  staleCount: number;
  warningCount: number;
  isMlActive: boolean;
}): string {
  const source = result.isMlActive
    ? "Model-backed audit"
    : "Deterministic audit";
  const parts = [
    `${result.createdCount} new`,
    `${result.refreshedCount} refreshed`,
  ];
  if (result.revivedCount > 0) parts.push(`${result.revivedCount} revived`);
  if (result.staleCount > 0) parts.push(`${result.staleCount} retired as stale`);

  const warnings =
    result.warningCount > 0
      ? ` ${result.warningCount} item${result.warningCount === 1 ? "" : "s"} could not be represented and are listed below the queue.`
      : "";

  return `${source} complete: ${parts.join(", ")}.${warnings}`;
}

/** Explains a conflict returned by the audit route. */
export function attributeAuditConflictMessage(statusCode: number): string | null {
  if (statusCode === 409) {
    return "A library audit is already running. Wait for it to finish before starting another.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Subject presentation
// ---------------------------------------------------------------------------

/** Reads the producer's own name for the condition, when it recorded one. */
export function producerIssueTypeLabel(
  finding: Pick<AttributeReviewFindingDto, "issueType" | "metadata">,
): string {
  const producerType = finding.metadata?.producerIssueType;
  if (typeof producerType === "string" && producerType.length > 0) {
    return producerType;
  }
  return finding.issueType;
}

/**
 * Reads the declared canonical code from the suggested state.
 *
 * A category-first finding about an attribute that does not exist names the code
 * instead of pointing at a row, so the code is the only identity available.
 */
export function suggestedCanonicalCode(
  finding: Pick<AttributeReviewFindingDto, "suggestedValue" | "metadata">,
): string | null {
  const fromSuggestion = finding.suggestedValue?.canonicalCode;
  if (typeof fromSuggestion === "string" && fromSuggestion.length > 0) {
    return fromSuggestion;
  }
  const fromMetadata = finding.metadata?.attributeCode;
  return typeof fromMetadata === "string" && fromMetadata.length > 0
    ? fromMetadata
    : null;
}

/** Whether a finding's subject attribute does not exist in the library yet. */
export function isExpectationForUndefinedAttribute(
  finding: Pick<AttributeReviewFindingDto, "attributeDefinitionId" | "issueType">,
): boolean {
  return (
    finding.issueType === "MISSING_EXPECTED_ATTRIBUTE" &&
    finding.attributeDefinitionId === null
  );
}

/**
 * Whether the queue can navigate to an attribute for this finding.
 *
 * Only a finding that actually references a definition can be opened; a
 * category-first expectation has nothing to open, which the UI must say rather
 * than showing a control that does nothing.
 */
export function findingAttributeSubjectId(
  finding: Pick<
    AttributeReviewFindingDto,
    "attributeDefinitionId" | "relatedAttributeDefinitionId"
  >,
): string | null {
  return finding.attributeDefinitionId;
}

/** Usage evidence recorded by the producer, for the unused/suspicious families. */
export function producerUsageEvidence(
  finding: Pick<AttributeReviewFindingDto, "metadata">,
): { componentValueCount: number | null; bindingCount: number | null } {
  const observations = finding.metadata?.producerObservations;
  if (!observations || typeof observations !== "object") {
    return { componentValueCount: null, bindingCount: null };
  }
  const record = observations as Record<string, unknown>;
  const readNumber = (key: string): number | null => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    componentValueCount: readNumber("componentValueCount"),
    bindingCount: readNumber("directBindingCount"),
  };
}

/**
 * Display label for a finding's subject, for the queue row.
 *
 * Title-first (the backend composes a title that matches the queue's own wording)
 * with a tag fallback so a row is never blank.
 */
export function findingHeadline(finding: AttributeReviewFindingDto): string {
  const title = finding.title?.trim();
  if (title) return title;
  const description = finding.description?.trim();
  if (description) return description;
  return attributeIssueTypeLabel(finding.issueType);
}
