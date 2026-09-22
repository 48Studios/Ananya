/**
 * Shared filter vocabulary for every Intelligence Review surface.
 *
 * The Component, Attribute, and Documentation review surfaces are three views of
 * the same workflow — a reviewer picks a status, a confidence band, and a family
 * tab, and works the list. Their filters therefore have to mean the same thing and
 * read the same way everywhere; before this module each surface spelled its own
 * labels, so "Pending Review" and "Needs review" described the same lifecycle
 * state, and one queue's confidence options were "High"/"Medium"/"Low" while the
 * other's were "High confidence"/"Medium confidence"/"Low confidence".
 *
 * Defining the vocabulary once means a label can only be changed for all three
 * surfaces at once. The wording itself is part of the contract: `PENDING` is
 * "Needs review" because the queue is a work list, not a status report.
 *
 * Pure and React-free, like the rest of `apps/web/lib`, so it is unit testable
 * without a DOM (no DOM test library is installed in this workspace).
 */

/** A selectable filter value plus the label a reviewer reads. */
export interface ReviewFilterOption {
  label: string;
  value: string;
}

/**
 * Sentinel for "no filter applied".
 *
 * Sent as a filter value by the select controls, and converted to an omitted
 * query parameter by {@link filterValueToParam} before it reaches the API.
 */
export const ALL_FILTER_VALUE = "ALL";

// ---------------------------------------------------------------------------
// Review status
// ---------------------------------------------------------------------------

/** The lifecycle statuses every intelligence finding shares. */
export const INTELLIGENCE_REVIEW_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "DISMISSED",
  "STALE",
] as const;

export type IntelligenceReviewStatus =
  (typeof INTELLIGENCE_REVIEW_STATUSES)[number];

/**
 * Status wording, defined once for every surface.
 *
 * `PENDING` reads "Needs review": the finding is waiting for a person, which is
 * what the reviewer needs to know. "Pending Review" said the same thing in the
 * language of the workflow engine rather than of the reviewer.
 */
export const INTELLIGENCE_STATUS_LABELS: Record<
  IntelligenceReviewStatus,
  string
> = {
  PENDING: "Needs review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DISMISSED: "Dismissed",
  STALE: "Stale",
};

/**
 * Status filter options.
 *
 * The trailing combined option is the outstanding-work view: both APIs accept a
 * comma-separated status list, and "needs review or stale" is what a reviewer
 * actually wants when they ask "what still needs me?" — a stale finding awaits a
 * decision on evidence that moved, so leaving it out would hide real work.
 */
export const INTELLIGENCE_STATUS_FILTER_OPTIONS: ReviewFilterOption[] = [
  ...INTELLIGENCE_REVIEW_STATUSES.map((status) => ({
    value: status,
    label: INTELLIGENCE_STATUS_LABELS[status],
  })),
  { value: "PENDING,STALE", label: "Needs review + stale" },
];

/** Whether a status is one of the shared lifecycle statuses. */
export function isIntelligenceReviewStatus(
  status: string,
): status is IntelligenceReviewStatus {
  return (INTELLIGENCE_REVIEW_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** The confidence bands every intelligence finding shares. */
export const INTELLIGENCE_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

export type IntelligenceConfidenceLevel =
  (typeof INTELLIGENCE_CONFIDENCE_LEVELS)[number];

/**
 * Confidence filter options.
 *
 * Labelled "<band> confidence" rather than the bare band so the control is
 * self-describing when read on its own (a screenshot, a screen reader), and
 * identically on all three surfaces.
 */
export const INTELLIGENCE_CONFIDENCE_FILTER_OPTIONS: ReviewFilterOption[] =
  INTELLIGENCE_CONFIDENCE_LEVELS.map((level) => ({
    value: level,
    label: `${level.charAt(0)}${level.slice(1).toLowerCase()} confidence`,
  }));

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Converts the `ALL` sentinel into an omitted query parameter.
 *
 * `ALL` is a UI concept: sending it would make the API validate an unknown status
 * and reject the request, so it never leaves this function.
 */
export function filterValueToParam(
  value: string | undefined,
): string | undefined {
  if (!value || value === ALL_FILTER_VALUE) return undefined;
  return value;
}

/**
 * Whether a status matches a filter value.
 *
 * Handles the comma-separated form the APIs accept, so the combined
 * "Needs review + stale" option works without the caller splitting it.
 */
export function matchesStatusFilter(
  status: string | null | undefined,
  filterValue: string,
): boolean {
  const param = filterValueToParam(filterValue);
  if (!param) return true;
  if (!status) return false;
  return param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(status);
}

/** Whether a confidence band matches a filter value. */
export function matchesConfidenceFilter(
  level: string | null | undefined,
  filterValue: string,
): boolean {
  const param = filterValueToParam(filterValue);
  if (!param) return true;
  return level === param;
}
