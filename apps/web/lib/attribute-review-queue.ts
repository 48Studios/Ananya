import type {
  AttributeApplyAction,
  AttributeApplicationResult,
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
// Application worklists
// ---------------------------------------------------------------------------

/**
 * The queue's worklist selector.
 *
 * Three options, not a second filter system: the same control pattern as the
 * status selector beside it, expressing the one dimension a reviewer needs in
 * order to work through findings rather than browse them.
 *
 *  - `ALL` — no application filter. Everything, including findings the reviewer
 *    has not decided yet.
 *  - `READY_TO_APPLY` — `ACCEPTED` + `NOT_APPLIED`. The work list: approved, not
 *    yet carried out.
 *  - `APPLIED` — `application_result = APPLIED`. History: what the intelligence
 *    actually changed. Kept readable rather than hidden once acted on, because it
 *    is the audit trail of the workflow.
 */
export type AttributeWorklistId = "ALL" | "READY_TO_APPLY" | "APPLIED";

export const ATTRIBUTE_WORKLISTS: ReadonlyArray<{
  id: AttributeWorklistId;
  label: string;
}> = [
  { id: "ALL", label: "All" },
  { id: "READY_TO_APPLY", label: "Ready to Apply" },
  { id: "APPLIED", label: "Applied" },
];

/**
 * The server-side filter a worklist expresses.
 *
 * `READY_TO_APPLY` is the only one that pins the review status as well, because
 * "ready to apply" is the intersection of approval and non-application. `APPLIED`
 * deliberately does NOT pin the status: applying never changes it, so an applied
 * finding is still `ACCEPTED`, and pinning it would silently drop any applied
 * finding whose status later moved.
 */
export function worklistFilter(worklist: AttributeWorklistId): {
  status?: string;
  applicationResult?: string;
} {
  switch (worklist) {
    case "READY_TO_APPLY":
      return { status: "ACCEPTED", applicationResult: "NOT_APPLIED" };
    case "APPLIED":
      return { applicationResult: "APPLIED" };
    default:
      return {};
  }
}

/** Size of each worklist, from persisted counts. */
export function buildAttributeWorklistCounts(
  counts: AttributeReviewQueuePageDto["counts"] | null,
): Record<AttributeWorklistId, number> {
  return {
    ALL: counts?.total ?? 0,
    READY_TO_APPLY: counts?.readyToApply ?? 0,
    APPLIED: counts?.applicationResults?.APPLIED ?? 0,
  };
}

/**
 * The application-state label for a finding.
 *
 * Reported next to the review status rather than merged into it, because the two
 * are separate facts: `ACCEPTED` is the reviewer's decision, `APPLIED` is what the
 * library now records.
 */
export function attributeApplicationLabel(
  finding: Pick<AttributeReviewFindingDto, "applicationResult">,
): string {
  return isAttributeFindingApplied(finding) ? "Applied" : "Not applied";
}

/** Whether a finding belongs to a worklist, for the empty-state copy. */
export function findingMatchesWorklist(
  finding: Pick<
    AttributeReviewFindingDto,
    "status" | "applicationResult"
  >,
  worklist: AttributeWorklistId,
): boolean {
  switch (worklist) {
    case "READY_TO_APPLY":
      return (
        finding.status === "ACCEPTED" &&
        finding.applicationResult === "NOT_APPLIED"
      );
    case "APPLIED":
      return finding.applicationResult === "APPLIED";
    default:
      return true;
  }
}

/** Empty-state copy for a worklist with nothing in it. */
export function attributeWorklistEmptyMessage(
  worklist: AttributeWorklistId,
): string {
  switch (worklist) {
    case "READY_TO_APPLY":
      return "Nothing is waiting to be applied. Accept a finding to queue it here.";
    case "APPLIED":
      return "No finding has been applied yet. Applying one records what changed in the attribute library.";
    default:
      return "No findings match these filters";
  }
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
  /** May apply an accepted finding to the attribute library. */
  canApply: boolean;
  /** May run the library audit (which creates and stales persisted findings). */
  canAudit: boolean;
  /** True when the queue is read-only for this user. */
  isReadOnly: boolean;
}

/**
 * Derives every write capability the queue offers from the single existing
 * attribute-write permission.
 *
 * Decisions, applications and audits are all persisted writes, so all three use
 * `Inventory.Update` rather than introducing a new permission. The backend enforces
 * each independently; this only decides what the UI offers.
 */
export function deriveAttributeReviewPermissions(
  canWriteAttributes: boolean,
): AttributeReviewPermissions {
  return {
    canDecide: canWriteAttributes,
    canApply: canWriteAttributes,
    canAudit: canWriteAttributes,
    isReadOnly: !canWriteAttributes,
  };
}

/** Read-only explanation shown when the user may inspect but not act. */
export function attributeReviewReadOnlyNotice(): string {
  return `Read-only access: you can review findings and their evidence, but recording decisions, applying findings, and running audits require the ${ATTRIBUTE_WRITE_PERMISSION} permission.`;
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

// ---------------------------------------------------------------------------
// Apply (the one mutation path)
// ---------------------------------------------------------------------------

/**
 * Finding families that can be applied, and the action each performs.
 *
 * Mirrors `ATTRIBUTE_APPLY_RULES` in the API. A family absent from this table is
 * review-only — `POSSIBLE_DUPLICATE` and `UNUSED_ATTRIBUTE` have no implemented
 * mutation, so the UI must not offer one.
 */
export const ATTRIBUTE_APPLY_RULES: Partial<
  Record<AttributeReviewIssueType, AttributeApplyAction>
> = {
  MISSING_EXPECTED_ATTRIBUTE: "ADD_BINDING",
  SUSPICIOUS_BINDING: "REMOVE_BINDING",
};

/** The action a finding would apply, or `null` when it is review-only. */
export function attributeApplyAction(
  finding: Pick<AttributeReviewFindingDto, "issueType">,
): AttributeApplyAction | null {
  return (
    ATTRIBUTE_APPLY_RULES[finding.issueType as AttributeReviewIssueType] ?? null
  );
}

/**
 * The verb on the apply button.
 *
 * Action-specific rather than a generic "Apply": the reviewer should be able to
 * read the button and know exactly what will change in the library.
 */
export const ATTRIBUTE_APPLY_LABELS: Record<AttributeApplyAction, string> = {
  ADD_BINDING: "Add Binding",
  REMOVE_BINDING: "Remove Binding",
};

export function attributeApplyLabel(action: AttributeApplyAction): string {
  return ATTRIBUTE_APPLY_LABELS[action];
}

export function isAttributeFindingApplied(
  finding: Pick<AttributeReviewFindingDto, "applicationResult">,
): boolean {
  return finding.applicationResult === "APPLIED";
}

/**
 * Whether the UI should offer Apply for this finding.
 *
 * Three conditions, all required: the family has an implemented mutation, the
 * finding is ACCEPTED (acceptance is the reviewer's approval, applying is a
 * separate act), and it has not already been applied. The backend enforces the
 * same rules and more (expected state, target validity), so this is an
 * affordance rather than the authority — a finding that looks applicable here
 * can still be refused.
 */
export function canApplyAttributeFinding(
  finding: Pick<
    AttributeReviewFindingDto,
    "issueType" | "status" | "applicationResult"
  >,
  canWriteAttributes: boolean,
): boolean {
  if (!canWriteAttributes) return false;
  if (attributeApplyAction(finding) === null) return false;
  if (isAttributeFindingApplied(finding)) return false;
  return finding.status === "ACCEPTED";
}

/**
 * Why Apply is unavailable, so the UI never shows a dead control without a
 * reason.
 *
 * Returns `null` when Apply is offered.
 */
export function attributeApplyUnavailableReason(
  finding: Pick<
    AttributeReviewFindingDto,
    "issueType" | "status" | "applicationResult"
  >,
  canWriteAttributes: boolean,
): string | null {
  if (isAttributeFindingApplied(finding)) {
    return "Already applied to the attribute library.";
  }
  if (attributeApplyAction(finding) === null) {
    return "This finding is review-only: no change to the attribute library is implemented for it.";
  }
  if (!canWriteAttributes) {
    return `Applying a finding changes the attribute library, which requires the ${ATTRIBUTE_WRITE_PERMISSION} permission. You can still accept or reject this finding as a review decision.`;
  }
  // Offered: the only status that can apply, with an implemented action and no
  // prior application, has no reason to report.
  if (finding.status === "ACCEPTED") return null;
  if (finding.status === "PENDING") {
    return "Accept this finding first. Accepting records your approval; applying is a separate, explicit step.";
  }
  if (finding.status === "STALE") {
    return "This finding is stale. Re-run the library audit to refresh it before applying.";
  }
  return `This finding is ${attributeStatusLabel(finding.status).toLowerCase()} and cannot be applied.`;
}

/**
 * Names the finding's own expected state already recorded.
 *
 * The queue holds ids, and the persisted finding carries the analysis-time
 * snapshots, so the confirmation can name the attribute and the category without
 * a second request. Each name falls back to the id, because showing an id is
 * better than showing nothing in a confirmation the reviewer must judge.
 */
export function attributeApplySubject(finding: AttributeReviewFindingDto): {
  attributeName: string;
  categoryName: string;
} {
  const current = readRecord(finding.currentValue);
  const snapshotAttribute = readRecord(current?.attribute);
  const snapshotCategory = readRecord(current?.category);

  const expectedAttributeName = readString(current?.expectedAttributeName);
  const suggestedName = readString(
    readRecord(finding.suggestedValue)?.canonicalName,
  );

  const attributeName =
    expectedAttributeName ??
    readString(snapshotAttribute?.name) ??
    suggestedName ??
    finding.attributeDefinitionId ??
    "the named attribute";

  const categoryName =
    readString(snapshotCategory?.name) ??
    finding.categoryId ??
    "the target category";

  return { attributeName, categoryName };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export interface AttributeApplyConfirmation {
  title: string;
  /** Plain-language description of exactly what will change. */
  description: string;
  confirmLabel: string;
  /** Subject summary rows shown in the confirmation. */
  subject: Array<{ label: string; value: string }>;
  /** True when the action removes something, for destructive styling. */
  destructive: boolean;
}

/**
 * Content for the pre-apply confirmation.
 *
 * The mutation must be obvious before it happens, so the confirmation names the
 * attribute and the category and states the resulting library state in words.
 * The consequences are scoped deliberately: applying a binding finding never
 * creates or deletes an attribute definition, a category or a component value,
 * and saying so is what makes the confirmation usable.
 */
export function attributeApplyConfirmation(input: {
  finding: AttributeReviewFindingDto;
  action: AttributeApplyAction;
}): AttributeApplyConfirmation {
  const { finding, action } = input;
  const { attributeName, categoryName } = attributeApplySubject(finding);

  const subject = [
    { label: "Attribute", value: attributeName },
    { label: "Category", value: categoryName },
  ];

  if (action === "ADD_BINDING") {
    return {
      title: "Add attribute binding?",
      description: `This will bind "${attributeName}" to "${categoryName}", making the attribute available to this category. The binding is applied to the stored attribute library now.`,
      confirmLabel: "Add Binding",
      subject,
      destructive: false,
    };
  }

  return {
    title: "Remove attribute binding?",
    description: `This will remove the binding between "${attributeName}" and "${categoryName}", so the attribute will no longer be available to this category. The attribute and the category are kept; component values are not changed.`,
    confirmLabel: "Remove Binding",
    subject,
    destructive: true,
  };
}

/** Success copy for a completed application, naming what changed. */
export function attributeApplySuccessMessage(result: {
  action: AttributeApplyAction;
  attributeName: string;
  categoryName: string;
  appliedState: string;
}): string {
  const verb = result.action === "ADD_BINDING" ? "Bound" : "Unbound";
  const consequence =
    result.action === "ADD_BINDING"
      ? "the attribute is now available to this category"
      : "the attribute is no longer available to this category";
  return `${verb} "${result.attributeName}" and "${result.categoryName}" — ${consequence}. Recorded state: ${result.appliedState}.`;
}

/**
 * Explains an apply refusal in the queue's own terms.
 *
 * The backend's message is preferred when it has one, because it knows the
 * specific state that changed; these fallbacks exist so a client never shows a
 * bare status code.
 */
export const ATTRIBUTE_APPLY_CONFLICT_REASONS = [
  "UNSUPPORTED_FINDING_TYPE",
  "UNSUPPORTED_ACTION",
  "FINDING_NOT_ACCEPTED",
  "ALREADY_APPLIED",
  "FINDING_STALE",
  "UNSUPPORTED_TARGET",
  "TARGET_NOT_FOUND",
  "TARGET_INACTIVE",
  "TARGET_ALREADY_EXISTS",
  "CONCURRENT_APPLICATION",
  "DOMAIN_REFUSED",
] as const;

export type AttributeApplyConflictReason =
  (typeof ATTRIBUTE_APPLY_CONFLICT_REASONS)[number];

export function isAttributeApplyConflictReason(
  value: unknown,
): value is AttributeApplyConflictReason {
  return (
    typeof value === "string" &&
    (ATTRIBUTE_APPLY_CONFLICT_REASONS as readonly string[]).includes(value)
  );
}

export function attributeApplyConflictMessage(
  statusCode: number,
  body: unknown,
): string {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = record.message;
  if (typeof message === "string" && message.length > 0) return message;

  if (statusCode === 403) {
    return `You do not have permission to apply findings (requires ${ATTRIBUTE_WRITE_PERMISSION}).`;
  }
  if (statusCode === 404) {
    return "This finding no longer exists. Refresh the queue to see the current state.";
  }
  if (statusCode === 409) {
    return "This finding could not be applied because the attribute library changed. Refresh the queue and review it again.";
  }
  return "The finding could not be applied.";
}

/**
 * The status filter to apply after a finding is applied successfully.
 *
 * A work-list filter ("needs review") would hide the finding the reviewer just
 * applied, so applying one moves the view to the accepted list — which is where an
 * applied finding now belongs, since applying resolves it out of the work list.
 * Any other filter is left exactly as the reviewer set it.
 */
export function statusFilterAfterApply(currentStatusFilter: string): string {
  return currentStatusFilter === "PENDING" || currentStatusFilter === "PENDING,STALE"
    ? "ACCEPTED"
    : currentStatusFilter;
}

/**
 * Post-application state line for a finding that has been applied.
 *
 * Acceptance and application are reported together and separately: the reviewer
 * needs to see that the finding is still ACCEPTED (their decision stands) *and*
 * that the library now carries the change.
 */
export function attributeAppliedSummary(finding: {
  applicationResult: AttributeApplicationResult;
  status: AttributeReviewStatus;
  updatedAt: string | null;
  reviewerEmail: string | null;
}): string | null {
  if (!isAttributeFindingApplied(finding)) return null;

  const parts = ["Applied to the attribute library"];
  const appliedAt = finding.updatedAt ?? null;
  if (appliedAt) {
    const parsed = new Date(appliedAt);
    if (!Number.isNaN(parsed.getTime())) {
      parts.push(parsed.toLocaleString());
    }
  }
  if (finding.reviewerEmail) parts.push(`by ${finding.reviewerEmail}`);
  return parts.join(" · ");
}
