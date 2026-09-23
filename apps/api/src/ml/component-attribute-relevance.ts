import type { EvidenceItemDto } from './dtos';
import type { UnitRef } from './attribute-value-semantics';
import {
  toComparableValue,
  areValuesEquivalent,
} from './attribute-value-semantics';
import { normalizedTerm, termTokens } from './attribute-resolution';

/**
 * Component Intelligence — attribute relevance and value inference.
 *
 * One component, several sources of evidence, one explainable list.
 *
 * The category's bindings are a strong prior (an explicit configuration
 * decision) but they are not the ceiling: an attribute can also become relevant
 * because a Data Pack expects it for the resolved category, because the part
 * number / description / datasheet text names it, because the extractor already
 * produced a value for it, or because the component already records one. Every
 * candidate is resolved to an **existing attribute definition** — this module
 * never invents an attribute, and it never invents a value.
 *
 * Two concepts are deliberately separate, because they answer different
 * questions and fail independently:
 *
 * - **Requirement / relevance** — "what matters for this part?" Answered from
 *   bindings, Data Pack expectations, mentions and existing records.
 * - **Value** — "what is it probably set to?" Answered only where evidence
 *   exists, and always in the shape the manual editor writes (a real option code
 *   of the definition, or a quantity with its unit).
 *
 * A relevant attribute without a value is a first-class outcome: the caller
 * renders it as "relevant, value not determined" instead of hiding it.
 *
 * Framework-free and pure by construction, like the other intelligence rule
 * modules (`component-duplicate-intelligence`, `attribute-value-semantics`):
 * everything it needs arrives as an argument, which is what makes the whole
 * matrix of relevance/value/conflict cases unit-testable.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RelevanceOption {
  code: string;
  label: string;
}

/** The catalog entry a candidate must resolve to. */
export interface RelevanceDefinition {
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  aliases?: readonly string[] | null;
  validationRules?: Record<string, unknown> | null;
  isActive: boolean;
  options?: readonly RelevanceOption[];
}

/**
 * One binding of a category in the ERP (`category_attributes`).
 *
 * `inheritedFromCategoryId` is set when the binding comes from an ancestor
 * category: still positive evidence, but weaker than an explicit binding on the
 * category itself, and the UI explains it as inherited.
 */
export interface RelevanceBinding {
  attributeDefinitionId: string;
  isRequired: boolean;
  sortOrder: number;
  inheritedFromCategoryId?: string | null;
}

/**
 * A category the suggestion is conditioned on, primary first.
 *
 * Alternatives are included deliberately: when two categories are genuinely
 * ambiguous the reviewer must be able to see which attributes each one
 * establishes, rather than the system silently merging them.
 */
export interface RelevanceCategory {
  categoryId: string;
  categoryName: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  isPrimary: boolean;
  bindings: readonly RelevanceBinding[];
}

/**
 * A Data Pack expectation already resolved to a definition by the caller.
 *
 * The caller owns the resolution because the pack vocabulary (`voltage`,
 * `current`, `power`) is bridged to definition codes by the existing alias map
 * in the ML service, and a second copy of that mapping here would drift.
 */
export interface RelevancePackExpectation {
  definitionId: string;
  categoryId?: string | null;
  categoryName?: string | null;
  /** Extra terms the pack declares for this attribute, e.g. `cap`, `capacity`. */
  aliases?: readonly string[];
  reason: string;
}

/** An attribute the extractor already produced a value for. */
export interface RelevanceExtractedAttribute {
  definitionId: string;
  value: unknown;
  unit?: string | null;
  formatted: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  evidence?: EvidenceItemDto[];
}

export interface BuildAttributeRelevanceInput {
  definitions: readonly RelevanceDefinition[];
  categories: readonly RelevanceCategory[];
  packExpectations?: readonly RelevancePackExpectation[];
  extracted?: readonly RelevanceExtractedAttribute[];
  /** Query, part number, description and pasted datasheet text, in that order. */
  text?: readonly string[];
  /** The component's recorded values, by definition id, in display form. */
  existingValues?: ReadonlyMap<string, string>;
  /** The authoritative unit catalog, for semantic value comparison. */
  units?: readonly UnitRef[];
  /**
   * The definitions that play a specific role in inference, resolved by the
   * caller from the catalog it already holds. Absent means the corresponding
   * inference cannot run — never that it is guessed.
   */
  packageDefinitionId?: string | null;
  mountingTypeDefinitionId?: string | null;
  /**
   * What the ML service judged about this component, when it was asked.
   *
   * A *corroborating* source, not a competing one: it adds relevance the local
   * rules did not establish, and its value is weighed against the local one
   * rather than replacing it. Absent whenever the service is disabled, the call
   * failed or it had nothing to say, and nothing else about the result changes.
   */
  mlSuggestions?: readonly MlAttributeSuggestion[];
}

/**
 * One attribute as judged by the ML service.
 *
 * `suggestedValue` is an option code of the definition, because the service
 * canonicalises against the catalog it was sent; a value it could not express in
 * the library's own terms arrives as null with the relevance intact.
 */
export interface MlAttributeSuggestion {
  attributeDefinitionId: string;
  code: string;
  suggestedValue?: string | null;
  formatted?: string | null;
  confidence?: number | null;
  confidenceLevel?: ConfidenceLevel | null;
  relevance: readonly AttributeRelevanceEvidence[];
  valueEvidence?: readonly AttributeRelevanceEvidence[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export const ATTRIBUTE_RELEVANCE_SOURCE_TYPES = [
  'category_binding',
  'category_binding_inherited',
  'data_pack_expectation',
  'attribute_mention',
  'extracted_attribute',
  'existing_value',
  'package_pattern',
  'ml_attribute_knowledge',
] as const;

export type AttributeRelevanceSourceType =
  (typeof ATTRIBUTE_RELEVANCE_SOURCE_TYPES)[number];

export interface AttributeRelevanceEvidence {
  type: AttributeRelevanceSourceType;
  description: string;
  source?: string;
  weight: number;
  categoryId?: string | null;
  categoryName?: string | null;
}

/** Canonical value in the shape the manual attribute editor writes. */
export interface AttributeSuggestionValue {
  /** A MULTI_SELECT value is the list of chosen option codes. */
  value: string | number | boolean | string[] | null;
  unit?: string | null;
  optionCode?: string;
  optionLabel?: string;
  selectedOptionCodes?: string[];
  formatted: string;
}

export interface AttributeSuggestionConflict {
  existingDisplay: string;
  suggestedDisplay: string;
}

export interface AttributeSuggestion {
  attributeDefinitionId: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  /**
   * Whether a category considered here marks the attribute as required. A
   * *relevance* fact — it never forces a value.
   */
  isRequired: boolean;
  /** The considered categories that establish relevance for this attribute. */
  categoryIds: string[];
  /** Every category that was considered, so the UI can show what did not establish it. */
  consideredCategoryIds: string[];
  relevance: AttributeRelevanceEvidence[];
  valueEvidence: AttributeRelevanceEvidence[];
  suggestedValue: AttributeSuggestionValue | null;
  confidence: number | null;
  confidenceLevel: ConfidenceLevel | null;
  existingDisplay: string | null;
  /**
   * Whether the recorded value was *positively established* as equivalent.
   *
   * `null` when nothing is recorded. The distinction matters to the reviewer: a
   * valued suggestion with an equal recorded value has nothing to apply, while
   * an inconclusive comparison (`false`) must not be presented as agreement —
   * the reader decides, with both values in front of them.
   */
  existingMatches: boolean | null;
  /** Set only when the recorded value and the suggested value genuinely differ. */
  conflict: AttributeSuggestionConflict | null;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * How strongly each source establishes relevance.
 *
 * A configured binding outranks a pack expectation, which outranks a lexical
 * mention. None of these is a probability — they order the list and explain it.
 */
const RELEVANCE_WEIGHTS: Record<AttributeRelevanceSourceType, number> = {
  category_binding: 0.9,
  category_binding_inherited: 0.8,
  data_pack_expectation: 0.85,
  extracted_attribute: 0.8,
  existing_value: 0.9,
  package_pattern: 0.9,
  attribute_mention: 0.6,
  ml_attribute_knowledge: 0.75,
};

/** Confidence in an inferred value, by how it was inferred. */
const VALUE_WEIGHTS = {
  packagePattern: 0.9,
  optionMention: 0.75,
} as const;

/**
 * How much a corroborating source raises confidence in the same value.
 *
 * Two independent readings agreeing is real evidence, but it is not certainty:
 * the result is capped rather than allowed to approach 1.
 */
const CORROBORATION_CREDIT = 0.05;
const MAX_CORROBORATED_CONFIDENCE = 0.98;

/** The repo's existing confidence bands, reused rather than re-invented. */
export function confidenceLevelFor(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.6) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Package → mounting type
// ---------------------------------------------------------------------------

export const PACKAGE_MOUNTING_CLASSES = [
  'SMD',
  'THROUGH_HOLE',
  'PANEL_MOUNT',
] as const;

export type PackageMountingClass = (typeof PACKAGE_MOUNTING_CLASSES)[number];

/**
 * Package families → mounting technology.
 *
 * A classification of the **package vocabulary itself**, not a category →
 * attribute list: it says what a footprint is, which is a fact about the
 * footprint, and it is only ever applied when the component's package value is
 * already known. The resulting classification is resolved to a real option of
 * the `mounting_type` definition (see {@link optionCodeForMountingClass}) — if
 * that definition, or a matching option, does not exist, no value is produced.
 *
 * Through-hole families are matched first and the patterns are anchored, so a
 * `TO-220` can never be classified from a coincidental substring.
 */
const PACKAGE_MOUNTING_RULES: readonly {
  family: string;
  pattern: RegExp;
  classification: PackageMountingClass;
}[] = [
  // Through-hole families.
  { family: 'DIP', pattern: /^dip\d*/, classification: 'THROUGH_HOLE' },
  { family: 'SIP', pattern: /^sip\d*/, classification: 'THROUGH_HOLE' },
  { family: 'TO', pattern: /^to\d{2,3}/, classification: 'THROUGH_HOLE' },
  { family: 'PGA', pattern: /^pga\d*/, classification: 'THROUGH_HOLE' },
  { family: 'Axial', pattern: /^axial/, classification: 'THROUGH_HOLE' },
  { family: 'Radial', pattern: /^radial/, classification: 'THROUGH_HOLE' },
  // Surface-mount families: chip footprints, then packaged semiconductors.
  {
    family: 'Chip footprint',
    pattern: /^(0201|0402|0603|0805|1206|1210|2010|2512|1812|2220|1020|0705)/,
    classification: 'SMD',
  },
  {
    family: 'SOD/SOT',
    pattern: /^(sod|sot)\d*/,
    classification: 'SMD',
  },
  {
    family: 'SOIC/TSSOP/MSOP/SSOP',
    pattern: /^(soic|tssop|msop|ssop|so|sop)\d*/,
    classification: 'SMD',
  },
  {
    family: 'QFN/DFN/QFP/LQFP/TQFP',
    pattern: /^(qfn|dfn|lqfp|tqfp|qfp)\d*/,
    classification: 'SMD',
  },
  { family: 'BGA', pattern: /^(bga|wlcsp|csp)/, classification: 'SMD' },
];

/**
 * Classifies a package value by its code.
 *
 * Returns null for a package the rules do not recognise, which is a normal
 * outcome: an unknown footprint means "no mounting inference", never a guess.
 */
export function classifyPackageMounting(
  packageValue: string,
): { classification: PackageMountingClass; family: string } | null {
  const normalized = normalizedTerm(packageValue);
  if (!normalized) return null;

  for (const rule of PACKAGE_MOUNTING_RULES) {
    if (rule.pattern.test(normalized)) {
      return { classification: rule.classification, family: rule.family };
    }
  }
  return null;
}

/**
 * The option of the `mounting_type` definition that expresses a classification.
 *
 * Matched against the definition's own options, by code first and label second,
 * so the suggestion is always a value the manual editor could have picked.
 */
export function optionCodeForMountingClass(
  definition: Pick<RelevanceDefinition, 'options'>,
  classification: PackageMountingClass,
): RelevanceOption | null {
  const options = definition.options ?? [];
  const patterns: Record<PackageMountingClass, RegExp> = {
    SMD: /^(smd|smt)$|surface\s*mount/,
    THROUGH_HOLE: /^(throughhole|tht|thruhole)$|through\s*hole/,
    PANEL_MOUNT: /^panelmount$|panel\s*mount/,
  };
  const pattern = patterns[classification];

  for (const option of options) {
    if (pattern.test(normalizedTerm(option.code))) return option;
  }
  for (const option of options) {
    if (pattern.test(normalizedTerm(option.label))) return option;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lexical evidence
// ---------------------------------------------------------------------------

/**
 * A single token is only accepted as a mention when it is this long.
 *
 * Guards the vocabulary's short aliases (`cap`, `res`, `tol`) which appear in
 * ordinary prose far too often to be evidence on their own. Multi-token terms
 * are unaffected.
 */
const MIN_SINGLE_TOKEN_MENTION_LENGTH = 4;

function textTokenList(texts: readonly string[]): string[] {
  return texts.flatMap((text) => termTokens(text));
}

function containsTokenSequence(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function isUsableMentionTerm(tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  if (
    tokens.length === 1 &&
    tokens[0]!.length < MIN_SINGLE_TOKEN_MENTION_LENGTH
  ) {
    return false;
  }
  return true;
}

interface MentionMatch {
  term: string;
  kind: 'code' | 'name' | 'alias';
}

/**
 * Whether any of a definition's own terms appears in the text.
 *
 * Terms come from the definition itself (code, name, declared aliases) plus the
 * Data Pack's declared aliases for it. Nothing is matched that the definition or
 * its configuration does not claim — a mention therefore always maps to a real
 * definition.
 */
function findMentionedTerm(
  definition: RelevanceDefinition,
  extraAliases: readonly string[],
  tokens: readonly string[],
): MentionMatch | null {
  const candidates: { term: string; kind: MentionMatch['kind'] }[] = [
    { term: definition.name, kind: 'name' },
    { term: definition.code, kind: 'code' },
    ...(definition.aliases ?? []).map((alias) => ({
      term: alias,
      kind: 'alias' as const,
    })),
    ...extraAliases.map((alias) => ({ term: alias, kind: 'alias' as const })),
  ];

  let best: MentionMatch | null = null;
  for (const candidate of candidates) {
    if (!candidate.term) continue;
    const termTokensList = termTokens(candidate.term);
    if (!isUsableMentionTerm(termTokensList)) continue;
    if (!containsTokenSequence(tokens, termTokensList)) continue;
    if (!best || mentionRank(candidate) > mentionRank(best)) {
      best = { term: candidate.term, kind: candidate.kind };
    }
  }
  return best;
}

/**
 * A name mention outranks a code mention outranks an alias mention, and a longer
 * term outranks a shorter one, so the explanation names the strongest evidence
 * that actually matched.
 */
function mentionRank(match: MentionMatch): number {
  const kindRank = match.kind === 'name' ? 2 : match.kind === 'code' ? 1 : 0;
  return kindRank * 100 + termTokens(match.term).length;
}

interface OptionMention {
  option: RelevanceOption;
  matchedLabel: boolean;
}

/**
 * The option of a SELECT definition the text names, if any.
 *
 * Codes are matched before labels, and both must appear as whole token
 * sequences — `X7R` or `Through Hole (THT)` are matched, a substring of either
 * is not.
 */
function findMentionedOption(
  definition: RelevanceDefinition,
  tokens: readonly string[],
): OptionMention | null {
  const options = definition.options ?? [];

  for (const option of options) {
    const optionTokens = termTokens(option.code);
    if (!isUsableMentionTerm(optionTokens)) continue;
    if (containsTokenSequence(tokens, optionTokens)) {
      return { option, matchedLabel: false };
    }
  }
  for (const option of options) {
    const labelTokens = termTokens(option.label);
    if (!isUsableMentionTerm(labelTokens)) continue;
    if (containsTokenSequence(tokens, labelTokens)) {
      return { option, matchedLabel: true };
    }
  }
  return null;
}

/** The definition's option a raw extracted value names, by code then label. */
function findOptionForRawValue(
  definition: RelevanceDefinition,
  raw: unknown,
): RelevanceOption | null {
  const options = definition.options ?? [];
  if (raw === null || raw === undefined) return null;
  // Only a primitive names an option; an object would stringify to
  // `[object Object]`, which no option can legitimately be.
  if (
    typeof raw !== 'string' &&
    typeof raw !== 'number' &&
    typeof raw !== 'boolean'
  ) {
    return null;
  }
  const normalized = normalizedTerm(String(raw));
  if (!normalized) return null;

  const byCode = options.find(
    (option) => normalizedTerm(option.code) === normalized,
  );
  if (byCode) return byCode;
  const byLabel = options.find(
    (option) => normalizedTerm(option.label) === normalized,
  );
  return byLabel ?? null;
}

// ---------------------------------------------------------------------------
// Value assembly
// ---------------------------------------------------------------------------

function buildOptionValue(
  definition: RelevanceDefinition,
  option: RelevanceOption,
): AttributeSuggestionValue {
  if (definition.dataType.toUpperCase() === 'MULTI_SELECT') {
    return {
      value: [option.code],
      optionCode: option.code,
      optionLabel: option.label,
      selectedOptionCodes: [option.code],
      formatted: option.code,
    };
  }
  return {
    value: option.code,
    optionCode: option.code,
    optionLabel: option.label,
    formatted: option.code,
  };
}

function buildExtractedValue(
  definition: RelevanceDefinition,
  extracted: RelevanceExtractedAttribute,
): AttributeSuggestionValue | null {
  const dataType = definition.dataType.toUpperCase();

  if (dataType === 'SELECT' || dataType === 'MULTI_SELECT') {
    const option = findOptionForRawValue(definition, extracted.value);
    // An extracted choice that is not an option of the definition cannot be
    // written by the manual editor, so it is reported without a value instead of
    // as a free string.
    return option ? buildOptionValue(definition, option) : null;
  }

  if (extracted.value === null || extracted.value === undefined) {
    return null;
  }

  return {
    value: extracted.value as string | number | boolean,
    unit: extracted.unit ?? definition.defaultUnit ?? null,
    formatted: extracted.formatted,
  };
}

/**
 * A value the ML service named as an option code.
 *
 * Re-checked against the definition even though the service canonicalises: an
 * option the manual editor could not pick must never reach a suggestion, and the
 * catalog this rule reads is the same one the service was given.
 */
function buildOptionCodeValue(
  definition: RelevanceDefinition,
  optionCode: string,
): AttributeSuggestionValue | null {
  const option = (definition.options ?? []).find(
    (candidate) => candidate.code === optionCode,
  );
  return option ? buildOptionValue(definition, option) : null;
}

/**
 * The recorded value as a comparable, in display form.
 *
 * `loadComponentAttributeDisplays` renders a SELECT value as its option **code**
 * and a MULTI_SELECT as its codes joined with `, `, which is exactly the shape
 * the comparison layer reads; a QUANTITY display carries its unit. Nothing is
 * re-derived from the database row here — the display string is the contract.
 */
function existingValueToComparable(
  definition: RelevanceDefinition,
  display: string,
): ReturnType<typeof toComparableValue> {
  const dataType = definition.dataType.toUpperCase();
  if (dataType === 'SELECT') {
    return { optionCode: display };
  }
  if (dataType === 'MULTI_SELECT') {
    return {
      optionCodes: display
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code.length > 0),
    };
  }
  return toComparableValue({ dataType: definition.dataType, display });
}

function suggestedValueToComparable(
  definition: RelevanceDefinition,
  value: AttributeSuggestionValue,
): ReturnType<typeof toComparableValue> {
  return toComparableValue({
    dataType: definition.dataType,
    coerced: {
      value: value.value,
      unit: value.unit ?? null,
      optionCode: value.optionCode ?? null,
      selectedOptionCodes: value.selectedOptionCodes ?? null,
    },
  });
}

/**
 * How a recorded value relates to a suggestion.
 *
 * The comparison layer answers three ways, and the reviewer needs all three: a
 * positively equivalent value (nothing to apply), a genuinely different one (a
 * conflict), and an inconclusive one (a decision, not an agreement).
 */
interface ExistingComparison {
  matches: boolean;
  conflict: AttributeSuggestionConflict | null;
}

/**
 * Compares a recorded value with a suggestion and reports both verdicts.
 *
 * Uses the shared comparison layer (`areValuesEquivalent`) so a re-formatted or
 * unit-converted value is recognised as equivalent instead of being reported as
 * a change. Only a confident `DIFFERENT` is a conflict; anything incomparable is
 * reported as not-matching without claiming a disagreement the system cannot
 * establish.
 */
function compareWithExisting(
  definition: RelevanceDefinition,
  existingDisplay: string,
  suggested: AttributeSuggestionValue,
  units: readonly UnitRef[],
): ExistingComparison {
  const comparison = areValuesEquivalent({
    dataType: definition.dataType,
    unitCategory: definition.unitCategory ?? null,
    units,
    first: existingValueToComparable(definition, existingDisplay),
    second: suggestedValueToComparable(definition, suggested),
    validationRules: definition.validationRules ?? null,
  });

  if (comparison.result === 'DIFFERENT') {
    return {
      matches: false,
      conflict: {
        existingDisplay,
        suggestedDisplay: suggested.formatted,
      },
    };
  }

  return { matches: comparison.equivalent, conflict: null };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

interface SuggestionDraft {
  definition: RelevanceDefinition;
  relevance: AttributeRelevanceEvidence[];
  categoryIds: Set<string>;
  isRequired: boolean;
  sortOrder: number | null;
  value: AttributeSuggestionValue | null;
  valueEvidence: AttributeRelevanceEvidence[];
  valueConfidence: number | null;
}

export function buildAttributeSuggestions(
  input: BuildAttributeRelevanceInput,
): AttributeSuggestion[] {
  const definitionsById = new Map(
    input.definitions
      .filter((definition) => definition.isActive)
      .map((definition) => [definition.id, definition]),
  );
  const drafts = new Map<string, SuggestionDraft>();
  const consideredCategoryIds = input.categories.map(
    (category) => category.categoryId,
  );

  const draftFor = (definition: RelevanceDefinition): SuggestionDraft => {
    let draft = drafts.get(definition.id);
    if (!draft) {
      draft = {
        definition,
        relevance: [],
        categoryIds: new Set(),
        isRequired: false,
        sortOrder: null,
        value: null,
        valueEvidence: [],
        valueConfidence: null,
      };
      drafts.set(definition.id, draft);
    }
    return draft;
  };

  const addCategoryEvidence = (
    draft: SuggestionDraft,
    type: 'category_binding' | 'category_binding_inherited',
    category: RelevanceCategory,
    binding: RelevanceBinding,
  ): void => {
    draft.categoryIds.add(category.categoryId);
    draft.isRequired = draft.isRequired || binding.isRequired;
    if (type === 'category_binding') {
      draft.sortOrder =
        draft.sortOrder === null
          ? binding.sortOrder
          : Math.min(draft.sortOrder, binding.sortOrder);
    }
    const inherited = type === 'category_binding_inherited';
    draft.relevance.push({
      type,
      description: inherited
        ? `${draft.definition.name} is bound to ${category.categoryName} (inherited from a parent category)`
        : `${draft.definition.name} is bound to ${category.categoryName}`,
      source: inherited ? 'category:inherited-binding' : 'category:binding',
      weight: RELEVANCE_WEIGHTS[type],
      categoryId: category.categoryId,
      categoryName: category.categoryName,
    });
  };

  // 1. Category bindings — the strong, explicit prior.
  for (const category of input.categories) {
    for (const binding of category.bindings) {
      const definition = definitionsById.get(binding.attributeDefinitionId);
      if (!definition) continue;
      addCategoryEvidence(
        draftFor(definition),
        binding.inheritedFromCategoryId
          ? 'category_binding_inherited'
          : 'category_binding',
        category,
        binding,
      );
    }
  }

  // 2. Data Pack expectations for the considered categories.
  for (const expectation of input.packExpectations ?? []) {
    const definition = definitionsById.get(expectation.definitionId);
    if (!definition) continue;
    const draft = draftFor(definition);
    if (expectation.categoryId) draft.categoryIds.add(expectation.categoryId);
    draft.relevance.push({
      type: 'data_pack_expectation',
      description: expectation.reason,
      source: 'datapack:expected_attributes',
      weight: RELEVANCE_WEIGHTS.data_pack_expectation,
      categoryId: expectation.categoryId ?? null,
      categoryName: expectation.categoryName ?? null,
    });
  }

  // 3. Text mentions: code / name / declared aliases, per definition.
  const tokens = textTokenList(input.text ?? []);
  const packAliasesByDefinition = new Map<string, string[]>();
  for (const expectation of input.packExpectations ?? []) {
    const aliases = (expectation.aliases ?? []).filter(
      (alias) => alias.length > 0,
    );
    if (aliases.length === 0) continue;
    packAliasesByDefinition.set(expectation.definitionId, [
      ...(packAliasesByDefinition.get(expectation.definitionId) ?? []),
      ...aliases,
    ]);
  }

  if (tokens.length > 0) {
    for (const definition of definitionsById.values()) {
      const match = findMentionedTerm(
        definition,
        packAliasesByDefinition.get(definition.id) ?? [],
        tokens,
      );
      if (!match) continue;
      draftFor(definition).relevance.push({
        type: 'attribute_mention',
        description: `The supplied text names "${match.term}" (${match.kind})`,
        source: 'text:mention',
        weight: RELEVANCE_WEIGHTS.attribute_mention,
      });
    }
  }

  // 4. Existing component values: the component already treats it as relevant.
  const recordedDefinitionIds = [...(input.existingValues?.keys() ?? [])];
  for (const definitionId of recordedDefinitionIds) {
    const definition = definitionsById.get(definitionId);
    if (!definition) continue;
    draftFor(definition).relevance.push({
      type: 'existing_value',
      description: `${definition.name} is already recorded on this component`,
      source: 'component:attribute_value',
      weight: RELEVANCE_WEIGHTS.existing_value,
    });
  }

  // 5. Values: the extractor's output first, always in its canonical shape.
  for (const extracted of input.extracted ?? []) {
    const definition = definitionsById.get(extracted.definitionId);
    if (!definition) continue;
    const draft = draftFor(definition);
    draft.relevance.push({
      type: 'extracted_attribute',
      description: `Extracted ${extracted.formatted} from the supplied text`,
      source: 'extractor:component-attribute',
      weight: RELEVANCE_WEIGHTS.extracted_attribute,
    });
    const value = buildExtractedValue(definition, extracted);
    if (!value) continue;
    if (
      draft.valueConfidence !== null &&
      draft.valueConfidence >= extracted.confidence
    ) {
      continue;
    }
    draft.value = value;
    draft.valueConfidence = extracted.confidence;
    draft.valueEvidence = [
      ...(extracted.evidence ?? []).map((evidence) => ({
        type: 'extracted_attribute' as const,
        description: evidence.description,
        source: evidence.source,
        weight: evidence.weight,
      })),
    ];
  }

  // 6. Option mentions in the text, for choices the extractor does not cover.
  for (const draft of drafts.values()) {
    const dataType = draft.definition.dataType.toUpperCase();
    if (dataType !== 'SELECT') continue;
    if (draft.value) continue;
    const mention = findMentionedOption(draft.definition, tokens);
    if (!mention) continue;
    draft.value = buildOptionValue(draft.definition, mention.option);
    draft.valueConfidence = VALUE_WEIGHTS.optionMention;
    draft.valueEvidence = [
      {
        type: 'attribute_mention',
        description: mention.matchedLabel
          ? `The supplied text names the option "${mention.option.label}"`
          : `The supplied text names the option "${mention.option.code}"`,
        source: 'text:option_mention',
        weight: VALUE_WEIGHTS.optionMention,
      },
    ];
  }

  // 7. Package → mounting type, when the package value is already known.
  const mountingDefinition = input.mountingTypeDefinitionId
    ? definitionsById.get(input.mountingTypeDefinitionId)
    : undefined;
  if (mountingDefinition) {
    const packageValue =
      (input.packageDefinitionId
        ? input.extracted?.find(
            (extracted) => extracted.definitionId === input.packageDefinitionId,
          )?.formatted
        : undefined) ??
      (input.packageDefinitionId
        ? input.existingValues?.get(input.packageDefinitionId)
        : undefined);

    if (packageValue) {
      const classification = classifyPackageMounting(packageValue);
      if (classification) {
        const draft = draftFor(mountingDefinition);
        draft.relevance.push({
          type: 'package_pattern',
          description: `${packageValue} is a ${classification.family} ${classification.classification === 'SMD' ? 'surface-mount' : classification.classification === 'THROUGH_HOLE' ? 'through-hole' : 'panel-mount'} package`,
          source: 'package:mounting_classification',
          weight: RELEVANCE_WEIGHTS.package_pattern,
        });
        // The classification is evidence whether or not it can be expressed as a
        // value: a mounting type the definition cannot name stays relevant with
        // the value undetermined, which is exactly what the UI reports.
        const option = optionCodeForMountingClass(
          mountingDefinition,
          classification.classification,
        );
        if (option && !draft.value) {
          draft.value = buildOptionValue(mountingDefinition, option);
          draft.valueConfidence = VALUE_WEIGHTS.packagePattern;
          draft.valueEvidence = [
            {
              type: 'package_pattern',
              description: `${packageValue} is a ${classification.family} footprint, which mounts as ${option.code}`,
              source: 'package:mounting_classification',
              weight: VALUE_WEIGHTS.packagePattern,
            },
          ];
        }
      }
    }
  }

  // 8. The model's own judgement, merged as corroboration.
  //
  // It can introduce an attribute the local rules did not establish, and it can
  // confirm or contradict a value. It never silently wins: an agreeing reading
  // raises confidence by a bounded amount and is listed as evidence; a
  // disagreeing one is recorded and the higher-confidence value stands.
  for (const mlSuggestion of input.mlSuggestions ?? []) {
    const definition = definitionsById.get(mlSuggestion.attributeDefinitionId);
    if (!definition) continue;
    const draft = draftFor(definition);

    // Only sources the local pass did not already record. The model is sent the
    // bindings, the Data Pack hints and the extraction, so it reports them back;
    // listing the same fact twice because two passes noticed it reads as two
    // independent findings, which it is not. A source only the model knows
    // (its domain vocabulary, its option mapping) is added.
    const knownSources = new Set(
      draft.relevance.map((evidence) => evidence.source),
    );
    for (const evidence of mlSuggestion.relevance) {
      if (knownSources.has(evidence.source)) continue;
      knownSources.add(evidence.source);
      draft.relevance.push(evidence);
    }

    const mlValue = mlSuggestion.suggestedValue
      ? buildOptionCodeValue(definition, mlSuggestion.suggestedValue)
      : null;
    if (!mlValue) continue;

    const mlConfidence = mlSuggestion.confidence ?? 0;
    const mlEvidence = mlSuggestion.valueEvidence ?? [];

    if (!draft.value) {
      draft.value = mlValue;
      draft.valueConfidence = mlConfidence;
      draft.valueEvidence = [...mlEvidence];
      continue;
    }

    const agreement = areValuesEquivalent({
      dataType: definition.dataType,
      unitCategory: definition.unitCategory ?? null,
      units: input.units ?? [],
      first: suggestedValueToComparable(definition, draft.value),
      second: suggestedValueToComparable(definition, mlValue),
      validationRules: definition.validationRules ?? null,
    });

    if (agreement.result !== 'DIFFERENT') {
      draft.valueConfidence = Math.min(
        MAX_CORROBORATED_CONFIDENCE,
        Math.max(draft.valueConfidence ?? 0, mlConfidence) +
          CORROBORATION_CREDIT,
      );
      draft.valueEvidence.push(...mlEvidence);
      continue;
    }

    // The two readings disagree. Keeping the better-supported one and saying so
    // is the honest outcome: a reviewer sees both statements rather than the
    // system silently choosing. Confidence is deliberately not raised —
    // corroboration is credit for agreeing, and this is the opposite of that.
    const mlIsStronger = mlConfidence > (draft.valueConfidence ?? 0);
    const rejected = mlIsStronger ? draft.value : mlValue;
    if (mlIsStronger) {
      draft.value = mlValue;
      draft.valueConfidence = mlConfidence;
    }
    draft.valueEvidence = [
      ...draft.valueEvidence,
      ...mlEvidence,
      {
        type: 'ml_attribute_knowledge',
        description: `Conflicting evidence: the model gave ${rejected.formatted} for this attribute`,
        source: 'ml:disagreement',
        weight: 0,
      },
    ];
  }

  // 9. Conflicts and final ordering.
  const suggestions: AttributeSuggestion[] = [];
  for (const draft of drafts.values()) {
    const existingDisplay =
      input.existingValues?.get(draft.definition.id) ?? null;
    const comparison =
      draft.value && existingDisplay
        ? compareWithExisting(
            draft.definition,
            existingDisplay,
            draft.value,
            input.units ?? [],
          )
        : null;

    suggestions.push({
      attributeDefinitionId: draft.definition.id,
      code: draft.definition.code,
      name: draft.definition.name,
      dataType: draft.definition.dataType,
      unitCategory: draft.definition.unitCategory ?? null,
      defaultUnit: draft.definition.defaultUnit ?? null,
      isRequired: draft.isRequired,
      categoryIds: [...draft.categoryIds],
      consideredCategoryIds,
      relevance: draft.relevance,
      valueEvidence: draft.valueEvidence,
      suggestedValue: draft.value,
      confidence: draft.value ? draft.valueConfidence : null,
      confidenceLevel: draft.value
        ? confidenceLevelFor(draft.valueConfidence ?? 0)
        : null,
      existingDisplay,
      existingMatches: comparison ? comparison.matches : null,
      conflict: comparison ? comparison.conflict : null,
    });
  }

  // Bound attributes first, in the category's own order (the same order the
  // manual editor shows them). Discovered attributes follow, strongest first.
  return suggestions.sort((first, second) => {
    const firstBound = first.categoryIds.length > 0;
    const secondBound = second.categoryIds.length > 0;
    if (firstBound !== secondBound) return firstBound ? -1 : 1;
    if (firstBound && secondBound) {
      const firstOrder = draftOrder(drafts.get(first.attributeDefinitionId));
      const secondOrder = draftOrder(drafts.get(second.attributeDefinitionId));
      if (firstOrder !== secondOrder) return firstOrder - secondOrder;
    }
    return first.name.localeCompare(second.name);
  });
}

function draftOrder(draft: SuggestionDraft | undefined): number {
  return draft?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}
