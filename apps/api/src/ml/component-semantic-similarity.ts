import type {
  ComponentIdentityAttributes,
  ManufacturerIdentityRelation,
} from './component-duplicate-intelligence';

/**
 * Bounded semantic / lexical duplicate similarity (Pass 5B).
 *
 * This module is deterministic, CPU-only and framework-free. It adds a SECOND
 * duplicate layer on top of the Pass 5A deterministic rules:
 *
 *  - Pass 5A answers "is this provably the same part?" (MPN / name identity).
 *  - Pass 5B answers "does this look like the same part?" using lexical
 *    similarity over identity-bearing tokens, with hard guards for
 *    manufacturer, category, package and physical values.
 *
 * Everything here is explainable: every accepted candidate carries the exact
 * signals and penalties that produced its score. No embeddings, no ML service,
 * no external calls, no randomness.
 *
 * The module never touches component data. It only decides which pairs deserve a
 * POTENTIAL_DUPLICATE review finding.
 */

// ---------------------------------------------------------------------------
// Limits (candidate bounding)
// ---------------------------------------------------------------------------

/**
 * Maximum number of semantic candidates considered for one component. The cap is
 * applied to a deterministically ranked list, so repeated audits keep the same
 * candidates.
 */
export const MAX_SEMANTIC_CANDIDATES_PER_COMPONENT = 25;

/**
 * Maximum number of semantic findings produced by one audit. The deterministic
 * duplicate write cap ({@link MAX_DUPLICATE_FINDINGS_PER_AUDIT}) still applies on
 * top of this as the final safety layer.
 */
export const MAX_SEMANTIC_FINDINGS_PER_AUDIT = 200;

/**
 * A token that occurs in more than this many catalog rows is treated as
 * *non-selective*. Non-selective tokens still block (dropping them would lose
 * recall), but partners whose overlap includes a selective token are ranked
 * ahead of partners that only share a common one.
 */
export const MAX_SEMANTIC_TOKEN_FANOUT = 40;

/**
 * Upper bound on catalog rows transferred for semantic candidate retrieval in a
 * single audit. Deterministic ordering, reported when reached.
 */
export const MAX_SEMANTIC_CANDIDATE_ROWS = 2000;

/**
 * Upper bound on distinct blocking tokens/prefixes/families sent to the
 * database in one audit. Keeps the retrieval query text bounded.
 */
export const MAX_SEMANTIC_BLOCKING_KEYS = 96;

/** Length of the name prefix used as an identifier-like blocking key. */
export const NAME_PREFIX_BLOCK_LENGTH = 6;

/**
 * Minimum normalized MPN length for MPN-family blocking. Short part numbers are
 * excluded because a short shared prefix carries no family information.
 */
export const MPN_FAMILY_MIN_LENGTH = 10;

/** Characters of a normalized MPN used as its family key. */
export const MPN_FAMILY_PREFIX_LENGTH = 6;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Minimum score for a semantic candidate to become a review finding.
 * Deliberately conservative: the queue surfaces candidates, it does not flood.
 */
export const SEMANTIC_MIN_SCORE = 0.55;

/**
 * Minimum score when the two records claim *different* manufacturer identities.
 * "Substantially stronger evidence" rather than a silent hard reject, so a
 * cross-manufacturer equivalent part can still surface.
 */
export const SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT = 0.65;

/** Score at which a candidate may be reported as HIGH confidence. */
export const SEMANTIC_HIGH_SCORE = 0.8;

/** Name similarity required before a candidate is scored at all. */
export const SEMANTIC_MIN_NAME_SIMILARITY = 0.34;

/** Name similarity required for HIGH confidence. */
export const SEMANTIC_HIGH_NAME_SIMILARITY = 0.5;

// ---------------------------------------------------------------------------
// Scoring model
// ---------------------------------------------------------------------------

/**
 * Transparent scoring weights. The score is the sum of the positive signals
 * minus the penalties, clamped to [0, 1]. Every weight is documented here rather
 * than hidden in a formula, and every applied weight is reported on the finding.
 *
 * Manufacturer identity and name/token agreement dominate, because they are the
 * signals that actually describe a part. Supporting signals (category, package,
 * structured attributes, MPN family) can corroborate but never carry a candidate
 * on their own: no single supporting weight reaches the minimum score.
 */
export const SEMANTIC_SCORING_WEIGHTS = {
  /** Same resolved manufacturer identity (aliases included). */
  manufacturerSame: 0.22,
  /** Both records classified under the exact same category node. */
  categorySame: 0.13,
  /** One category is an ancestor/descendant of the other. */
  categoryRelated: 0.09,
  /** Multiplied by the identity-token Jaccard similarity. */
  nameSimilarity: 0.3,
  /** At least one shared technical value token agrees (10 kΩ == 10 kΩ). */
  technicalValuesAgree: 0.15,
  /** Both records carry the same package/footprint. */
  packageAgrees: 0.08,
  /** At least one structured identity attribute matches exactly. */
  attributesAgree: 0.12,
  /** Shared MPN family prefix. Supporting evidence only - never identity. */
  mpnFamily: 0.05,
} as const;

/**
 * Penalties. Missing data is never penalised - only a *recorded* disagreement is.
 */
export const SEMANTIC_SCORING_PENALTIES = {
  /**
   * The two records claim different manufacturer identities. Deliberately small
   * because the higher threshold
   * ({@link SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT}) already expresses the
   * "substantially stronger evidence" requirement; a large penalty would make
   * cross-manufacturer matches impossible rather than rare.
   */
  manufacturerConflict: 0.1,
  /**
   * Both names carry a package token and the tokens differ. A penalty rather than
   * a reject because some manufacturer parts exist in several package variants.
   * A conflicting `package` *attribute* is a hard reject instead.
   */
  packageTokenConflict: 0.15,
} as const;

/** Minimum number of independent strong signals required for HIGH confidence. */
export const SEMANTIC_HIGH_STRONG_SIGNALS = 2;

/** Canonical reason codes for rejected semantic candidates (instrumentation). */
export type SemanticRejectionReason =
  | 'GENERIC_NAME'
  | 'INCOMPATIBLE_CATEGORY'
  | 'ATTRIBUTE_CONFLICT'
  | 'TECHNICAL_VALUE_CONFLICT'
  | 'NO_SHARED_IDENTITY_TOKEN'
  | 'PACKAGE_ONLY_OVERLAP'
  | 'DIFFERENT_MPNS_WITHOUT_TECHNICAL_MATCH'
  | 'INSUFFICIENT_SIMILARITY'
  | 'BELOW_THRESHOLD';

// ---------------------------------------------------------------------------
// Value tokens
// ---------------------------------------------------------------------------

interface ValueUnitDefinition {
  /** Canonical base unit used to compare magnitudes. */
  unit: string;
  /** Display unit for evidence text. */
  label: string;
  /** Multiplier to the base unit. */
  factor: number;
}

/**
 * Technical units recognised in component names, mapped to their base unit.
 *
 * Only `<amount><unit>` shaped tokens qualify, which keeps manufacturer part
 * numbers safe: `1N4148`, `2N2222` and `ATmega328P` never match because they do
 * not consist of an amount followed by letters only.
 */
export const SEMANTIC_VALUE_UNITS: ReadonlyMap<string, ValueUnitDefinition> =
  new Map<string, ValueUnitDefinition>([
    // Resistance -> ohm
    ['ohm', { unit: 'ohm', label: 'ohm', factor: 1 }],
    ['kohm', { unit: 'ohm', label: 'ohm', factor: 1e3 }],
    ['mohm', { unit: 'ohm', label: 'ohm', factor: 1e6 }],
    // Capacitance -> farad
    ['f', { unit: 'F', label: 'F', factor: 1 }],
    ['mf', { unit: 'F', label: 'F', factor: 1e-3 }],
    ['uf', { unit: 'F', label: 'F', factor: 1e-6 }],
    ['nf', { unit: 'F', label: 'F', factor: 1e-9 }],
    ['pf', { unit: 'F', label: 'F', factor: 1e-12 }],
    // Inductance -> henry
    ['h', { unit: 'H', label: 'H', factor: 1 }],
    ['mh', { unit: 'H', label: 'H', factor: 1e-3 }],
    ['uh', { unit: 'H', label: 'H', factor: 1e-6 }],
    ['nh', { unit: 'H', label: 'H', factor: 1e-9 }],
    // Voltage -> volt
    ['v', { unit: 'V', label: 'V', factor: 1 }],
    ['mv', { unit: 'V', label: 'V', factor: 1e-3 }],
    ['kv', { unit: 'V', label: 'V', factor: 1e3 }],
    // Current -> ampere
    ['a', { unit: 'A', label: 'A', factor: 1 }],
    ['ma', { unit: 'A', label: 'A', factor: 1e-3 }],
    ['ua', { unit: 'A', label: 'A', factor: 1e-6 }],
    // Power -> watt
    ['w', { unit: 'W', label: 'W', factor: 1 }],
    ['mw', { unit: 'W', label: 'W', factor: 1e-3 }],
    ['kw', { unit: 'W', label: 'W', factor: 1e3 }],
    // Frequency -> hertz
    ['hz', { unit: 'Hz', label: 'Hz', factor: 1 }],
    ['khz', { unit: 'Hz', label: 'Hz', factor: 1e3 }],
    ['mhz', { unit: 'Hz', label: 'Hz', factor: 1e6 }],
    ['ghz', { unit: 'Hz', label: 'Hz', factor: 1e9 }],
    // Tolerance -> percent
    ['pct', { unit: '%', label: '%', factor: 1 }],
  ]);

/** `<amount><unit letters>` - the only shape accepted as a technical value. */
const VALUE_TOKEN_PATTERN = /^(\d+(?:\.\d+)?)([a-z]+)$/;

/** A token that may combine with a following unit word (`10k` + `ohm`). */
const MERGEABLE_AMOUNT_PATTERN = /^\d+(?:\.\d+)?[a-z]?$/;

/** Relative tolerance when comparing two magnitudes of the same base unit. */
const VALUE_COMPARISON_TOLERANCE = 1e-6;

export interface ParsedValueToken {
  unit: string;
  label: string;
  magnitude: number;
  /** Raw token text, used in evidence. */
  raw: string;
  /** Amount portion of the token, e.g. `10k` in `10kohm`. */
  amountText: string;
  /** Unit letters matched, e.g. `ohm` in `10kohm`. */
  unitLetters: string;
}

/**
 * Parses a technical value token such as `10kohm`, `100nf`, `25v`, `0.1uf`.
 * Returns null for anything that is not an amount followed by known unit
 * letters, which is what keeps part numbers out of the value model.
 */
export function parseValueToken(token: string): ParsedValueToken | null {
  const match = token.match(VALUE_TOKEN_PATTERN);
  if (!match) return null;

  const amount = Number(match[1]);
  const unitLetters = match[2] ?? '';
  const definition = SEMANTIC_VALUE_UNITS.get(unitLetters);
  if (!definition || !Number.isFinite(amount)) return null;

  // Rounded to 12 significant digits: `100 * 1e-9` must not become
  // `1.0000000000000001e-7`, because the magnitude reaches fingerprints and
  // evidence text, both of which must be byte-stable.
  const magnitude = Number((amount * definition.factor).toPrecision(12));

  return {
    unit: definition.unit,
    label: definition.label,
    magnitude,
    raw: token,
    amountText: token.slice(0, token.length - unitLetters.length),
    unitLetters,
  };
}

/** Renders a base-unit magnitude for evidence text (`10000 ohm` -> `10 kohm`). */
export function formatBaseMagnitude(magnitude: number, unit: string): string {
  const scales: Array<[number, string]> = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  const absolute = Math.abs(magnitude);

  for (const [factor, prefix] of scales) {
    if (absolute >= factor || factor === 1e-12) {
      const scaled = magnitude / factor;
      const text = Number.isInteger(scaled)
        ? String(scaled)
        : scaled.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
      return `${text} ${prefix}${unit}`;
    }
  }

  return `${magnitude} ${unit}`;
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/** Splits on anything that is not alphanumeric, keeping decimal points. */
const TOKEN_SPLIT_PATTERN = /[^a-z0-9.]+/;

/** Lowercases and spells out unit symbols so `10KΩ` and `10K Ohm` agree. */
function prepareName(name?: string | null): string {
  return (name ?? '')
    .replace(/[Ωω]/g, 'ohm')
    .replace(/[µμ]/g, 'u')
    .toLowerCase()
    .replace(/°c/g, 'degc');
}

/** Raw tokens: split only, no amount/unit merging. */
function rawNameTokens(name?: string | null): string[] {
  return prepareName(name)
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter((token) => token.length > 0);
}

/**
 * Tokenizes a component name for semantic comparison.
 *
 * Handles the formatting differences that must not matter (case, separators,
 * `Ω`/`ohm`, `µ`/`u`) and merges an amount with a following unit word, so
 * `10KΩ`, `10K Ohm` and `10Kohm` all produce the same `10kohm` token. Technical
 * values are never dropped: `10kohm` and `100kohm` stay distinct tokens and are
 * additionally compared numerically by {@link compareValueTokens}.
 */
export function semanticNameTokens(name?: string | null): string[] {
  const raw = rawNameTokens(name);

  const tokens: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index] as string;
    const next = raw[index + 1];
    if (
      next &&
      MERGEABLE_AMOUNT_PATTERN.test(token) &&
      parseValueToken(`${token}${next}`)
    ) {
      tokens.push(`${token}${next}`);
      index += 1;
      continue;
    }
    tokens.push(token);
  }

  return tokens;
}

/** Tokens that carry no identity on their own. */
export interface SemanticTokenVocabulary {
  genericTerms: Set<string>;
  packagePatterns: readonly string[];
}

/** Identity profile of one component name. */
export interface SemanticNameProfile {
  /** Every merged token, used for overlap accounting. */
  tokens: Set<string>;
  /**
   * Identifier-like tokens: not generic, not a bare number, not a package code
   * and not a technical value. `lm358`, `atmega328p`, `jst` land here.
   */
  identityTokens: Set<string>;
  /** Package/footprint codes found in the name (`0805`, `sot23`). */
  packageTokens: Set<string>;
  /** Technical values keyed by base unit -> magnitudes found in the name. */
  valueTokens: Map<string, number[]>;
  /** Raw value token text per base unit, for evidence. */
  valueTokenLabels: Map<string, string[]>;
  /** Merged value tokens (`10kohm`), so they can take part in name similarity. */
  valueTokenKeys: Set<string>;
  /**
   * True when the name carries at least one non-generic token - an identifier, a
   * technical value or a package code. Names made only of generic words
   * (`Resistor`, `SMD Connector`) are never identity evidence.
   */
  identityBearing: boolean;
}

function isPackageToken(
  token: string,
  packagePatterns: readonly string[],
): boolean {
  if (/^(0[2468]0[1235]|1[0-9]{3}|2[0-9]{3})$/.test(token.toUpperCase())) {
    return true;
  }
  const upper = token.toUpperCase();
  return packagePatterns.some(
    (pattern) =>
      pattern.toUpperCase().replace(/[^A-Z0-9]/g, '') ===
      upper.replace(/[^A-Z0-9]/g, ''),
  );
}

function isGenericToken(
  token: string,
  vocabulary: SemanticTokenVocabulary,
): boolean {
  if (vocabulary.genericTerms.has(token)) return true;
  const singular =
    token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
  return vocabulary.genericTerms.has(singular);
}

/**
 * Builds the identity profile of a component name.
 *
 * Technical values and package codes are extracted separately from
 * identity tokens so the scorer can treat them as distinct, weighted signals.
 */
export function buildSemanticNameProfile(
  name: string | null | undefined,
  vocabulary: SemanticTokenVocabulary,
): SemanticNameProfile {
  const tokens = new Set<string>();
  const identityTokens = new Set<string>();
  const packageTokens = new Set<string>();
  const valueTokens = new Map<string, number[]>();
  const valueTokenLabels = new Map<string, string[]>();
  const valueTokenKeys = new Set<string>();

  for (const token of semanticNameTokens(name)) {
    tokens.add(token);

    if (isPackageToken(token, vocabulary.packagePatterns)) {
      packageTokens.add(token.toUpperCase());
      continue;
    }

    const value = parseValueToken(token);
    if (value) {
      const magnitudes = valueTokens.get(value.unit) ?? [];
      if (!magnitudes.includes(value.magnitude)) {
        magnitudes.push(value.magnitude);
      }
      valueTokens.set(value.unit, magnitudes);

      const labels = valueTokenLabels.get(value.unit) ?? [];
      const label = formatBaseMagnitude(value.magnitude, value.label);
      if (!labels.includes(label)) labels.push(label);
      valueTokenLabels.set(value.unit, labels);

      valueTokenKeys.add(token);
      continue;
    }

    if (token.length < 2) continue;
    if (!/[a-z]/.test(token)) continue;
    if (isGenericToken(token, vocabulary)) continue;
    identityTokens.add(token);
  }

  return {
    tokens,
    identityTokens,
    packageTokens,
    valueTokens,
    valueTokenLabels,
    valueTokenKeys,
    identityBearing:
      identityTokens.size > 0 || valueTokens.size > 0 || packageTokens.size > 0,
  };
}

/**
 * Blocking tokens for a component name: the deterministic keys used to retrieve
 * semantic candidates without scanning the whole catalog pairwise.
 *
 * Keys are taken from the *merged* token list, so every spelling of a technical
 * value collides: `10KΩ`, `10Kohm` and `10K Ohm` all produce the token `10kohm`.
 * Package/footprint codes (`0805`, `0603`) are included as well - they are
 * selective enough to be useful blocks even though they are never sufficient on
 * their own.
 *
 * Generic words, bare numbers and single characters are dropped: they are not
 * selective enough to be useful blocks. The result is sorted so the generated
 * retrieval query is deterministic.
 */
export function semanticBlockingTokens(
  name: string | null | undefined,
  vocabulary: SemanticTokenVocabulary,
): string[] {
  const tokens = new Set<string>();

  for (const token of semanticNameTokens(name)) {
    if (token.length < 2) continue;
    // Package codes are also part of the generic name vocabulary (they are not
    // identity on their own), but they remain useful *blocks*. The check runs
    // before the bare-number rule because footprint codes are all digits.
    if (isPackageToken(token, vocabulary.packagePatterns)) {
      tokens.add(token.toUpperCase());
      continue;
    }
    if (/^\d+$/.test(token)) continue;
    if (isGenericToken(token, vocabulary)) continue;
    tokens.add(token);
  }

  return [...tokens].sort();
}

/** Jaccard similarity between two token sets. */
export function jaccardSimilarity(
  first: ReadonlySet<string>,
  second: ReadonlySet<string>,
): number {
  if (first.size === 0 && second.size === 0) return 0;
  let shared = 0;
  for (const token of first) {
    if (second.has(token)) shared += 1;
  }
  const union = first.size + second.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Significant tokens: identifier-like tokens plus package codes and technical
 * values. Generic words (`resistor`, `smd`) are deliberately excluded so name
 * similarity measures technical agreement rather than vocabulary overlap.
 */
export function significantTokens(profile: SemanticNameProfile): Set<string> {
  const tokens = new Set(profile.identityTokens);
  for (const token of profile.packageTokens) tokens.add(token);
  for (const token of profile.valueTokenKeys) tokens.add(token);
  return tokens;
}

/**
 * Significant tokens shared by both profiles, sorted for deterministic output.
 */
export function sharedSignificantTokens(
  first: SemanticNameProfile,
  second: SemanticNameProfile,
): string[] {
  const firstTokens = significantTokens(first);
  const shared = new Set<string>();
  for (const token of significantTokens(second)) {
    if (firstTokens.has(token)) shared.add(token);
  }
  return [...shared].sort();
}

/**
 * True when the only shared tokens are package codes. Two components that merely
 * happen to be the same footprint are not candidates ("same package only" is
 * explicitly not enough).
 */
export function sharesOnlyPackageTokens(
  sharedTokens: readonly string[],
  first: SemanticNameProfile,
  second: SemanticNameProfile,
): boolean {
  if (sharedTokens.length === 0) return false;
  const packages = new Set([...first.packageTokens, ...second.packageTokens]);
  return sharedTokens.every((token) => packages.has(token));
}

/**
 * Compares the technical values of two profiles.
 *
 * A conflict requires the *same* base unit on both sides with no common
 * magnitude, so missing values are never treated as a difference. This is what
 * separates `10 kΩ` from `100 kΩ` and `1 µF` from `10 µF`.
 */
export interface ValueTokenComparison {
  conflicts: Array<{ unit: string; first: string; second: string }>;
  agreements: Array<{ unit: string; value: string }>;
}

export function compareValueTokens(
  first: SemanticNameProfile,
  second: SemanticNameProfile,
): ValueTokenComparison {
  const conflicts: Array<{ unit: string; first: string; second: string }> = [];
  const agreements: Array<{ unit: string; value: string }> = [];

  for (const [unit, firstMagnitudes] of first.valueTokens) {
    const secondMagnitudes = second.valueTokens.get(unit);
    if (!secondMagnitudes || secondMagnitudes.length === 0) continue;

    const matching = firstMagnitudes.find((magnitude) =>
      secondMagnitudes.some(
        (other) =>
          relativeDifference(magnitude, other) <= VALUE_COMPARISON_TOLERANCE,
      ),
    );

    const label = unit;
    if (matching === undefined) {
      conflicts.push({
        unit,
        first: (first.valueTokenLabels.get(unit) ?? []).join(' / '),
        second: (second.valueTokenLabels.get(unit) ?? []).join(' / '),
      });
      continue;
    }

    agreements.push({
      unit: label,
      value: (first.valueTokenLabels.get(unit) ?? []).join(' / '),
    });
  }

  return { conflicts, agreements };
}

function relativeDifference(first: number, second: number): number {
  const scale = Math.max(Math.abs(first), Math.abs(second));
  if (scale === 0) return 0;
  return Math.abs(first - second) / scale;
}

// ---------------------------------------------------------------------------
// MPN family
// ---------------------------------------------------------------------------

/**
 * Blocking/supporting key for a manufacturer part number family.
 *
 * Returns null when the part number is too short to carry family information.
 * A shared family is *supporting evidence only*: `RC0805FR0727RL` and
 * `RC0805FR0710RL` share a family but describe different parts, so the family
 * weight can never carry a candidate by itself.
 */
export function mpnFamilyKey(normalizedMpn?: string | null): string | null {
  if (!normalizedMpn) return null;
  if (normalizedMpn.length < MPN_FAMILY_MIN_LENGTH) return null;
  const prefix = normalizedMpn.slice(0, MPN_FAMILY_PREFIX_LENGTH);
  if (!/[A-Z]/.test(prefix) || !/\d/.test(prefix)) return null;
  return prefix;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** One explainable contribution to a candidate's score. */
export interface SemanticSignal {
  /** Stable machine code, also used as the evidence `source` suffix. */
  code: string;
  /** Human-readable summary shown to the reviewer. */
  label: string;
  /** Signed contribution to the score. */
  weight: number;
  /** Evidence text describing exactly what matched or conflicted. */
  detail: string;
  /** Existing evidence type understood by the review UI. */
  evidenceType: string;
  /** Existing evidence source tag. */
  evidenceSource: string;
}

export interface SemanticScoreInput {
  memberName: string;
  canonicalName: string;
  manufacturerRelation: ManufacturerIdentityRelation;
  memberManufacturerName: string | null;
  canonicalManufacturerName: string | null;
  categoryRelation: 'SAME' | 'RELATED' | 'INCOMPATIBLE' | 'UNKNOWN';
  memberCategoryName: string | null;
  canonicalCategoryName: string | null;
  memberProfile: SemanticNameProfile;
  canonicalProfile: SemanticNameProfile;
  memberAttributes?: ComponentIdentityAttributes;
  canonicalAttributes?: ComponentIdentityAttributes;
  memberMpn: string | null;
  canonicalMpn: string | null;
  /** Structured attributes that match exactly (from the Pass 5A comparison). */
  matchingAttributes: Array<{ code: string; label: string; display: string }>;
}

export interface SemanticScoreResult {
  accepted: boolean;
  rejectionReason: SemanticRejectionReason | null;
  /**
   * Score in [0, 1]. Rejections caused by a guard report 0; threshold rejections
   * report the score that was computed, so instrumentation can show how close a
   * candidate came without changing any decision.
   */
  score: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | null;
  nameSimilarity: number;
  sharedTokens: string[];
  signals: SemanticSignal[];
  penalties: SemanticSignal[];
  strongSignalCount: number;
}

/**
 * Scores one candidate pair.
 *
 * Order of evaluation is intentional: hard guards (which represent a *recorded*
 * contradiction) run before scoring, so no amount of lexical similarity can
 * overcome a conflicting technical value or an incompatible category.
 */
export function scoreSemanticCandidate(
  input: SemanticScoreInput,
): SemanticScoreResult {
  const signals: SemanticSignal[] = [];
  const penalties: SemanticSignal[] = [];

  const nameSimilarity = jaccardSimilarity(
    significantTokens(input.memberProfile),
    significantTokens(input.canonicalProfile),
  );
  const sharedTokens = sharedSignificantTokens(
    input.memberProfile,
    input.canonicalProfile,
  );

  const reject = (
    reason: SemanticRejectionReason,
    score = 0,
  ): SemanticScoreResult => ({
    accepted: false,
    rejectionReason: reason,
    score,
    confidenceLevel: null,
    nameSimilarity,
    sharedTokens,
    signals,
    penalties,
    strongSignalCount: 0,
  });

  // Guard 1: a name made only of generic words is never identity evidence.
  if (
    !input.memberProfile.identityBearing ||
    !input.canonicalProfile.identityBearing
  ) {
    return reject('GENERIC_NAME');
  }

  // Guard 2: clearly incompatible categories.
  if (input.categoryRelation === 'INCOMPATIBLE') {
    return reject('INCOMPATIBLE_CATEGORY');
  }

  // Guard 3: structured attribute conflict (strongest false-positive guard).
  const attributeConflicts = findConflictingAttributes(
    input.memberAttributes,
    input.canonicalAttributes,
  );
  if (attributeConflicts.length > 0) {
    return reject('ATTRIBUTE_CONFLICT');
  }

  // Guard 4: technical value conflict (10 kΩ vs 100 kΩ).
  const valueComparison = compareValueTokens(
    input.memberProfile,
    input.canonicalProfile,
  );
  if (valueComparison.conflicts.length > 0) {
    return reject('TECHNICAL_VALUE_CONFLICT');
  }

  // Guard 5: nothing shared at all - never a candidate.
  if (sharedTokens.length === 0) {
    return reject('NO_SHARED_IDENTITY_TOKEN');
  }

  // Guard 6: sharing only a footprint is not identity ("same package only").
  if (
    sharesOnlyPackageTokens(
      sharedTokens,
      input.memberProfile,
      input.canonicalProfile,
    )
  ) {
    return reject('PACKAGE_ONLY_OVERLAP');
  }

  // Guard 7: both records carry an authoritative part number and those part
  // numbers differ. That is *recorded* evidence of different parts, so lexical
  // similarity plus a shared MPN family is not enough: a technical corroboration
  // (matching values, structured attributes or package) is required. This is what
  // keeps `RC0805FR0727RL` from being reported as a duplicate of
  // `RC0805FR0710RL` merely because the prefix is shared.
  const mpnsDiffer =
    Boolean(input.memberMpn && input.canonicalMpn) &&
    input.memberMpn !== input.canonicalMpn;
  const matchingAttributeCount = input.matchingAttributes.length;
  const packageTokensMatch =
    input.memberProfile.packageTokens.size > 0 &&
    input.canonicalProfile.packageTokens.size > 0 &&
    [...input.memberProfile.packageTokens].some((token) =>
      input.canonicalProfile.packageTokens.has(token),
    );
  const hasTechnicalCorroboration =
    matchingAttributeCount > 0 ||
    valueComparison.agreements.length > 0 ||
    packageTokensMatch;

  if (mpnsDiffer && !hasTechnicalCorroboration) {
    return reject('DIFFERENT_MPNS_WITHOUT_TECHNICAL_MATCH');
  }

  // --- positive signals ---------------------------------------------------
  if (input.manufacturerRelation === 'SAME') {
    const name =
      input.memberManufacturerName ??
      input.canonicalManufacturerName ??
      'same identity';
    signals.push({
      code: 'MANUFACTURER_SAME',
      label: 'Same manufacturer',
      weight: SEMANTIC_SCORING_WEIGHTS.manufacturerSame,
      detail: `Both records resolve to the same manufacturer identity "${name}"`,
      evidenceType: 'exact_erp_match',
      evidenceSource: 'analyzer:duplicate_manufacturer',
    });
  }

  if (input.categoryRelation === 'SAME') {
    signals.push({
      code: 'CATEGORY_SAME',
      label: 'Same category',
      weight: SEMANTIC_SCORING_WEIGHTS.categorySame,
      detail: `Both records are classified under "${
        input.memberCategoryName ??
        input.canonicalCategoryName ??
        'the same category'
      }"`,
      evidenceType: 'hierarchy',
      evidenceSource: 'analyzer:duplicate_category',
    });
  } else if (input.categoryRelation === 'RELATED') {
    signals.push({
      code: 'CATEGORY_RELATED',
      label: 'Compatible categories',
      weight: SEMANTIC_SCORING_WEIGHTS.categoryRelated,
      detail: `Categories are related in the taxonomy ("${
        input.memberCategoryName ?? 'unknown'
      }" / "${input.canonicalCategoryName ?? 'unknown'}")`,
      evidenceType: 'hierarchy',
      evidenceSource: 'analyzer:duplicate_category',
    });
  }

  if (nameSimilarity > 0) {
    signals.push({
      code: 'NAME_SIMILARITY',
      label: 'Similar component name',
      weight: SEMANTIC_SCORING_WEIGHTS.nameSimilarity * nameSimilarity,
      detail: `${Math.round(nameSimilarity * 100)}% identity-token similarity (${
        sharedTokens.length
      } shared: ${sharedTokens.slice(0, 6).join(', ')})`,
      evidenceType: 'similarity',
      evidenceSource: 'analyzer:duplicate_similarity',
    });
  }

  if (valueComparison.agreements.length > 0) {
    signals.push({
      code: 'TECHNICAL_VALUES_AGREE',
      label: 'Matching technical values',
      weight: SEMANTIC_SCORING_WEIGHTS.technicalValuesAgree,
      detail: valueComparison.agreements
        .map((agreement) => `${agreement.unit}: ${agreement.value}`)
        .join(', '),
      evidenceType: 'datasheet_param',
      evidenceSource: 'analyzer:duplicate_attributes',
    });
  }

  const packageTokensConflict =
    input.memberProfile.packageTokens.size > 0 &&
    input.canonicalProfile.packageTokens.size > 0 &&
    !packageTokensMatch;

  if (packageTokensMatch) {
    signals.push({
      code: 'PACKAGE_AGREES',
      label: 'Same package',
      weight: SEMANTIC_SCORING_WEIGHTS.packageAgrees,
      detail: `Package matches (${[...input.memberProfile.packageTokens].join(', ')})`,
      evidenceType: 'datasheet_param',
      evidenceSource: 'analyzer:duplicate_attributes',
    });
  } else if (packageTokensConflict) {
    penalties.push({
      code: 'PACKAGE_CONFLICT',
      label: 'Different package',
      weight: -SEMANTIC_SCORING_PENALTIES.packageTokenConflict,
      detail: `Package differs (${[...input.memberProfile.packageTokens].join(
        ', ',
      )} vs ${[...input.canonicalProfile.packageTokens].join(', ')})`,
      evidenceType: 'anomaly',
      evidenceSource: 'analyzer:duplicate_conflict',
    });
  }

  if (input.matchingAttributes.length > 0) {
    signals.push({
      code: 'ATTRIBUTES_AGREE',
      label: 'Matching specifications',
      weight: SEMANTIC_SCORING_WEIGHTS.attributesAgree,
      detail: input.matchingAttributes
        .slice(0, 5)
        .map((attribute) => `${attribute.label}: ${attribute.display}`)
        .join(', '),
      evidenceType: 'datasheet_param',
      evidenceSource: 'analyzer:duplicate_attributes',
    });
  }

  const memberFamily = mpnFamilyKey(input.memberMpn);
  const canonicalFamily = mpnFamilyKey(input.canonicalMpn);
  const mpnFamilyMatches =
    memberFamily !== null && memberFamily === canonicalFamily;
  if (mpnFamilyMatches) {
    signals.push({
      code: 'MPN_FAMILY',
      label: 'Same manufacturer part family',
      weight: SEMANTIC_SCORING_WEIGHTS.mpnFamily,
      detail: `Part numbers share the manufacturer family "${memberFamily}" but differ (${input.memberMpn} vs ${input.canonicalMpn}); family agreement is supporting evidence only`,
      evidenceType: 'mpn_pattern',
      evidenceSource: 'analyzer:duplicate_mpn_family',
    });
  }

  if (input.manufacturerRelation === 'CONFLICT') {
    penalties.push({
      code: 'MANUFACTURER_CONFLICT',
      label: 'Different manufacturers',
      weight: -SEMANTIC_SCORING_PENALTIES.manufacturerConflict,
      detail: `Different manufacturers (${
        input.memberManufacturerName ?? 'unresolved'
      } vs ${
        input.canonicalManufacturerName ?? 'unresolved'
      }); substantially stronger evidence is required`,
      evidenceType: 'anomaly',
      evidenceSource: 'analyzer:duplicate_conflict',
    });
  }

  // --- structural requirements -------------------------------------------
  const hasCorroboration =
    matchingAttributeCount >= 2 ||
    valueComparison.agreements.length > 0 ||
    mpnFamilyMatches;
  if (nameSimilarity < SEMANTIC_MIN_NAME_SIMILARITY && !hasCorroboration) {
    return reject('INSUFFICIENT_SIMILARITY', nameSimilarity);
  }

  const rawScore =
    signals.reduce((total, signal) => total + signal.weight, 0) +
    penalties.reduce((total, penalty) => total + penalty.weight, 0);
  const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 1000) / 1000;

  const minimum =
    input.manufacturerRelation === 'CONFLICT'
      ? SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT
      : SEMANTIC_MIN_SCORE;
  if (score < minimum) return reject('BELOW_THRESHOLD', score);

  // --- confidence ---------------------------------------------------------
  const strongSignalCount = signals.filter(
    (signal) =>
      signal.code === 'TECHNICAL_VALUES_AGREE' ||
      signal.code === 'ATTRIBUTES_AGREE' ||
      signal.code === 'PACKAGE_AGREES' ||
      signal.code === 'MPN_FAMILY' ||
      signal.code === 'CATEGORY_SAME',
  ).length;

  const highConfidence =
    score >= SEMANTIC_HIGH_SCORE &&
    input.manufacturerRelation === 'SAME' &&
    nameSimilarity >= SEMANTIC_HIGH_NAME_SIMILARITY &&
    penalties.length === 0 &&
    strongSignalCount >= SEMANTIC_HIGH_STRONG_SIGNALS;

  return {
    accepted: true,
    rejectionReason: null,
    score,
    confidenceLevel: highConfidence ? 'HIGH' : 'MEDIUM',
    nameSimilarity,
    sharedTokens,
    signals,
    penalties,
    strongSignalCount,
  };
}

function findConflictingAttributes(
  first: ComponentIdentityAttributes | undefined,
  second: ComponentIdentityAttributes | undefined,
): Array<{ code: string; label: string; first: string; second: string }> {
  if (!first || !second) return [];
  const conflicts: Array<{
    code: string;
    label: string;
    first: string;
    second: string;
  }> = [];

  for (const [code, left] of first) {
    const right = second.get(code);
    if (!right) continue;
    if (left.comparable === null || right.comparable === null) continue;
    if (left.comparable === right.comparable) continue;
    conflicts.push({
      code,
      label: left.label || code,
      first: left.display || left.comparable,
      second: right.display || right.comparable,
    });
  }

  return conflicts.sort((left, right) => left.code.localeCompare(right.code));
}
