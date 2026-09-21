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

/**
 * Bounded apply transactions.
 *
 * Also subject-neutral: the mechanism is "set transaction-local lock and
 * statement timeouts, and recognise the two SQLSTATEs that mean the database
 * refused to wait". Each apply path declares its own scope (environment
 * variables, defaults, error class) on top of it.
 */
export {
  TIMEOUT_SQLSTATE_CODES,
  applyTransactionTimeouts,
  describeApplyTimeout,
  isTimeoutSqlState,
  readSqlState,
  resolveApplyTimeouts,
  type ApplyTimeoutConfig,
  type ApplyTimeoutDescriptor,
  type ApplyTimeoutKind,
  type ApplyTimeoutScope,
} from './apply-timeout';
