import type {
  AttributeApplyAction,
  AttributeApplicationResult,
  AttributeReviewDecision,
  AttributeReviewFindingDto,
  AttributeReviewIssueType,
  AttributeReviewQueuePageDto,
  AttributeReviewStatus,
} from "./api/attribute-review-queue-api";
import {
  ALL_FILTER_VALUE,
  INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS,
  INTELLIGENCE_STATUS_FILTER_OPTIONS,
  INTELLIGENCE_STATUS_LABELS,
  type ReviewFilterOption,
} from "./intelligence-review-filters";

/** Re-exported so the queue keeps a single import site for its vocabulary. */
export { ALL_FILTER_VALUE };

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
// Application state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

export const ATTRIBUTE_STATUS_LABELS: Record<AttributeReviewStatus, string> =
  INTELLIGENCE_STATUS_LABELS;

/**
 * Status and confidence filter options, from the shared vocabulary.
 *
 * The Attribute queue was the surface that already used "Needs review"; the
 * Component queue now matches it, and both offer the identical option list so a
 * reviewer moving between the two queues sees the same controls.
 */
export const ATTRIBUTE_STATUS_FILTER_OPTIONS: ReviewFilterOption[] =
  INTELLIGENCE_STATUS_FILTER_OPTIONS;

export const ATTRIBUTE_CONFIDENCE_FILTER_OPTIONS: ReviewFilterOption[] =
  INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS;

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
      "Accepted for review. Nothing was changed in the attribute library.",
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

/** Names a queue row shows for the subject a finding is about. */
export interface AttributeFindingSubjectLabels {
  /** The finding's own attribute; null for a category-first expectation. */
  attribute: string | null;
  /** The attribute a duplicate finding matches; null for every other family. */
  relatedAttribute: string | null;
  /** The category the finding concerns; null when it names none. */
  category: string | null;
}

/**
 * Human-readable labels for a finding's subject, for the queue row.
 *
 * The row identifies its subject by name: a reviewer recognises "Package / Case",
 * not a uuid. The names come from the expected-state snapshot the finding was
 * persisted with — the same source the apply confirmation reads — so the row needs
 * no second request and cannot describe a different attribute than the finding does.
 *
 * Every label degrades name → code → id: a name is what a reviewer reads, a code is
 * still recognisable, and the id is a last resort so a subject is never blank. `null`
 * means the family names no such subject, which the row states rather than fills in.
 */
export function findingSubjectLabels(
  finding: Pick<
    AttributeReviewFindingDto,
    | "currentValue"
    | "suggestedValue"
    | "metadata"
    | "attributeDefinitionId"
    | "relatedAttributeDefinitionId"
    | "categoryId"
  >,
): AttributeFindingSubjectLabels {
  // `metadata.expectedState` and `currentValue` hold the same snapshot by
  // construction, and the API's staleness check falls back from one to the other, so
  // the reader does too rather than showing a blank subject for a finding whose
  // producer recorded it in the other of the two equivalent places.
  const snapshot =
    readRecord(finding.metadata?.expectedState) ??
    readRecord(finding.currentValue);
  const suggested = readRecord(finding.suggestedValue);

  // A duplicate/near-duplicate finding snapshots BOTH attributes as one canonical
  // pair: the side carrying the finding's own subject id is the attribute, the other
  // is the match. Matching by id rather than by position keeps that true if the
  // canonical order ever changes.
  const pair = [
    readRecord(snapshot?.attributeA),
    readRecord(snapshot?.attributeB),
  ].filter((side): side is Record<string, unknown> => side !== null);
  const declaredId = finding.attributeDefinitionId;
  const subjectSide =
    (declaredId
      ? pair.find((side) => readString(side.id) === declaredId)
      : undefined) ??
    pair[0] ??
    null;
  const matchSide = subjectSide
    ? (pair.find((side) => side !== subjectSide) ?? null)
    : null;

  return {
    attribute:
      snapshotLabel(readRecord(snapshot?.attribute)) ??
      snapshotLabel(readRecord(snapshot?.existingAttribute)) ??
      snapshotLabel(subjectSide) ??
      readString(snapshot?.expectedAttributeName) ??
      readString(suggested?.canonicalName) ??
      finding.attributeDefinitionId,
    relatedAttribute:
      snapshotLabel(matchSide) ?? finding.relatedAttributeDefinitionId,
    category:
      snapshotLabel(readRecord(snapshot?.category)) ?? finding.categoryId,
  };
}

/** A snapshot's own label: its name, then its code, then nothing. */
function snapshotLabel(snapshot: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  return readString(snapshot.name) ?? readString(snapshot.code);
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
 * Finding families that can be applied, in the order they are offered.
 *
 * Mirrors `ATTRIBUTE_APPLY_RULES` in the API. A family absent from this table is
 * review-only — `POSSIBLE_DUPLICATE` and `UNUSED_ATTRIBUTE` have no implemented
 * mutation, so the UI must not offer one.
 *
 * `MISSING_EXPECTED_ATTRIBUTE` lists two actions because the same expectation is
 * settled either by binding a definition that exists or by creating the one that
 * does not. Which one applies is decided per finding by {@link attributeApplyAction}.
 */
export const ATTRIBUTE_APPLY_RULES: Partial<
  Record<AttributeReviewIssueType, readonly AttributeApplyAction[]>
> = {
  MISSING_EXPECTED_ATTRIBUTE: ["ADD_BINDING", "CREATE_DEFINITION"],
  SUSPICIOUS_BINDING: ["REMOVE_BINDING"],
};

/**
 * The action a finding would apply, or `null` when none is justified.
 *
 * Mirrors the API's `resolveAttributeApplyAction`, and reads the same persisted
 * fields: a category-first expectation (no resolved definition, producer said the
 * attribute is not in the library) is a **Create Attribute**, an expectation whose
 * definition resolved is an **Add Binding**, and an expectation that names no
 * definition while its producer claimed one exists is neither — the audit's
 * ambiguous case, which the UI must not offer an action for. The backend enforces
 * the same rule and refuses anything else, so this is an affordance, not the
 * authority.
 */
export function attributeApplyAction(
  finding: Pick<
    AttributeReviewFindingDto,
    "issueType" | "attributeDefinitionId" | "suggestedValue"
  >,
): AttributeApplyAction | null {
  const rule = ATTRIBUTE_APPLY_RULES[
    finding.issueType as AttributeReviewIssueType
  ];
  if (!rule || rule.length === 0) return null;

  if (finding.issueType === "MISSING_EXPECTED_ATTRIBUTE") {
    if (finding.attributeDefinitionId) return "ADD_BINDING";
    const isExisting = finding.suggestedValue?.isExisting;
    return isExisting === false ? "CREATE_DEFINITION" : null;
  }

  return rule[0] ?? null;
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
  CREATE_DEFINITION: "Create Attribute",
};

export function attributeApplyLabel(action: AttributeApplyAction): string {
  return ATTRIBUTE_APPLY_LABELS[action];
}

/**
 * The tooltip on the apply button.
 *
 * One sentence per action, so a hover states what will change in the library rather
 * than naming the action again. Every one of them says the library changes, because
 * that is what makes this control different from the decision buttons beside it.
 */
export const ATTRIBUTE_APPLY_ACTION_TITLES: Record<
  AttributeApplyAction,
  string
> = {
  ADD_BINDING:
    "Apply this finding: bind the attribute to this category (changes the attribute library)",
  REMOVE_BINDING:
    "Apply this finding: remove this binding from the category (changes the attribute library)",
  CREATE_DEFINITION:
    "Apply this finding: create the expected attribute definition and bind it to this category (adds a new attribute to the library)",
};

export function attributeApplyActionTitle(
  action: AttributeApplyAction,
): string {
  return ATTRIBUTE_APPLY_ACTION_TITLES[action];
}

/**
 * The label on the combined "Accept & Apply" control.
 *
 * The same words the Component queue's primary action uses, because it is the same
 * act: the reviewer approves the finding and it is carried out. Not a bare "Apply",
 * which would hide the approval half of what happens.
 */
export const ATTRIBUTE_ACCEPT_AND_APPLY_LABEL = "Accept & Apply";

/**
 * The tooltip on the combined control, per action.
 *
 * Both halves are stated in the order they happen: the review decision is recorded
 * first, then the named change is made — which is also the order the API requires.
 */
export const ATTRIBUTE_ACCEPT_AND_APPLY_TITLES: Record<
  AttributeApplyAction,
  string
> = {
  ADD_BINDING:
    "Accept this finding and apply it: record the review decision, then bind the attribute to this category (changes the attribute library)",
  REMOVE_BINDING:
    "Accept this finding and apply it: record the review decision, then remove this binding from the category (changes the attribute library)",
  CREATE_DEFINITION:
    "Accept this finding and apply it: record the review decision, then create the expected attribute definition and bind it to this category (adds a new attribute to the library)",
};

export function attributeAcceptAndApplyTitle(
  action: AttributeApplyAction,
): string {
  return ATTRIBUTE_ACCEPT_AND_APPLY_TITLES[action];
}

export function isAttributeFindingApplied(
  finding: Pick<AttributeReviewFindingDto, "applicationResult">,
): boolean {
  return finding.applicationResult === "APPLIED";
}

/**
 * Whether the UI should offer the apply-only control for this finding.
 *
 * Requiring ACCEPTED is the API's own rule: the attribute library is never
 * mutated without a recorded approval. A finding whose decision is still
 * outstanding is offered through {@link canAcceptAndApplyAttributeFinding}
 * instead, which records the approval first. The other two conditions are an
 * implemented mutation for the family and no prior application. The backend
 * enforces all of this and more (expected state, target validity), so this is an
 * affordance rather than the authority — a finding that looks applicable here
 * can still be refused.
 */
export function canApplyAttributeFinding(
  finding: Pick<
    AttributeReviewFindingDto,
    "issueType" | "status" | "applicationResult" | "attributeDefinitionId" | "suggestedValue"
  >,
  canWriteAttributes: boolean,
): boolean {
  if (!canWriteAttributes) return false;
  if (attributeApplyAction(finding) === null) return false;
  if (isAttributeFindingApplied(finding)) return false;
  return finding.status === "ACCEPTED";
}

/**
 * Whether the UI should offer the combined "Accept & Apply" control.
 *
 * Mirrors the Component queue's primary card action: a PENDING finding whose
 * family has an implemented mutation is approved and carried out as one act, so
 * the reviewer does not have to accept and then hunt for a second button. The
 * approval is still recorded explicitly — the queue records the decision first and
 * only then applies it, because the API refuses to mutate the library for an
 * unreviewed finding; the combined control is what makes the approval part of the
 * same act.
 *
 * Review-only families, already-applied findings, and every status other than
 * PENDING are excluded: those are answered by the apply-only control, which the
 * reviewer reaches once the approval exists.
 */
export function canAcceptAndApplyAttributeFinding(
  finding: Pick<
    AttributeReviewFindingDto,
    "issueType" | "status" | "applicationResult" | "attributeDefinitionId" | "suggestedValue"
  >,
  canWriteAttributes: boolean,
): boolean {
  if (!canWriteAttributes) return false;
  if (attributeApplyAction(finding) === null) return false;
  if (isAttributeFindingApplied(finding)) return false;
  return finding.status === "PENDING";
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
    "issueType" | "status" | "applicationResult" | "attributeDefinitionId" | "suggestedValue"
  >,
  canWriteAttributes: boolean,
): string | null {
  if (isAttributeFindingApplied(finding)) {
    return "Already applied to the attribute library.";
  }
  if (attributeApplyAction(finding) === null) {
    return finding.issueType === "MISSING_EXPECTED_ATTRIBUTE"
      ? "This finding expects an attribute that the audit could not resolve, so there is nothing to bind and nothing to create. Re-run the library audit to refresh it."
      : "This finding is review-only: no change to the attribute library is implemented for it.";
  }
  if (!canWriteAttributes) {
    return `Applying a finding changes the attribute library, which requires the ${ATTRIBUTE_WRITE_PERMISSION} permission. You can still accept or reject this finding as a review decision.`;
  }
  // Offered: ACCEPTED applies through the apply-only control, and PENDING through
  // the combined "Accept & Apply" control, which records the approval as part of
  // the same act — so neither status has a reason to report.
  if (finding.status === "ACCEPTED" || finding.status === "PENDING") return null;
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

/** The attribute-definition proposal a creation would carry out. */
export interface AttributeDefinitionProposalView {
  /** Canonical code, or an empty string when the producer declared none. */
  code: string;
  name: string;
  /** Empty when undeclared — creation is refused without one. */
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  groupName: string | null;
  optionLabels: string[];
  /** Whether the proposal carries everything the library needs to create it. */
  complete: boolean;
  /** What is missing, so the confirmation can say why a create would be refused. */
  missing: string[];
}

/**
 * The definition a `CREATE_DEFINITION` application would create.
 *
 * Read from the persisted finding — `suggestedValue` first, then the expected-state
 * snapshot, which carries the same values by construction. Everything is displayed
 * exactly as proposed: the client cannot edit any of it, and the confirmation must
 * show the real thing rather than a paraphrase. Nothing is invented for display
 * either: an undeclared data type reads as missing rather than defaulting, because
 * the server refuses such a proposal and the reviewer needs to see that before
 * confirming.
 */
export function attributeDefinitionProposal(
  finding: AttributeReviewFindingDto,
): AttributeDefinitionProposalView {
  const suggested = readRecord(finding.suggestedValue);
  const metadata = readRecord(finding.metadata);
  // `metadata.expectedState` and `currentValue` hold the same snapshot by
  // construction, and the API's staleness check falls back from one to the other —
  // so the reader does too, rather than showing an incomplete proposal for a finding
  // whose producer recorded the snapshot in the other of the two equivalent places.
  const expected =
    readRecord(metadata?.expectedState) ?? readRecord(finding.currentValue);

  const code =
    readString(suggested?.canonicalCode) ??
    readString(metadata?.attributeCode) ??
    readString(expected?.expectedAttributeCode) ??
    "";
  const name =
    readString(suggested?.canonicalName) ??
    readString(expected?.expectedAttributeName) ??
    "";
  const dataType = readString(suggested?.dataType) ?? "";
  const unitCategory = readString(suggested?.unitCategory);
  const defaultUnit = readString(suggested?.defaultUnit);
  const groupName = readString(suggested?.groupName);

  const optionLabels = Array.isArray(suggested?.options)
    ? suggested.options
        .map((option) => {
          if (typeof option === "string") return option.trim();
          const record = readRecord(option);
          return readString(record?.label) ?? readString(record?.code);
        })
        .filter((label): label is string => Boolean(label))
    : [];

  const missing: string[] = [];
  if (!code) missing.push("code");
  if (!name) missing.push("name");
  if (!dataType) missing.push("data type");

  return {
    code,
    name,
    dataType,
    unitCategory,
    defaultUnit,
    groupName,
    optionLabels,
    complete: missing.length === 0,
    missing,
  };
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
 * attribute and the category and states the resulting library state in words. The
 * consequences are scoped deliberately: applying a binding finding never creates or
 * deletes an attribute definition, a category or a component value, and saying so is
 * what makes the confirmation usable.
 *
 * `CREATE_DEFINITION` is the one action here that *adds* to the library, so its
 * confirmation lists the definition it will create — code, data type, unit category,
 * default unit, options, group — field by field from the persisted proposal. A
 * reviewer approving a new attribute must see exactly what will exist afterwards, and
 * any field the producer did not declare is shown as missing rather than defaulted.
 *
 * `acceptFirst` is set by the combined "Accept & Apply" control, which still has to
 * record the approval before the library may change. The confirmation then carries
 * the recorded decision as a subject row, so a reviewer confirming one act can see
 * both halves of it.
 */
export function attributeApplyConfirmation(input: {
  finding: AttributeReviewFindingDto;
  action: AttributeApplyAction;
  /**
   * Whether confirming also records the finding as accepted, as the combined
   * "Accept & Apply" control does for a pending finding.
   */
  acceptFirst?: boolean;
}): AttributeApplyConfirmation {
  const { finding, action, acceptFirst = false } = input;
  const { attributeName, categoryName } = attributeApplySubject(finding);

  const subject = [
    { label: "Attribute", value: attributeName },
    { label: "Category", value: categoryName },
  ];

  const decisionRows = acceptFirst
    ? [{ label: "Review decision", value: "Accepted" }]
    : [];

  if (action === "CREATE_DEFINITION") {
    const proposal = attributeDefinitionProposal(finding);
    const optionSummary =
      proposal.optionLabels.length > 0
        ? proposal.optionLabels.join(", ")
        : "None proposed — add them after creating the attribute";

    const rows = [
      ...subject,
      { label: "Code", value: proposal.code || "Not declared" },
      {
        label: "Data type",
        value: proposal.dataType || "Not declared — creation will be refused",
      },
      { label: "Unit category", value: proposal.unitCategory ?? "None" },
      { label: "Default unit", value: proposal.defaultUnit ?? "None" },
      { label: "Options", value: optionSummary },
      { label: "Group", value: proposal.groupName ?? "None" },
      ...decisionRows,
    ];

    const warning = proposal.complete
      ? ""
      : ` This proposal does not declare its ${proposal.missing.join(", ")}, so the server will refuse it — create the attribute manually instead.`;

    return {
      title: "Create this attribute definition?",
      description: `This adds "${proposal.name || attributeName}" to the attribute library as a new definition and binds it to "${categoryName}". It is the only action in this queue that creates an attribute, and nothing is created until you confirm.${warning}`,
      confirmLabel: "Create Attribute",
      subject: rows,
      destructive: false,
    };
  }

  if (action === "ADD_BINDING") {
    return {
      title: "Add attribute binding?",
      description: `This will bind "${attributeName}" to "${categoryName}", making the attribute available to this category. The binding is applied to the stored attribute library now.`,
      confirmLabel: "Add Binding",
      subject: [...subject, ...decisionRows],
      destructive: false,
    };
  }

  return {
    title: "Remove attribute binding?",
    description: `This will remove the binding between "${attributeName}" and "${categoryName}", so the attribute will no longer be available to this category. The attribute and the category are kept; component values are not changed.`,
    confirmLabel: "Remove Binding",
    subject: [...subject, ...decisionRows],
    destructive: true,
  };
}

/** Success copy for a completed application, naming what changed. */
export function attributeApplySuccessMessage(result: {
  action: AttributeApplyAction;
  attributeName: string;
  categoryName: string;
  appliedState: string;
  createdDefinition?: {
    code: string;
    name: string;
    dataType: string;
    optionCount: number;
  } | null;
}): string {
  if (result.action === "CREATE_DEFINITION") {
    const created = result.createdDefinition;
    const identity = created
      ? `"${created.name}" (${created.code}, ${created.dataType})`
      : `"${result.attributeName}"`;
    const options =
      created && created.optionCount > 0
        ? ` ${created.optionCount} option${created.optionCount === 1 ? "" : "s"} were created with it.`
        : "";
    return `Created ${identity} and bound it to "${result.categoryName}" — the attribute is now available to this category.${options} Recorded state: ${result.appliedState}.`;
  }

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
  /** The persisted proposal failed definition validation; nothing was created. */
  "INVALID_PROPOSAL",
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
