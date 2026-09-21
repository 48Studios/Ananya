import * as crypto from 'crypto';

/**
 * Canonical JSON serialization and hashing for intelligence finding
 * fingerprints.
 *
 * Subject-neutral by design: this module knows nothing about components,
 * attributes, or any other review domain. It exists so every findings table
 * derives stable identities through exactly one implementation — a second
 * hashing strategy would let two producers disagree about whether two findings
 * are "the same finding", which is what the queue's idempotency depends on.
 */

/**
 * Deterministic JSON serialization used for fingerprinting: object keys are
 * sorted recursively so logically identical payloads hash identically.
 *
 * Normalization rules, all of which exist so that a re-computed fingerprint
 * cannot drift for reasons that are not a state change:
 *
 *  - `undefined` and `null` both serialize to `null`
 *  - `Date` serializes to its ISO string
 *  - non-finite numbers serialize to `null` (JSON has no representation for
 *    them, and `NaN` in a payload must not produce different hashes)
 *  - functions and symbols serialize to `null`
 *  - array order is preserved (it is meaningful), object key order is not
 *  - circular references are refused rather than hashed
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStringify(value, new WeakSet<object>()));
}

function normalizeForStringify(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'function' || typeof value === 'symbol') return null;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) {
    throw new Error('Cannot fingerprint a circular value');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const list = value.map((item) => normalizeForStringify(item, seen));
    seen.delete(value);
    return list;
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = normalizeForStringify(record[key], seen);
  }
  seen.delete(value);
  return sorted;
}

/**
 * Stable identity for a finding condition: SHA-256 over the canonical JSON of
 * the payload.
 *
 * Callers decide what the payload contains. The contract every caller must
 * honour is that the payload represents the *expected state* a reviewer's
 * decision is made against — the subject, the state the finding describes, the
 * proposed state, and the intelligence version — and nothing volatile. Timestamps,
 * reviewer identity, generated row ids and re-computed counters must never be
 * included, or re-running the same analysis would create a new finding instead
 * of refreshing the existing one.
 */
export function buildIntelligenceFingerprint(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');
}

/**
 * Canonical ordering for a subject pair.
 *
 * Relationship findings (`A ≍ B`) belong to neither side exclusively, so the
 * pair — not the order it was discovered in — is the identity. Sorting the pair
 * before fingerprinting is what prevents an analyzer that merely lists the two
 * sides in a different order from creating a mirrored second finding.
 *
 * Ordering is by id so it is deterministic across runs and processes. The caller
 * still decides which side is *presented* as canonical; that choice belongs in
 * the suggested state, not in the subject.
 */
export function canonicalizePair<T>(first: T, second: T): [T, T] {
  return stableStringify(first) <= stableStringify(second)
    ? [first, second]
    : [second, first];
}
