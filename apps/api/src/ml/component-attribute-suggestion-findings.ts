import type { AttributeSuggestionDto } from './dtos';
import type { PersistComponentFindingInput } from './component-review-queue.service';
import type { AttributeRelevanceSourceType } from './component-attribute-relevance';

/**
 * Attribute suggestions → review-queue findings.
 *
 * The last step of the Component Intelligence attribute pipeline: what the
 * suggestion endpoint computed for the reviewer's *form* becomes reviewable
 * *work* for a reviewer who is not holding the form open.
 *
 * Two rules, and the difference between them is the whole design:
 *
 * - A suggestion the intelligence can name a **value** for becomes an
 *   `ATTRIBUTE_VALUE_SUGGESTION`, appliable through the existing
 *   component-attribute use case. Nothing is written here — the analyzer never
 *   mutates a component.
 * - A suggestion that is **relevant with no value** becomes
 *   `ATTRIBUTE_VALUE_UNKNOWN`: review-only, because there is nothing to write.
 *   It exists so an outstanding specification is visible rather than
 *   discovered by accident, and it is never a reason to invent a value.
 *
 * A suggestion whose value the component *already records equivalently* is not a
 * discrepancy and produces nothing. That is the analyzer's founding principle
 * applied here: the queue is work, not a report.
 *
 * Pure and framework-free, so the whole matrix — valued, conflicting, already
 * recorded, relevance-only, already covered, capped — is unit-testable without a
 * database.
 */

/**
 * Relevance sources strong enough to queue a "relevant, no value" finding.
 *
 * A *configured* statement — the category binds this attribute, or the Data Pack
 * expects it for this category — is a decision somebody made about this kind of
 * part, and an unset value against it is worth a reviewer's attention. A mere
 * lexical mention is not: it is a hint that helped rank a suggestion, and
 * queuing every mention would turn the queue into a firehose, which is exactly
 * what this analyzer refuses to be.
 */
const CONFIGURED_RELEVANCE_SOURCES: readonly AttributeRelevanceSourceType[] = [
  'category_binding',
  'category_binding_inherited',
  'data_pack_expectation',
];

/**
 * How many attribute findings one component may contribute per audit.
 *
 * A category with many bindings and an otherwise empty component would otherwise
 * produce one finding per binding. The cap keeps a single component from
 * dominating the queue; the strongest findings are kept, and truncation is
 * reported rather than silent.
 */
export const MAX_ATTRIBUTE_FINDINGS_PER_COMPONENT = 8;

/** Producer tag recorded on every finding this module builds. */
export const ATTRIBUTE_SUGGESTION_SOURCE = 'analyzer:attribute';

export interface BuildAttributeFindingInput {
  component: {
    id: string;
    sku: string;
    name: string;
    updatedAt: Date;
  };
  suggestions: readonly AttributeSuggestionDto[];
  /**
   * Attribute definition ids that already carry a PENDING finding for this
   * component from another producer.
   *
   * Documentation Intelligence reads a datasheet page and quotes it; when it has
   * already spoken about an attribute, its finding is the better-evidenced one
   * and this producer stays out of the way. Without this, one attribute could be
   * suggested twice from two producers and a reviewer would have to reconcile
   * them.
   */
  coveredDefinitionIds?: ReadonlySet<string>;
  intelligenceVersion: string;
  maxFindings?: number;
}

export interface AttributeFindingBuildResult {
  findings: PersistComponentFindingInput[];
  /** True when the per-component cap dropped findings. */
  truncated: boolean;
}

/** The strongest relevance evidence, for the finding's own evidence list. */
function relevanceEvidence(
  suggestion: AttributeSuggestionDto,
): Array<Record<string, unknown>> {
  return [...suggestion.relevance, ...suggestion.valueEvidence].map((item) => ({
    type: item.type,
    description: item.description,
    weight: item.weight,
    ...(item.source ? { source: item.source } : {}),
    ...(item.categoryId ? { categoryId: item.categoryId } : {}),
    ...(item.categoryName ? { categoryName: item.categoryName } : {}),
  }));
}

function hasConfiguredRelevance(suggestion: AttributeSuggestionDto): boolean {
  // The DTO types an evidence `type` as a plain string (it is stored as one), so
  // the membership test is written as a comparison against the typed vocabulary
  // rather than an `includes` on a narrowed array.
  return suggestion.relevance.some((item) =>
    CONFIGURED_RELEVANCE_SOURCES.some((source) => source === item.type),
  );
}

/**
 * The value shape the apply path reads.
 *
 * `display` is what the reviewer sees and what the applied value is labelled
 * with; `value` is the coerced payload the attribute use case accepts
 * (`readAttributeWriteInput` unwraps exactly these keys). Both come from the
 * suggestion the backend already canonicalised against the attribute
 * definition's own options, so the finding cannot carry a value the manual
 * editor could not have entered.
 */
function suggestedValuePayload(
  suggestion: AttributeSuggestionDto,
): Record<string, unknown> {
  const suggested = suggestion.suggestedValue!;
  return {
    attributeDefinitionId: suggestion.attributeDefinitionId,
    attributeCode: suggestion.code,
    attributeName: suggestion.name,
    dataType: suggestion.dataType,
    display: suggested.formatted,
    value: {
      value: suggested.value,
      ...(suggested.unit ? { unit: suggested.unit } : {}),
      ...(suggested.optionCode ? { optionCode: suggested.optionCode } : {}),
      ...(suggested.selectedOptionCodes
        ? { selectedOptionCodes: suggested.selectedOptionCodes }
        : {}),
    },
  };
}

/** The field label the queue and the feedback ledger record. */
function findingField(suggestion: AttributeSuggestionDto): string {
  return `attributes.${suggestion.code}`;
}

function buildValuedFinding(
  input: BuildAttributeFindingInput,
  suggestion: AttributeSuggestionDto,
): PersistComponentFindingInput {
  const { component, intelligenceVersion } = input;
  const existing = suggestion.existingDisplay;
  const isConflict = suggestion.conflict !== null;
  const display = suggestion.suggestedValue!.formatted;

  return {
    componentId: component.id,
    issueType: 'ATTRIBUTE_VALUE_SUGGESTION',
    issueCategory: 'ATTRIBUTE_VALUE',
    field: findingField(suggestion),
    title: isConflict
      ? `${suggestion.name} conflicts with the recorded value`
      : `${suggestion.name} suggested`,
    description: isConflict
      ? `The intelligence reads ${display} for ${suggestion.name}, but this component records "${existing}". Nothing is changed unless a reviewer applies the suggestion.`
      : `${display} was determined for ${suggestion.name} from the component's category, data or specification text. This component does not record a value for it.`,
    // The recorded value is what the apply path re-verifies before writing, so a
    // value that moved since this analysis makes the finding stale instead of
    // being overwritten.
    currentValue: {
      attributeDefinitionId: suggestion.attributeDefinitionId,
      attributeCode: suggestion.code,
      value: existing,
    },
    suggestedValue: suggestedValuePayload(suggestion),
    ...(suggestion.confidence !== null
      ? { confidence: suggestion.confidence }
      : {}),
    ...(suggestion.confidenceLevel
      ? { confidenceLevel: suggestion.confidenceLevel }
      : {}),
    evidence: relevanceEvidence(suggestion),
    source: ATTRIBUTE_SUGGESTION_SOURCE,
    intelligenceVersion,
    componentUpdatedAt: component.updatedAt,
    metadata: {
      rule: 'ATTRIBUTE_SUGGESTION',
      field: findingField(suggestion),
      attributeDefinitionId: suggestion.attributeDefinitionId,
      attributeCode: suggestion.code,
      dataType: suggestion.dataType,
      isRequired: suggestion.isRequired,
      /**
       * Read by the queue's list filter, which cannot evaluate relevance: this
       * finding has a value to write, so it is actionable.
       */
      actionable: true,
      conflict: isConflict,
      /** The relevance that established the attribute, for the detail view. */
      relevance: suggestion.relevance.map((item) => item.type),
    },
  };
}

function buildUnknownFinding(
  input: BuildAttributeFindingInput,
  suggestion: AttributeSuggestionDto,
): PersistComponentFindingInput {
  const { component, intelligenceVersion } = input;

  return {
    componentId: component.id,
    issueType: 'ATTRIBUTE_VALUE_UNKNOWN',
    issueCategory: 'ATTRIBUTE_VALUE',
    field: findingField(suggestion),
    title: `${suggestion.name} is expected but not recorded`,
    description: `${suggestion.name} is a specification of this component, and no value could be determined from the available evidence. Nothing was invented to fill it — review the component and enter the value if it is known.`,
    currentValue: {
      attributeDefinitionId: suggestion.attributeDefinitionId,
      attributeCode: suggestion.code,
      value: null,
    },
    /**
     * No suggested value, and no confidence either.
     *
     * Relevance is not a prediction: a confidence number here would be read as
     * "we think the value is X with 90% certainty", which is the one statement
     * this finding must not make.
     */
    suggestedValue: null,
    evidence: relevanceEvidence(suggestion),
    source: ATTRIBUTE_SUGGESTION_SOURCE,
    intelligenceVersion,
    componentUpdatedAt: component.updatedAt,
    metadata: {
      rule: 'ATTRIBUTE_RELEVANCE_ONLY',
      field: findingField(suggestion),
      attributeDefinitionId: suggestion.attributeDefinitionId,
      attributeCode: suggestion.code,
      dataType: suggestion.dataType,
      isRequired: suggestion.isRequired,
      // Review-only: there is no value to apply, so the queue must not offer one.
      actionable: false,
      relevance: suggestion.relevance.map((item) => item.type),
    },
  };
}

/**
 * Builds the review findings for one component's attribute suggestions.
 *
 * Ordering is deliberate: findings with a value come first, because they are the
 * actionable ones, and within each group the backend's own order is kept (bound
 * attributes in the category's order, then discovered ones strongest-first). The
 * cap therefore drops the least actionable findings, never the most.
 */
export function buildAttributeSuggestionFindings(
  input: BuildAttributeFindingInput,
): AttributeFindingBuildResult {
  const covered = input.coveredDefinitionIds ?? new Set<string>();
  const maxFindings = input.maxFindings ?? MAX_ATTRIBUTE_FINDINGS_PER_COMPONENT;

  const valued: PersistComponentFindingInput[] = [];
  const unknown: PersistComponentFindingInput[] = [];

  for (const suggestion of input.suggestions) {
    if (!suggestion.attributeDefinitionId) continue;
    if (covered.has(suggestion.attributeDefinitionId)) continue;

    if (suggestion.suggestedValue) {
      // Already recorded, and positively established as the same value: there is
      // nothing for a reviewer to decide.
      if (suggestion.existingMatches === true) continue;
      valued.push(buildValuedFinding(input, suggestion));
      continue;
    }

    // Relevance without a value. Only a *configured* expectation is worth
    // queuing, and only while the component records nothing for the attribute —
    // otherwise the value is determined and the finding would be false.
    if (suggestion.existingDisplay !== null) continue;
    if (!hasConfiguredRelevance(suggestion)) continue;
    unknown.push(buildUnknownFinding(input, suggestion));
  }

  const ordered = [...valued, ...unknown];
  const findings = ordered.slice(0, maxFindings);
  return { findings, truncated: ordered.length > findings.length };
}
