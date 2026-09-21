import {
  compareAttributeValues,
  findUnit,
  readAbsoluteTolerance,
  readRelativeTolerance,
  toBaseUnit,
  toComparableValue,
  type ComparableValue,
  type UnitRef,
  type ValueComparisonResult,
} from './attribute-value-semantics';
import {
  hasPrimaryEvidence,
  normalizeEvidence,
  type SpecificationEvidenceItem,
} from './specification-evidence';

/**
 * Cross-document specification aggregation.
 *
 * A component usually has more than one document that states the same
 * specification: the datasheet's electrical characteristics table, an ordering
 * guide, a product page. Pass 3 analysed one document at a time, so the same
 * attribute seen in three places would be three separate suggestions — or, worse,
 * a disagreement would simply be whichever document happened to be analysed last.
 *
 * This module combines per-document candidates for the same attribute into one
 * decision:
 *
 *  - sources that agree produce **one** finding with every contributing document
 *    as evidence, so agreement strengthens the evidence instead of multiplying
 *    the queue;
 *  - sources that disagree produce a conflict, reported with what each source
 *    says, and **nothing applicable**: no document is chosen for the reviewer;
 *  - the value the component already records is compared against the evidence, so
 *    a reviewer sees "datasheet agrees, product page conflicts" rather than
 *    having to work it out.
 *
 * Nothing here mutates ERP data, and nothing here resolves a conflict. The
 * grouping is done with the semantic comparison layer, so agreement means
 * "equivalent values", not "identical strings".
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Document identity of one contributing source. */
export interface SpecificationSourceRef {
  documentId: string;
  documentVersion: number;
  documentContentHash: string;
  documentFileName: string | null;
  documentType: string | null;
}

/** One document's candidate for one attribute. */
export interface SpecificationSourceCandidate extends SpecificationSourceRef {
  /** The authoritative attribute this document's candidate resolved onto. */
  attributeDefinitionId: string | null;
  /** Attribute code, recorded with the candidate. */
  attributeCode: string | null;
  /** Property code as the extractor named it, e.g. `resistance`. */
  extractedCode: string;
  /** Display value as extracted, e.g. `330Ω`. */
  formatted: string;
  unit: string | null;
  /** Endpoint-shaped value the attribute domain accepts, when resolved. */
  normalizedValue: unknown;
  optionCode: string | null;
  /** Whether this document's candidate could be applied on its own. */
  applicable: boolean;
  inapplicableReason: string | null;
  /** Resolution confidence for this document's mapping (Pass 4 scoring). */
  resolutionConfidence: number;
  resolutionReasons: readonly string[];
  /** Extraction confidence reported by the extractor. */
  extractionConfidence: number;
  evidence: readonly SpecificationEvidenceItem[];
}

/** Authoritative definition metadata the aggregation compares against. */
export interface AggregatedAttributeDefinition {
  id: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  validationRules?: Record<string, unknown> | null;
}

export interface AggregateSpecificationsInput {
  definitions: readonly AggregatedAttributeDefinition[];
  candidates: readonly SpecificationSourceCandidate[];
  units: readonly UnitRef[];
  /**
   * What the component records today, per definition id. The comparison the ERP
   * value takes part in; never used to discard evidence.
   */
  currentValues?: ReadonlyMap<
    string,
    { display: string; comparable?: ComparableValue }
  >;
  /**
   * Definition codes the Data Pack expects for this part type. Corroborates the
   * mapping and is reported as a confidence reason.
   */
  expectedAttributeCodes?: readonly string[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** How one document's value relates to the agreed value. */
export const SOURCE_AGREEMENTS = [
  'AGREES',
  'CONFLICTS',
  'INCOMPARABLE',
] as const;

export type SourceAgreement = (typeof SOURCE_AGREEMENTS)[number];

/** How a document's value relates to what the ERP currently records. */
export const ERP_AGREEMENTS = [
  'AGREES',
  'CONFLICTS',
  'ABSENT',
  'INCOMPARABLE',
] as const;

export type ErpAgreement = (typeof ERP_AGREEMENTS)[number];

/** Overall state of one aggregated specification. */
export const AGGREGATE_STATES = [
  /** One value, corroborated by one or more documents. */
  'AGREED',
  /** Documents disagree; a human must adjudicate. Never applicable. */
  'CONFLICT',
  /** The component already records this value: informational. */
  'ALREADY_CURRENT',
  /** The value cannot be applied (unresolved, invalid, or ambiguous). */
  'NOT_ACTIONABLE',
] as const;

export type AggregateState = (typeof AGGREGATE_STATES)[number];

/** One document's contribution to an aggregated specification. */
export interface SpecificationSource {
  documentId: string;
  documentVersion: number;
  documentContentHash: string;
  documentFileName: string | null;
  documentType: string | null;
  /** Display form as extracted, e.g. `330Ω`. */
  display: string;
  /** Base-unit form when the value is a quantity, for the fingerprint. */
  normalized: string | null;
  agreement: SourceAgreement;
  erp: ErpAgreement;
  /** Why this source agrees, conflicts, or could not be compared. */
  detail: string | null;
}

/** A set of sources that state the same value. */
export interface SpecificationValueGroup {
  /** The representative display of the group, from its first source. */
  display: string;
  /** Base-unit form of the group's value, when it is a quantity. */
  normalized: string | null;
  /** How this group relates to the majority group. */
  agreement: SourceAgreement;
  sources: SpecificationSource[];
}

export interface AggregatedSpecification {
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  dataType: string;
  extractedCode: string;
  unitCategory: string | null;
  defaultUnit: string | null;
  state: AggregateState;
  /**
   * The value to apply, when the state is AGREED. Endpoint-shaped payload taken
   * from the agreeing sources; null for every other state.
   */
  value: unknown;
  optionCode: string | null;
  /** Display form of the agreed value. */
  display: string | null;
  /** All sources, deterministically ordered. */
  sources: SpecificationSource[];
  /** Equivalent values, grouped, largest group first. */
  groups: SpecificationValueGroup[];
  /** Deduplicated, deterministically ordered evidence across documents. */
  evidence: SpecificationEvidenceItem[];
  /** Documents that contributed evidence, agreeing or not. */
  documentCount: number;
  /** Documents that state the agreed value. Never counts a disagreement. */
  agreeingDocumentCount: number;
  /** What the component records today, for the reviewer's comparison. */
  currentValue: string | null;
  /** How the evidence relates to the recorded value. */
  erpComparison: ValueComparisonResult | null;
  erpAgreement: ErpAgreement;
  /** 0–1 aggregate confidence. */
  confidence: number;
  /** Human-readable reasons, positive then negative. Never a formula. */
  confidenceReasons: string[];
  /** Why the aggregate is not applicable, when it is not. */
  notApplicableReason: string | null;
}

// ---------------------------------------------------------------------------
// Confidence vocabulary
// ---------------------------------------------------------------------------

/**
 * Named confidence reasons.
 *
 * Exposed as strings so the API and UI share one vocabulary and a reviewer reads
 * the same sentence everywhere. Positive reasons are facts that support the
 * value, negative ones facts that count against it.
 */
export const CONFIDENCE_REASON_LABELS = {
  RESOLUTION_EXACT: 'the attribute mapping is exact',
  RESOLUTION_STRONG: 'the attribute mapping is strongly supported',
  RESOLUTION_WEAK: 'the attribute mapping is a partial match',
  VALUE_VALID: 'the value fits the attribute',
  UNIT_COMPATIBLE: 'the unit matches the attribute dimension',
  EXPECTED_BY_CATEGORY: 'the part type expects this specification',
  PRIMARY_EVIDENCE: 'a specification table states the value',
  MULTIPLE_DOCUMENTS: 'independent documents agree',
  MANY_DOCUMENTS: 'several independent documents agree',
  ERP_AGREES: 'the component already records this value',
  SOURCE_CONFLICT: 'documents disagree about the value',
  ERP_CONFLICTS: 'the component records a different value',
  CONTEXTUAL_ONLY: 'the value appears only in prose or a summary',
  INCOMPARABLE_SOURCE: 'one source could not be compared',
  LOW_EXTRACTION_CONFIDENCE: 'the extraction itself is uncertain',
} as const;

export type ConfidenceReason = keyof typeof CONFIDENCE_REASON_LABELS;

/** A confidence reason with the sign it contributes. */
export interface ConfidenceReasonEntry {
  reason: ConfidenceReason;
  label: string;
  direction: 'POSITIVE' | 'NEGATIVE';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic order for sources: document id, then version.
 *
 * Never discovery order, so a fingerprint taken over the sources cannot move
 * because a query returned rows in a different order. A *new version* of a
 * document changes the array, which is meaningful; a re-ordered response is not.
 */
function compareSourceIdentity(
  first: SpecificationSourceRef,
  second: SpecificationSourceRef,
): number {
  const byDocument = first.documentId.localeCompare(second.documentId);
  if (byDocument !== 0) return byDocument;
  return first.documentVersion - second.documentVersion;
}

/** Reads the comparable shape out of a candidate's coerced payload. */
export function comparableFromCandidate(
  candidate: Pick<
    SpecificationSourceCandidate,
    'formatted' | 'unit' | 'normalizedValue' | 'optionCode'
  >,
  dataType: string,
): ComparableValue {
  const coerced =
    candidate.normalizedValue &&
    typeof candidate.normalizedValue === 'object' &&
    !Array.isArray(candidate.normalizedValue)
      ? (candidate.normalizedValue as Record<string, unknown>)
      : null;

  return toComparableValue({
    dataType,
    coerced: {
      ...coerced,
      // The candidate's own option code is recorded alongside the payload.
      optionCode:
        candidate.optionCode ??
        (typeof coerced?.optionCode === 'string' ? coerced.optionCode : null),
    },
    display: candidate.formatted,
    unit: candidate.unit,
  });
}

/**
 * The amount of a value expressed in its unit's base unit.
 *
 * Used for the fingerprint-facing form of a source, so two sources that state
 * the same quantity in different units produce the same identity string.
 */
function baseAmountOf(
  value: ComparableValue,
  units: readonly UnitRef[],
): number | null {
  if (value.amount === null || value.amount === undefined) return null;
  const unit = findUnit(units, value.unit);
  if (!unit) return value.amount;
  const converted = toBaseUnit(unit, value.amount);
  return converted.ok ? converted.value : value.amount;
}

/** The stable, comparable form of a value, for source identity and findings. */
function normalizedFormOf(
  value: ComparableValue,
  dataType: string,
  units: readonly UnitRef[],
): string | null {
  const type = dataType.toUpperCase();
  if (type === 'SELECT') return value.optionCode ?? null;
  if (type === 'MULTI_SELECT') {
    const codes = [...(value.optionCodes ?? [])].sort();
    return codes.length > 0 ? codes.join(',') : null;
  }
  if (type === 'BOOLEAN') {
    return value.booleanValue === null || value.booleanValue === undefined
      ? null
      : String(value.booleanValue);
  }
  if (type === 'DATE') return value.dateValue?.slice(0, 10) ?? null;
  if (type === 'TEXT') return value.textValue ?? null;
  const base = baseAmountOf(value, units);
  return base === null ? null : String(Number(base));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Combines per-document candidates into one aggregate per attribute definition.
 *
 * Candidates whose attribute could not be resolved (or is ambiguous) are not
 * aggregated: there is nothing to combine them *on*, and Pass 3 already reports
 * them to the reviewer as informational. The caller counts them separately.
 */
export function aggregateSpecifications(
  input: AggregateSpecificationsInput,
): AggregatedSpecification[] {
  const definitionById = new Map(
    input.definitions.map((definition) => [definition.id, definition]),
  );
  const expected = new Set(
    (input.expectedAttributeCodes ?? []).map((code) => code.toLowerCase()),
  );

  // Group the per-document candidates by the authoritative attribute they target.
  const byDefinition = new Map<string, SpecificationSourceCandidate[]>();
  for (const candidate of input.candidates) {
    const definitionId = definitionIdOf(candidate);
    if (!definitionId || !definitionById.has(definitionId)) continue;
    const bucket = byDefinition.get(definitionId) ?? [];
    bucket.push(candidate);
    byDefinition.set(definitionId, bucket);
  }

  const aggregates: AggregatedSpecification[] = [];
  for (const [definitionId, candidates] of byDefinition) {
    const definition = definitionById.get(definitionId)!;
    aggregates.push(
      aggregateOne({
        definition,
        candidates,
        units: input.units,
        currentValue: input.currentValues?.get(definitionId) ?? null,
        expectedByCategory:
          expected.has(definition.code.toLowerCase()) ||
          expected.has(definition.id.toLowerCase()),
      }),
    );
  }

  // Deterministic output order so the caller (and the UI) never reorders.
  return aggregates.sort((first, second) =>
    first.attributeCode.localeCompare(second.attributeCode),
  );
}

/**
 * The attribute a candidate targets.
 *
 * Read from the candidate's own resolved identity, which analysis recorded. The
 * module never re-resolves, so the mapping it aggregates is exactly the mapping
 * the reviewer was shown.
 */
function definitionIdOf(
  candidate: SpecificationSourceCandidate,
): string | null {
  const explicit = candidate.attributeDefinitionId;
  return typeof explicit === 'string' && explicit.length > 0 ? explicit : null;
}

function aggregateOne(input: {
  definition: AggregatedAttributeDefinition;
  candidates: readonly SpecificationSourceCandidate[];
  units: readonly UnitRef[];
  currentValue: { display: string; comparable?: ComparableValue } | null;
  expectedByCategory: boolean;
}): AggregatedSpecification {
  const { definition, units } = input;
  const relativeTolerance = readRelativeTolerance(definition.validationRules);
  const absoluteTolerance = readAbsoluteTolerance(definition.validationRules);

  const ordered = [...input.candidates].sort(compareSourceIdentity);

  const compare = (first: ComparableValue, second: ComparableValue) =>
    compareAttributeValues({
      dataType: definition.dataType,
      unitCategory: definition.unitCategory,
      units,
      first,
      second,
      relativeTolerance,
      absoluteTolerance,
    });

  // The reference anchors "does this source agree with the rest" only. It is
  // chosen deterministically (first source by document identity) and never
  // overrules a majority: a value stated by more sources is still the majority
  // whatever the reference says.
  const reference = ordered[0]!;
  const referenceValue = comparableFromCandidate(
    reference,
    definition.dataType,
  );

  const currentComparable = input.currentValue
    ? (input.currentValue.comparable ??
      comparableFromCandidate(
        {
          formatted: input.currentValue.display,
          unit: null,
          normalizedValue: null,
          optionCode: null,
        },
        definition.dataType,
      ))
    : null;

  // Group equivalent values. Membership is decided by the semantic comparison
  // layer, so `1000 Ω` and `1 kΩ` land in the same group instead of being
  // reported as a disagreement.
  interface WorkingGroup {
    representative: ComparableValue;
    display: string;
    normalized: string | null;
    agreement: SourceAgreement;
    entries: SpecificationSource[];
  }

  const working: WorkingGroup[] = [];
  const sources: SpecificationSource[] = [];

  for (const candidate of ordered) {
    const value = comparableFromCandidate(candidate, definition.dataType);
    const normalized = normalizedFormOf(value, definition.dataType, units);

    const entry: SpecificationSource = {
      documentId: candidate.documentId,
      documentVersion: candidate.documentVersion,
      documentContentHash: candidate.documentContentHash,
      documentFileName: candidate.documentFileName,
      documentType: candidate.documentType,
      display: candidate.formatted,
      normalized,
      // Filled in once the majority value is known: agreement is a property of
      // the whole set, not of a single comparison.
      agreement: 'AGREES',
      erp: compareErp(value, currentComparable, definition, units).agreement,
      detail: null,
    };
    sources.push(entry);

    const group = working.find(
      (candidateGroup) =>
        compare(value, candidateGroup.representative).equivalent,
    );
    if (group) {
      group.entries.push(entry);
      continue;
    }
    working.push({
      representative: value,
      display: candidate.formatted,
      normalized,
      agreement: 'AGREES',
      entries: [entry],
    });
  }

  // The majority group wins deterministically: most sources first, then the
  // earliest source identity.
  const orderedGroups = [...working].sort((first, second) => {
    const bySize = second.entries.length - first.entries.length;
    if (bySize !== 0) return bySize;
    return compareSourceIdentity(first.entries[0]!, second.entries[0]!);
  });
  const majority = orderedGroups[0]!;

  // Agreement is decided against the majority value, and a source that cannot be
  // compared is neither agreement nor disagreement.
  for (const entry of sources) {
    const candidate = ordered[sources.indexOf(entry)]!;
    const value = comparableFromCandidate(candidate, definition.dataType);
    const againstMajority = compare(value, majority.representative);

    entry.agreement =
      againstMajority.result === 'INCOMPARABLE'
        ? 'INCOMPARABLE'
        : againstMajority.equivalent
          ? 'AGREES'
          : 'CONFLICTS';
    entry.detail = againstMajority.detail ?? entry.detail;
  }

  // A value only *agrees* when it is corroborated: one document stating it while
  // another states something else is a tie, not agreement, and calling either
  // side agreed would imply a majority that does not exist. Groups whose entries
  // could not be compared are excluded from the comparison — an incomparable
  // source is a gap in the evidence, not a competing claim.
  const comparableGroupSizes = orderedGroups
    .map(
      (group) =>
        group.entries.filter((entry) => entry.agreement !== 'INCOMPARABLE')
          .length,
    )
    .filter((size) => size > 0);
  const strictMajority =
    comparableGroupSizes.length <= 1 ||
    comparableGroupSizes[0]! > (comparableGroupSizes[1] ?? 0);

  if (!strictMajority) {
    for (const entry of sources) {
      if (entry.agreement === 'AGREES') entry.agreement = 'CONFLICTS';
    }
  }

  for (const group of working) {
    group.agreement = group.entries.every(
      (entry) => entry.agreement === 'AGREES',
    )
      ? 'AGREES'
      : group.entries.every((entry) => entry.agreement === 'INCOMPARABLE')
        ? 'INCOMPARABLE'
        : 'CONFLICTS';
  }

  const conflictCount = sources.filter(
    (source) => source.agreement === 'CONFLICTS',
  ).length;
  const incomparableCount = sources.filter(
    (source) => source.agreement === 'INCOMPARABLE',
  ).length;

  const evidence = normalizeEvidence(
    ordered.flatMap((candidate) => candidate.evidence),
  );
  // Counted from the sources rather than the evidence: two revisions of one
  // document are two sources but one independent document, and a source that
  // contributed no located evidence still states the value.
  const documentCount = new Set(sources.map((source) => source.documentId))
    .size;
  // Only documents that actually agree corroborate the value. A document that
  // disagrees is a counter-example, not support, and counting it would make a
  // conflict read as agreement.
  const agreeingDocumentCount = new Set(
    sources
      .filter((source) => source.agreement === 'AGREES')
      .map((source) => source.documentId),
  ).size;

  const erp = compareErp(referenceValue, currentComparable, definition, units);
  const currentValue = input.currentValue?.display ?? null;

  const validationValid = ordered.every((candidate) => candidate.applicable);
  const notApplicableReason = firstNotApplicableReason(ordered, conflictCount);

  const state: AggregateState =
    conflictCount > 0
      ? 'CONFLICT'
      : erp.agreement === 'AGREES'
        ? 'ALREADY_CURRENT'
        : notApplicableReason
          ? 'NOT_ACTIONABLE'
          : 'AGREED';

  const confidence = buildConfidence({
    conflictCount,
    incomparableCount,
    documentCount: agreeingDocumentCount,
    hasPrimary: hasPrimaryEvidence(evidence),
    expectedByCategory: input.expectedByCategory,
    erpAgreement: erp.agreement,
    resolutionConfidence: Math.min(
      ...ordered.map((candidate) => candidate.resolutionConfidence),
    ),
    extractionConfidence: Math.min(
      ...ordered.map((candidate) => candidate.extractionConfidence),
    ),
    validationValid,
  });

  return {
    attributeDefinitionId: definition.id,
    attributeCode: definition.code,
    attributeName: definition.name,
    dataType: definition.dataType,
    extractedCode: reference.extractedCode,
    unitCategory: definition.unitCategory,
    defaultUnit: definition.defaultUnit,
    state,
    value: state === 'AGREED' ? reference.normalizedValue : null,
    optionCode: state === 'AGREED' ? reference.optionCode : null,
    display: state === 'AGREED' ? reference.formatted : null,
    sources,
    groups: orderedGroups.map((group) => ({
      display: group.display,
      normalized: group.normalized,
      agreement: group.agreement,
      sources: group.entries,
    })),
    evidence,
    documentCount,
    agreeingDocumentCount,
    currentValue,
    erpComparison: erp.result,
    erpAgreement: erp.agreement,
    confidence: confidence.confidence,
    confidenceReasons: confidence.reasons.map(
      (entry) => `${entry.direction === 'POSITIVE' ? '+' : '-'} ${entry.label}`,
    ),
    notApplicableReason,
  };
}

function compareErp(
  value: ComparableValue,
  currentComparable: ComparableValue | null,
  definition: AggregatedAttributeDefinition,
  units: readonly UnitRef[],
): {
  agreement: ErpAgreement;
  result: ValueComparisonResult | null;
  detail: string | null;
} {
  if (!currentComparable) {
    return { agreement: 'ABSENT', result: null, detail: null };
  }

  const comparison = compareAttributeValues({
    dataType: definition.dataType,
    unitCategory: definition.unitCategory,
    units,
    first: value,
    second: currentComparable,
    relativeTolerance: readRelativeTolerance(definition.validationRules),
    absoluteTolerance: readAbsoluteTolerance(definition.validationRules),
  });

  if (comparison.equivalent) {
    return { agreement: 'AGREES', result: comparison.result, detail: null };
  }
  if (comparison.result === 'INCOMPARABLE') {
    return {
      agreement: 'INCOMPARABLE',
      result: comparison.result,
      detail: comparison.detail,
    };
  }
  return {
    agreement: 'CONFLICTS',
    result: comparison.result,
    detail: comparison.detail,
  };
}

function firstNotApplicableReason(
  candidates: readonly SpecificationSourceCandidate[],
  conflictCount: number,
): string | null {
  if (conflictCount > 0) {
    return 'Documents disagree about this value, so no value is offered for application.';
  }
  const blocked = candidates.find((candidate) => !candidate.applicable);
  if (!blocked) return null;
  return (
    blocked.inapplicableReason ??
    'This specification cannot be applied automatically.'
  );
}

/**
 * Aggregate confidence with its reasons.
 *
 * Every term is a deterministic fact about the evidence, and the result only
 * decides how loudly the system recommends a value — never whether a human may
 * act. The weakest source bounds the aggregate: one shaky document does not get
 * to hide behind two confident ones.
 */
function buildConfidence(input: {
  conflictCount: number;
  incomparableCount: number;
  documentCount: number;
  hasPrimary: boolean;
  expectedByCategory: boolean;
  erpAgreement: ErpAgreement;
  resolutionConfidence: number;
  extractionConfidence: number;
  validationValid: boolean;
}): { confidence: number; reasons: ConfidenceReasonEntry[] } {
  const reasons: ConfidenceReasonEntry[] = [];
  const add = (reason: ConfidenceReason, direction: 'POSITIVE' | 'NEGATIVE') =>
    reasons.push({
      reason,
      label: CONFIDENCE_REASON_LABELS[reason],
      direction,
    });

  // Mapping quality carries the most weight: an uncertain mapping makes the value
  // useless however good the extraction was.
  let score: number;
  if (input.resolutionConfidence >= 0.9) {
    score = 0.5;
    add('RESOLUTION_EXACT', 'POSITIVE');
  } else if (input.resolutionConfidence >= 0.75) {
    score = 0.4;
    add('RESOLUTION_STRONG', 'POSITIVE');
  } else {
    score = 0.2;
    add('RESOLUTION_WEAK', 'NEGATIVE');
  }

  if (input.validationValid) {
    score += 0.1;
    add('VALUE_VALID', 'POSITIVE');
  }

  if (input.hasPrimary) {
    score += 0.12;
    add('PRIMARY_EVIDENCE', 'POSITIVE');
  } else {
    score -= 0.08;
    add('CONTEXTUAL_ONLY', 'NEGATIVE');
  }

  if (input.documentCount >= 3) {
    score += 0.16;
    add('MANY_DOCUMENTS', 'POSITIVE');
  } else if (input.documentCount === 2) {
    score += 0.1;
    add('MULTIPLE_DOCUMENTS', 'POSITIVE');
  }

  if (input.expectedByCategory) {
    score += 0.06;
    add('EXPECTED_BY_CATEGORY', 'POSITIVE');
  }

  if (input.erpAgreement === 'AGREES') {
    score += 0.04;
    add('ERP_AGREES', 'POSITIVE');
  } else if (input.erpAgreement === 'CONFLICTS') {
    score -= 0.05;
    add('ERP_CONFLICTS', 'NEGATIVE');
  }

  if (input.conflictCount > 0) {
    score -= 0.2;
    add('SOURCE_CONFLICT', 'NEGATIVE');
  }

  if (input.incomparableCount > 0) {
    score -= 0.1;
    add('INCOMPARABLE_SOURCE', 'NEGATIVE');
  }

  if (input.extractionConfidence < 0.85) {
    score -= 0.05;
    add('LOW_EXTRACTION_CONFIDENCE', 'NEGATIVE');
  }

  // Non-negativity is a floor, not a target: a weak aggregate must read as weak.
  const confidence = Math.max(0, Math.min(1, score));

  // Positives first, then negatives, each in the order they were reasoned about.
  const ordered = [
    ...reasons.filter((entry) => entry.direction === 'POSITIVE'),
    ...reasons.filter((entry) => entry.direction === 'NEGATIVE'),
  ];

  return { confidence: Number(confidence.toFixed(4)), reasons: ordered };
}
