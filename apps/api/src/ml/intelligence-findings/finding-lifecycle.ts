/**
 * Review lifecycle primitives shared by every intelligence findings queue.
 *
 * These are the rules that decide whether a reviewer may act on a finding, and
 * how that decision is recorded in `ai_suggestion_feedback`. They are
 * subject-neutral: they operate on status and decision strings only, and know
 * nothing about components, attributes, or what a finding is about.
 *
 * Extracted from the Component Intelligence review queue, which had accumulated
 * the only implementation. The attribute findings queue needs the same rules, and
 * two copies of "what may a reviewer do to a stale finding" would eventually
 * disagree.
 */

/** Lifecycle states of a persisted intelligence finding. */
export const INTELLIGENCE_FINDING_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DISMISSED',
  'STALE',
] as const;

export type IntelligenceFindingStatus =
  (typeof INTELLIGENCE_FINDING_STATUSES)[number];

/** Decisions a reviewer may record. STALE is a system state, never a decision. */
export const INTELLIGENCE_FINDING_DECISIONS = [
  'ACCEPTED',
  'REJECTED',
  'DISMISSED',
] as const;

export type IntelligenceFindingDecision =
  (typeof INTELLIGENCE_FINDING_DECISIONS)[number];

/**
 * `ai_suggestion_feedback` only models ACCEPTED | REJECTED | EDITED.
 *
 * This is the established feedback vocabulary of the whole application, not a
 * review-queue detail, so findings map onto it instead of widening it.
 */
export const INTELLIGENCE_FEEDBACK_ACTIONS = [
  'ACCEPTED',
  'REJECTED',
  'EDITED',
] as const;

export type IntelligenceFeedbackAction =
  (typeof INTELLIGENCE_FEEDBACK_ACTIONS)[number];

/**
 * Statuses from which a given decision is permitted.
 *
 * ACCEPTED is intentionally impossible from STALE: accepting an outdated
 * suggestion would write values that no longer describe the current record.
 * Reviewers must re-run analysis to obtain a fresh PENDING finding.
 *
 * Terminal states (`ACCEPTED`, `REJECTED`, `DISMISSED`) accept no further
 * decision, so a reviewer cannot silently overwrite an earlier one.
 */
const DECISION_TRANSITIONS: Record<
  IntelligenceFindingStatus,
  readonly IntelligenceFindingDecision[]
> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'DISMISSED'],
  STALE: ['REJECTED', 'DISMISSED'],
  ACCEPTED: [],
  REJECTED: [],
  DISMISSED: [],
};

export function canDecide(
  status: IntelligenceFindingStatus,
  decision: IntelligenceFindingDecision,
): boolean {
  return DECISION_TRANSITIONS[status].includes(decision);
}

/** Statuses a guarded decision update must match for the decision to apply. */
export function decidableStatusesFor(
  decision: IntelligenceFindingDecision,
): IntelligenceFindingStatus[] {
  return INTELLIGENCE_FINDING_STATUSES.filter((status) =>
    canDecide(status, decision),
  );
}

/**
 * Maps a review decision onto the feedback ledger's action vocabulary.
 *
 * Dismissal is recorded as a REJECTED action carrying a DISMISSED decision in
 * its metadata, so the queue lifecycle stays distinguishable without inventing
 * a feedback action the rest of the system does not understand.
 *
 * An acceptance that carries the reviewer's own final value is recorded as
 * EDITED, because the value the model proposed is not the value that was kept.
 */
export function mapDecisionToFeedbackAction(
  decision: IntelligenceFindingDecision,
  hasReviewerFinalValue: boolean,
): IntelligenceFeedbackAction {
  if (decision !== 'ACCEPTED') return 'REJECTED';
  return hasReviewerFinalValue ? 'EDITED' : 'ACCEPTED';
}
