import { findUnit, type UnitRef } from './attribute-value-semantics';

/**
 * Scored attribute resolution for extracted datasheet specifications.
 *
 * Pass 3 resolved a property by asking "which definition does the shared
 * resolver return?" and treated any second definition whose code, name or alias
 * normalized to the same term as an ambiguity. That is correct but it cannot
 * explain itself and it cannot rank: a reviewer saw "ambiguous" with no
 * indication of which definition was the better fit or why.
 *
 * This module keeps the safety property (a term claimed by two definitions stays
 * ambiguous) and adds:
 *
 *  - **bounded linguistic normalisation**, so datasheet wording resolves against
 *    authoritative metadata rather than a hard-coded alias list: `Resistance
 *    Value`, `Rated Voltage`, `Maximum Operating Voltage` and `Nominal
 *    Resistance` reduce to the term the definition already declares;
 *  - **deterministic scoring with named signals**, so a resolution carries a
 *    confidence and human-readable reasons;
 *  - **ranked candidates**, so an ambiguity can be explained rather than just
 *    reported.
 *
 * Two rules keep it honest:
 *
 *  1. A definition only becomes a candidate when it makes an *authoritative
 *     claim* on the term (its code, name, alias, a bounded variant, or a Data
 *     Pack alias). Token overlap alone can rank candidates but never create one,
 *     which is what stops `thermal_resistance` from resolving to `resistance`.
 *  2. Two authoritative claims is always a human decision. Scoring never picks a
 *     winner between them, because nothing in the document distinguishes them.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The definition metadata matching is allowed to read.
 *
 * Structural, so the analysis layer can pass its own definition reference
 * without this module depending on it.
 */
export interface ResolvableAttributeDefinition {
  id: string;
  code: string;
  name: string;
  dataType: string;
  /** Declared dimension, e.g. `Resistance`. Used for unit compatibility. */
  unitCategory?: string | null;
  defaultUnit?: string | null;
  aliases?: readonly string[];
  isActive: boolean;
}

export interface AttributeResolutionContext {
  /**
   * Attribute codes the component's category expects, from the Data Pack
   * intelligence hints. Positive evidence: the term is a known property of this
   * kind of part.
   */
  expectedAttributeCodes?: readonly string[];
  /**
   * Attribute codes bound to the component's category in the ERP
   * (`category_attributes`). Positive evidence from configured data rather than
   * from a pack.
   */
  categoryAttributeCodes?: readonly string[];
  /**
   * Data Pack attribute aliases: `{ canonicalCode: [alias, ...] }`. A term listed
   * here for a definition is authoritative-ish evidence from configuration.
   */
  packAttributeAliases?: Readonly<
    Record<string, readonly string[] | undefined>
  >;
  /**
   * The authoritative unit catalog. Absent or empty means unit compatibility is
   * *unverified* and contributes no signal, rather than being assumed to fail.
   */
  units?: readonly UnitRef[];
  /** Unit the extraction reported for this property, when it reported one. */
  extractedUnit?: string | null;
  /** The extracted value, for value-type compatibility. */
  extractedValue?: unknown;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Named match signals, strongest first. Each is positive evidence that this
 * definition is the attribute the document is describing.
 */
export const ATTRIBUTE_MATCH_SIGNALS = [
  'EXACT_CODE',
  'CANONICAL_CODE',
  'EXACT_ALIAS',
  'EXACT_NAME',
  'DATASHEET_VARIANT',
  'PACK_ALIAS',
  'TOKEN_OVERLAP',
] as const;

export type AttributeMatchSignal = (typeof ATTRIBUTE_MATCH_SIGNALS)[number];

/** Signals that count as a definition *claiming* a term. */
const AUTHORITATIVE_SIGNALS: readonly AttributeMatchSignal[] = [
  'EXACT_CODE',
  'CANONICAL_CODE',
  'EXACT_ALIAS',
  'EXACT_NAME',
  'DATASHEET_VARIANT',
  'PACK_ALIAS',
];

/** Named corroborating signals that shape confidence but never create a match. */
export const ATTRIBUTE_SUPPORT_SIGNALS = [
  'EXPECTED_BY_CATEGORY',
  'BOUND_TO_CATEGORY',
  'UNIT_COMPATIBLE',
  'TYPE_COMPATIBLE',
] as const;

export type AttributeSupportSignal = (typeof ATTRIBUTE_SUPPORT_SIGNALS)[number];

/** Named negative signals. */
export const ATTRIBUTE_NEGATIVE_SIGNALS = [
  'UNIT_CATEGORY_MISMATCH',
  'TYPE_MISMATCH',
  'DEFINITION_INACTIVE',
] as const;

export type AttributeNegativeSignal =
  (typeof ATTRIBUTE_NEGATIVE_SIGNALS)[number];

export const ATTRIBUTE_MATCH_SIGNAL_LABELS: Record<
  AttributeMatchSignal | AttributeSupportSignal | AttributeNegativeSignal,
  string
> = {
  EXACT_CODE: 'the attribute code matches the extracted property exactly',
  CANONICAL_CODE: 'the property is a known synonym of this attribute',
  EXACT_ALIAS: 'the attribute declares this term as an alias',
  EXACT_NAME: 'the attribute name matches',
  DATASHEET_VARIANT:
    'the datasheet wording is a qualified form of this attribute',
  PACK_ALIAS: 'the Data Pack for this part type lists this term as an alias',
  TOKEN_OVERLAP: 'part of the term overlaps this attribute',
  EXPECTED_BY_CATEGORY:
    'the Data Pack expects this attribute for this part type',
  BOUND_TO_CATEGORY: 'this attribute is configured on the component category',
  UNIT_COMPATIBLE:
    'the extracted unit measures the same dimension as the attribute',
  TYPE_COMPATIBLE: 'the extracted value fits the attribute data type',
  UNIT_CATEGORY_MISMATCH: 'the extracted unit measures a different dimension',
  TYPE_MISMATCH: 'the extracted value does not fit the attribute data type',
  DEFINITION_INACTIVE: 'the attribute is deactivated',
};

/**
 * Base weight per match signal.
 *
 * Only relative order matters: an exact code beats a declared alias, which beats
 * a linguistic variant, which beats partial overlap.
 */
const MATCH_WEIGHTS: Record<AttributeMatchSignal, number> = {
  EXACT_CODE: 1,
  CANONICAL_CODE: 0.96,
  EXACT_ALIAS: 0.93,
  EXACT_NAME: 0.9,
  DATASHEET_VARIANT: 0.82,
  PACK_ALIAS: 0.76,
  TOKEN_OVERLAP: 0.45,
};

const SUPPORT_WEIGHTS: Record<AttributeSupportSignal, number> = {
  EXPECTED_BY_CATEGORY: 0.06,
  BOUND_TO_CATEGORY: 0.05,
  UNIT_COMPATIBLE: 0.04,
  TYPE_COMPATIBLE: 0.05,
};

const NEGATIVE_WEIGHTS: Record<AttributeNegativeSignal, number> = {
  UNIT_CATEGORY_MISMATCH: 0.35,
  TYPE_MISMATCH: 0.2,
  DEFINITION_INACTIVE: 0.5,
};

/**
 * Ceiling on the confidence a match signal alone can reach.
 *
 * The headroom below 1 exists so corroborating evidence is *visible*: an exact
 * code match on its own is strong but not certain, and only configuration that
 * independently agrees (the part type expects the attribute, the unit measures
 * the declared dimension, the value fits the type) takes it to the top. Without
 * this the strongest signals would saturate and every resolution would report the
 * same number, which tells a reviewer nothing.
 */
const MATCH_CONFIDENCE_CEILING = 0.9;

/** Credit per additional match signal, capped so weak signals cannot inflate. */
const CORROBORATION_CREDIT = 0.03;
const MAX_CORROBORATION_CREDIT = 0.06;

/**
 * Bounded modifier vocabulary.
 *
 * Datasheets qualify a parameter ("Rated Voltage", "Maximum Operating
 * Temperature") while the ERP attribute is the bare quantity. Stripping a leading
 * or trailing qualifier — repeatedly, but a bounded number of times — reduces the
 * datasheet wording to the authoritative term without an alias list per phrase.
 * The words are electrical-documentation qualifiers, not attribute names.
 */
const LEADING_QUALIFIERS: readonly string[] = [
  'maximum',
  'max',
  'minimum',
  'min',
  'rated',
  'nominal',
  'typical',
  'typ',
  'working',
  'operating',
  'peak',
  'absolute',
  'average',
  'total',
  'reference',
];

const TRAILING_QUALIFIERS: readonly string[] = [
  'value',
  'rating',
  'rated',
  'nominal',
  'typical',
  'limit',
  'level',
  'specification',
  'spec',
];

/** How many qualifier strips are attempted per side. Keeps the pass bounded. */
const MAX_QUALIFIER_STRIPS = 3;

// ---------------------------------------------------------------------------
// Term normalisation
// ---------------------------------------------------------------------------

/**
 * Splits a term into lowercase words.
 *
 * Separators (`_`, `-`, spaces, punctuation and camelCase boundaries) all reduce
 * to the same token list, so `ResistanceValue`, `resistance_value` and
 * `Resistance Value` are the same term.
 */
export function termTokens(term: string): string[] {
  return term
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0);
}

/** Punctuation- and separator-insensitive form of a term. */
export function normalizedTerm(term: string): string {
  return termTokens(term).join('');
}

/**
 * Bounded variants of a term with qualifying words removed from either end.
 *
 * Iterative but capped, so a pathological term cannot cause unbounded work, and
 * ordered from least to most modified so the most faithful variant is tried
 * first.
 */
export function termVariants(term: string): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();

  const push = (tokens: string[]): void => {
    if (tokens.length === 0) return;
    const joined = tokens.join('_');
    const key = normalizedTerm(joined);
    if (!key || seen.has(key)) return;
    seen.add(key);
    variants.push(joined);
  };

  let tokens = termTokens(term);
  push(tokens);

  for (let i = 0; i < MAX_QUALIFIER_STRIPS; i += 1) {
    if (tokens.length <= 1) break;
    if (!LEADING_QUALIFIERS.includes(tokens[0]!)) break;
    tokens = tokens.slice(1);
    push(tokens);
  }

  tokens = termTokens(term);
  for (let i = 0; i < MAX_QUALIFIER_STRIPS; i += 1) {
    if (tokens.length <= 1) break;
    if (!TRAILING_QUALIFIERS.includes(tokens[tokens.length - 1]!)) break;
    tokens = tokens.slice(0, -1);
    push(tokens);
  }

  // A term qualified at both ends (`Nominal Resistance Value`) reduces in two
  // bounded passes; the combination is tried once, not iteratively.
  tokens = termTokens(term);
  for (let i = 0; i < MAX_QUALIFIER_STRIPS; i += 1) {
    if (tokens.length <= 1) break;
    const leading = LEADING_QUALIFIERS.includes(tokens[0]!);
    const trailing = TRAILING_QUALIFIERS.includes(tokens[tokens.length - 1]!);
    if (!leading && !trailing) break;
    tokens = leading ? tokens.slice(1) : tokens;
    tokens = trailing ? tokens.slice(0, -1) : tokens;
    push(tokens);
  }

  return variants;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface AttributeCandidateScore {
  definitionId: string;
  code: string;
  name: string;
  /** 0–1 ordering score. Ranks candidates; not the reported confidence. */
  score: number;
  /**
   * 0–1 confidence that this definition is the attribute described, including
   * corroborating and negative evidence. Human-facing, never an approval.
   */
  confidence: number;
  /** Strongest match signal that made this definition a candidate. */
  primarySignal: AttributeMatchSignal;
  matchedTerm: string | null;
  signals: AttributeMatchSignal[];
  supports: AttributeSupportSignal[];
  negatives: AttributeNegativeSignal[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Jaccard-style overlap between two token sets, in [0, 1]. */
function tokenOverlap(
  first: readonly string[],
  second: readonly string[],
): number {
  if (first.length === 0 || second.length === 0) return 0;
  const left = new Set(first);
  const right = new Set(second);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

/**
 * Whether an extracted value looks representable by a data type.
 *
 * This is a *ranking* signal only. `coerceAttributeValue` remains the authority
 * on whether a value is representable; a mismatch here just means the definition
 * is a poorer fit, not that the value is refused.
 */
function typeCompatibility(
  dataType: string,
  value: unknown,
): 'COMPATIBLE' | 'MISMATCH' | 'UNKNOWN' {
  if (value === null || value === undefined) return 'UNKNOWN';
  const type = dataType.toUpperCase();
  const isNumber =
    typeof value === 'number' ||
    (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()));
  const isBoolean =
    typeof value === 'boolean' ||
    (typeof value === 'string' && /^(true|false|yes|no)$/i.test(value.trim()));
  const text = typeof value === 'string' ? value.trim() : '';

  switch (type) {
    case 'QUANTITY':
    case 'NUMBER':
    case 'INTEGER':
      return isNumber ? 'COMPATIBLE' : 'MISMATCH';
    case 'BOOLEAN':
      return isBoolean ? 'COMPATIBLE' : 'MISMATCH';
    case 'SELECT':
    case 'MULTI_SELECT':
      return text.length > 0 ? 'COMPATIBLE' : 'UNKNOWN';
    case 'DATE':
      return text.length > 0 && !Number.isNaN(Date.parse(text))
        ? 'COMPATIBLE'
        : 'MISMATCH';
    case 'TEXT':
      return text.length > 0 ? 'COMPATIBLE' : 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Scores one definition against an extracted property.
 *
 * Returns null when the definition makes no authoritative claim on the term, so
 * the caller never has to filter candidates itself.
 */
export function scoreAttributeDefinition(input: {
  extractedCode: string;
  definition: ResolvableAttributeDefinition;
  context?: AttributeResolutionContext;
  /** Resolver result from the shared canonical terminology, when available. */
  canonicalCode?: string | null;
}): AttributeCandidateScore | null {
  const { definition } = input;
  const context = input.context ?? {};
  const code = input.extractedCode.trim();
  if (!code) return null;

  const normalizedExtracted = normalizedTerm(code);
  const extractedTokens = termTokens(code);
  const variants = termVariants(code).map((variant) => normalizedTerm(variant));

  const signals: AttributeMatchSignal[] = [];
  let primarySignal: AttributeMatchSignal | null = null;
  let matchedTerm: string | null = null;

  const claim = (signal: AttributeMatchSignal, term: string): void => {
    signals.push(signal);
    if (
      !primarySignal ||
      MATCH_WEIGHTS[signal] > MATCH_WEIGHTS[primarySignal]
    ) {
      primarySignal = signal;
      matchedTerm = term;
    }
  };

  const definitionCode = normalizedTerm(definition.code);
  const definitionName = normalizedTerm(definition.name);
  const aliases = definition.aliases ?? [];
  const normalizedAliases = aliases.map((alias) => normalizedTerm(alias));
  const definitionVariants = [
    ...termVariants(definition.code),
    ...termVariants(definition.name),
    ...aliases.flatMap((alias) => termVariants(alias)),
  ].map((variant) => normalizedTerm(variant));

  if (definitionCode === normalizedExtracted) {
    claim('EXACT_CODE', definition.code);
  } else if (
    input.canonicalCode &&
    normalizedTerm(input.canonicalCode) === definitionCode
  ) {
    claim('CANONICAL_CODE', definition.code);
  }

  const aliasMatch = aliases.find(
    (alias) => normalizedTerm(alias) === normalizedExtracted,
  );
  if (aliasMatch) {
    claim('EXACT_ALIAS', aliasMatch);
  }

  if (definitionName === normalizedExtracted) {
    claim('EXACT_NAME', definition.name);
  }

  /**
   * Qualified-form matching, in both directions.
   *
   *  - the datasheet qualifies the term (`Nominal Resistance`, `Rated Voltage`)
   *    while the attribute is the bare quantity;
   *  - the attribute is qualified (`Voltage Rating`, `Power Rating`, `Peak
   *    Power`) while the datasheet states the bare quantity.
   *
   * Both directions express the same relationship — one side is a qualified form
   * of the other — so they share one signal and one reason string. Only evaluated
   * when the term does not already match the definition outright, so an exact
   * match is never recorded as a variant match too.
   */
  const exactMatch =
    normalizedExtracted === definitionCode ||
    normalizedExtracted === definitionName ||
    normalizedAliases.includes(normalizedExtracted);

  if (!exactMatch) {
    const datasheetQualifies = variants.some(
      (variant) =>
        variant !== normalizedExtracted &&
        (variant === definitionCode ||
          variant === definitionName ||
          normalizedAliases.includes(variant)),
    );

    const attributeQualifies = definitionVariants.some(
      (variant) =>
        variant === normalizedExtracted || variants.includes(variant),
    );

    if (datasheetQualifies || attributeQualifies) {
      claim('DATASHEET_VARIANT', definition.code);
    }
  }

  const packAliases = context.packAttributeAliases?.[definition.code];
  if (packAliases && packAliases.length > 0) {
    const normalizedPackAliases = packAliases.map((alias) =>
      normalizedTerm(alias),
    );
    if (
      normalizedPackAliases.includes(normalizedExtracted) ||
      variants.some((variant) => normalizedPackAliases.includes(variant))
    ) {
      claim('PACK_ALIAS', definition.code);
    }
  }

  // Token overlap ranks candidates but never creates one: `thermal_resistance`
  // must not resolve onto `resistance`.
  const overlap = tokenOverlap(extractedTokens, [
    ...termTokens(definition.code),
    ...termTokens(definition.name),
  ]);

  if (signals.length === 0) return null;

  if (overlap > 0 && !signals.includes('TOKEN_OVERLAP')) {
    signals.push('TOKEN_OVERLAP');
  }

  const supports: AttributeSupportSignal[] = [];
  const negatives: AttributeNegativeSignal[] = [];

  const expected = new Set(
    (context.expectedAttributeCodes ?? []).map((entry) => entry.toLowerCase()),
  );
  if (
    expected.has(definition.code.toLowerCase()) ||
    expected.has(definition.id)
  ) {
    supports.push('EXPECTED_BY_CATEGORY');
  }

  const bound = new Set(
    (context.categoryAttributeCodes ?? []).map((entry) => entry.toLowerCase()),
  );
  if (bound.has(definition.code.toLowerCase()) || bound.has(definition.id)) {
    supports.push('BOUND_TO_CATEGORY');
  }

  const units = context.units ?? [];
  const extractedUnit = context.extractedUnit ?? null;
  if (units.length > 0 && definition.dataType.toUpperCase() === 'QUANTITY') {
    const declaredCategory = definition.unitCategory?.trim() ?? '';
    const unitRow = findUnit(units, extractedUnit);
    if (declaredCategory && extractedUnit) {
      if (!unitRow) {
        // The unit is not in the catalog: unverified, not wrong.
      } else if (unitRow.category === declaredCategory) {
        supports.push('UNIT_COMPATIBLE');
      } else {
        negatives.push('UNIT_CATEGORY_MISMATCH');
      }
    } else if (
      declaredCategory &&
      unitRow &&
      unitRow.category === declaredCategory
    ) {
      supports.push('UNIT_COMPATIBLE');
    } else if (
      !extractedUnit &&
      definition.defaultUnit &&
      findUnit(units, definition.defaultUnit)
    ) {
      // The definition supplies the unit; nothing contradicts it.
      supports.push('UNIT_COMPATIBLE');
    }
  }

  const compatibility = typeCompatibility(
    definition.dataType,
    context.extractedValue,
  );
  if (compatibility === 'COMPATIBLE') supports.push('TYPE_COMPATIBLE');
  if (compatibility === 'MISMATCH') negatives.push('TYPE_MISMATCH');

  if (!definition.isActive) negatives.push('DEFINITION_INACTIVE');

  let score = MATCH_WEIGHTS[primarySignal ?? 'TOKEN_OVERLAP'];
  for (const signal of signals) {
    if (signal === primarySignal) continue;
    score += MATCH_WEIGHTS[signal] * 0.12;
  }
  score = clamp(score);

  // The reported confidence is deliberately a different combination of the same
  // signals: the ranking score orders candidates, the confidence says how much
  // the system actually knows. Neither is a probability and neither can approve
  // anything on its own.
  const corroboration = Math.min(
    Math.max(signals.length - 1, 0) * CORROBORATION_CREDIT,
    MAX_CORROBORATION_CREDIT,
  );
  let confidence =
    MATCH_WEIGHTS[primarySignal ?? 'TOKEN_OVERLAP'] * MATCH_CONFIDENCE_CEILING +
    corroboration;
  for (const support of supports) confidence += SUPPORT_WEIGHTS[support];
  for (const negative of negatives) confidence -= NEGATIVE_WEIGHTS[negative];

  return {
    definitionId: definition.id,
    code: definition.code,
    name: definition.name,
    score: Number(score.toFixed(4)),
    confidence: Number(clamp(confidence).toFixed(4)),
    primarySignal: primarySignal ?? 'TOKEN_OVERLAP',
    matchedTerm,
    signals,
    supports,
    negatives,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface RankedAttributeCandidate {
  definitionId: string;
  code: string;
  name: string;
  score: number;
  confidence: number;
  /** Why this candidate is worth considering, in the reviewer's words. */
  reasons: string[];
}

export interface AttributeResolution {
  state: 'RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED';
  definition: ResolvableAttributeDefinition | null;
  /** 0–1 confidence in the resolution itself. */
  confidence: number;
  /** Human-readable reasons, positives first then negatives. */
  reasons: string[];
  /** Ranked alternatives, always populated for AMBIGUOUS. */
  ranked: RankedAttributeCandidate[];
  winner: AttributeCandidateScore | null;
}

function describeScore(score: AttributeCandidateScore): string[] {
  const reasons: string[] = [];
  for (const signal of score.signals) {
    reasons.push(ATTRIBUTE_MATCH_SIGNAL_LABELS[signal]);
  }
  for (const support of score.supports) {
    reasons.push(ATTRIBUTE_MATCH_SIGNAL_LABELS[support]);
  }
  for (const negative of score.negatives) {
    reasons.push(ATTRIBUTE_MATCH_SIGNAL_LABELS[negative]);
  }
  return reasons;
}

/** Deterministic ordering: score desc, then code, then id. */
function compareScores(
  first: AttributeCandidateScore,
  second: AttributeCandidateScore,
): number {
  if (second.score !== first.score) return second.score - first.score;
  const byCode = first.code.localeCompare(second.code);
  if (byCode !== 0) return byCode;
  return first.definitionId.localeCompare(second.definitionId);
}

/**
 * Resolves an extracted property against the authoritative attribute catalog.
 *
 * Returns RESOLVED only when exactly one definition makes an authoritative claim
 * on the term. Two or more claims stay AMBIGUOUS with the candidates ranked and
 * explained, and nothing that matches is UNRESOLVED — never a guess.
 */
export function resolveAttributeTerm(input: {
  extractedCode: string;
  definitions: readonly ResolvableAttributeDefinition[];
  context?: AttributeResolutionContext;
  /**
   * The canonical definition code from the shared terminology resolver, when the
   * caller has it. Providing it lets `power` resolve onto `power_rating` through
   * the existing canonical vocabulary instead of the linguistic fallback.
   */
  canonicalCode?: string | null;
}): AttributeResolution {
  const scores: AttributeCandidateScore[] = [];
  for (const definition of input.definitions) {
    const score = scoreAttributeDefinition({
      extractedCode: input.extractedCode,
      definition,
      context: input.context,
      canonicalCode: input.canonicalCode,
    });
    if (score) scores.push(score);
  }

  if (scores.length === 0) {
    return {
      state: 'UNRESOLVED',
      definition: null,
      confidence: 1,
      reasons: [
        'no configured attribute matches this term, and no attribute is created from a document',
      ],
      ranked: [],
      winner: null,
    };
  }

  const ordered = [...scores].sort(compareScores);
  const withClaims = ordered.filter((score) =>
    score.signals.some((signal) => AUTHORITATIVE_SIGNALS.includes(signal)),
  );

  if (withClaims.length > 1) {
    const ranked = withClaims.map((score) => ({
      definitionId: score.definitionId,
      code: score.code,
      name: score.name,
      score: score.score,
      confidence: score.confidence,
      reasons: describeScore(score),
    }));
    return {
      state: 'AMBIGUOUS',
      definition: null,
      // Confidence in the *ambiguity*: the top two candidates are close enough
      // that neither can be chosen on the document's evidence.
      confidence: Number(
        Math.max(0.5, 1 - (ranked[0]!.score - ranked[1]!.score)).toFixed(4),
      ),
      reasons: [
        `${withClaims.length} attributes claim this term, and the document does not distinguish them`,
        ...ranked[0]!.reasons,
      ],
      ranked,
      winner: null,
    };
  }

  const winner = ordered[0]!;
  return {
    state: 'RESOLVED',
    definition:
      input.definitions.find(
        (definition) => definition.id === winner.definitionId,
      ) ?? null,
    confidence: winner.confidence,
    reasons: describeScore(winner),
    ranked: [
      {
        definitionId: winner.definitionId,
        code: winner.code,
        name: winner.name,
        score: winner.score,
        confidence: winner.confidence,
        reasons: describeScore(winner),
      },
    ],
    winner,
  };
}
