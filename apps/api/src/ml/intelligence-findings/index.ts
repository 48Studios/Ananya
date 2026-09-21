/**
 * Shared intelligence-review primitives.
 *
 * Only genuinely subject-neutral review-workflow mechanisms live here: canonical
 * JSON serialization + SHA-256 fingerprinting, and the status/decision/feedback
 * rules. Everything subject-specific — validation of a subject, staleness
 * detection, projections, apply rules, locking — stays in the domain that owns it.
 *
 * This is deliberately not a generic findings framework: there is no base table,
 * no polymorphic subject model, and no shared service that both domains must
 * inherit. Each domain keeps its own table, DTOs, repository and service, and
 * imports these rules so they cannot drift.
 */
export {
  buildIntelligenceFingerprint,
  canonicalizePair,
  stableStringify,
} from './finding-fingerprint';

export {
  INTELLIGENCE_FEEDBACK_ACTIONS,
  INTELLIGENCE_FINDING_DECISIONS,
  INTELLIGENCE_FINDING_STATUSES,
  canDecide,
  decidableStatusesFor,
  mapDecisionToFeedbackAction,
  type IntelligenceFeedbackAction,
  type IntelligenceFindingDecision,
  type IntelligenceFindingStatus,
} from './finding-lifecycle';
