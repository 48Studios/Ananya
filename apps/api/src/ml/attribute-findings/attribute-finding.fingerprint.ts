import { buildIntelligenceFingerprint } from '../intelligence-findings';
import type { AttributeFindingSubject } from './attribute-finding.dtos';

/**
 * Deterministic identity for an Attribute Intelligence finding.
 *
 * The fingerprint represents the *expected state*: the subject the finding is
 * about, the state it observed, the state it proposes, and the intelligence
 * version that produced it. A reviewer's decision therefore applies to exactly
 * one revision of exactly one condition — if any of those change, a new
 * fingerprint is produced and the previous finding is retired as stale rather
 * than silently rewritten underneath a decision someone already made.
 *
 * What must NOT be in the payload, and why:
 *
 *  - timestamps — re-running the same analysis would create a new finding every
 *    time instead of refreshing the existing one;
 *  - reviewer identity or decision state — those are the review workflow's, not
 *    the condition's;
 *  - generated row ids — a finding id is not subject identity;
 *  - re-computed counters (usage totals, component counts) — they move for
 *    reasons unrelated to the condition, so they belong in `currentState` as
 *    evidence, not in the identity. A counter that *does* decide applicability
 *    (an "unused" attribute) must be reduced to a stable band.
 *
 * Hashing itself (canonical JSON + SHA-256) is shared with the component queue;
 * only the subject payload below is attribute-specific.
 */

export interface AttributeFindingFingerprintInput {
  issueType: string;
  subject: AttributeFindingSubject;
  /** The authoritative state the finding was generated against. */
  currentState?: unknown;
  /** The state the finding proposes. */
  suggestedState?: unknown;
  /** Configuration field the finding targets, when it targets a single field. */
  field?: string | null;
  intelligenceVersion?: string | null;
}

/** Narrows a subject value to a non-empty, trimmed string. */
function readIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a canonical code for identity purposes.
 *
 * Attribute codes are stored normalized (`lower_snake`) by the domain, but a
 * suggestion for an attribute that does not exist yet is produced from a
 * display name, so the same code could otherwise be presented as `Voltage
 * Rating`, `voltage rating` and `voltage_rating` and produce three findings.
 */
function readCanonicalCode(value: unknown): string | null {
  const raw = readIdentifier(value);
  if (!raw) return null;
  return raw.toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Canonical subject ordering for a relationship finding.
 *
 * A relationship finding (`Attribute A ≍ Attribute B`) belongs to neither side
 * exclusively: the pair *is* the identity. Sorting the pair before hashing is
 * what stops an analyzer that merely lists the two attributes in a different
 * order from creating a mirrored second finding for one condition.
 *
 * Ordering is by id (then code, for subjects that are not persisted yet) so it is
 * deterministic across processes. Which side is *presented* as canonical is a
 * suggested-state concern, not a subject one.
 */
export function normalizeAttributeFindingSubject(
  subject: AttributeFindingSubject,
): Record<string, string | null> {
  const attributeDefinitionId = readIdentifier(subject.attributeDefinitionId);
  const relatedAttributeDefinitionId = readIdentifier(
    subject.relatedAttributeDefinitionId,
  );

  const normalized: Record<string, string | null> = {
    attributeDefinitionId,
    relatedAttributeDefinitionId,
    attributeCode: readCanonicalCode(subject.attributeCode),
    categoryId: readIdentifier(subject.categoryId),
    categoryCode: readCanonicalCode(subject.categoryCode),
    optionId: readIdentifier(subject.optionId),
    optionCode: readCanonicalCode(subject.optionCode),
  };

  if (attributeDefinitionId && relatedAttributeDefinitionId) {
    const swap = attributeDefinitionId > relatedAttributeDefinitionId;
    normalized.attributeDefinitionId = swap
      ? relatedAttributeDefinitionId
      : attributeDefinitionId;
    normalized.relatedAttributeDefinitionId = swap
      ? attributeDefinitionId
      : relatedAttributeDefinitionId;
  }

  return normalized;
}

/**
 * Stable identity for an Attribute Intelligence finding condition.
 *
 * Identical analysis results map to the same fingerprint, so re-running an audit
 * refreshes the existing finding instead of duplicating it. Any material change —
 * a different subject, a different observed state, a different proposal, or a new
 * intelligence version — produces a different fingerprint and therefore a new
 * finding, leaving the previous one to be reconciled as stale.
 *
 * The subject is normalized (pair-ordered, codes canonicalized) before hashing;
 * the state payloads are hashed exactly as supplied, because the producer is the
 * authority on what it observed.
 */
export function buildAttributeFindingFingerprint(
  input: AttributeFindingFingerprintInput,
): string {
  return buildIntelligenceFingerprint({
    issueType: input.issueType,
    field: input.field ?? null,
    subject: normalizeAttributeFindingSubject(input.subject),
    currentState: input.currentState ?? null,
    suggestedState: input.suggestedState ?? null,
    intelligenceVersion: input.intelligenceVersion ?? null,
  });
}
