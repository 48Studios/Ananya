import type {
  AttributeRelevanceEvidenceDto,
  AttributeSuggestionDto,
} from "./api/ml-api";
import type { UnitDto } from "./api/units-api";
import {
  formValueDisplay,
  formValueMatchesSuggestion,
  hasFormAttributeValue,
  type FormAttributeValue,
} from "./attribute-value-equivalence";
import { evidenceTypeLabel } from "./component-review-queue";
import { humanizeKey } from "./component-review-queue";

/**
 * Presentation and eligibility rules for AI attribute suggestions.
 *
 * Everything here is derived from what the backend returned. This module never
 * decides which attributes are relevant and never knows an attribute by name:
 * a new Attribute Definition in the database renders through these rules without
 * a frontend change, which is the whole point of the feature.
 *
 * Two questions are kept apart, because the backend keeps them apart:
 *
 * - **Which group does a suggestion belong to?** A valued suggestion, a
 *   conflicting one, one that already matches the record, or one that is merely
 *   relevant with no value.
 * - **May the reviewer apply it?** Only a valued suggestion with no conflict and
 *   an unapplied row qualifies, and only HIGH confidence is eligible for the
 *   bulk action.
 */

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export const ATTRIBUTE_SUGGESTION_STATES = [
  /** A canonical value the reviewer can apply. */
  "SUGGESTED",
  /** A value that disagrees with what the component records. */
  "CONFLICT",
  /** A value the component already records, so there is nothing to apply. */
  "MATCHES_EXISTING",
  /**
   * A value recorded against an attribute the comparison could not read as
   * either agreement or disagreement. Both values are shown and the reviewer
   * decides — it is deliberately not presented as a conflict.
   */
  "UNVERIFIED_EXISTING",
  /** Relevant, but no value could be determined from the evidence. */
  "RELEVANT_ONLY",
] as const;

export type AttributeSuggestionState =
  (typeof ATTRIBUTE_SUGGESTION_STATES)[number];

/**
 * Which group a suggestion belongs to.
 *
 * The conflict flag is authoritative: the backend only sets it when it could
 * positively establish that the recorded value differs (an incomparable
 * comparison is not a conflict), so it outranks the other signals. A valued
 * suggestion with a recorded value is then split by the backend's own verdict —
 * equivalent (`existingMatches: true`) means there is nothing to apply, while
 * `false` means the comparison was inconclusive and a human has to look.
 */
export function attributeSuggestionState(
  suggestion: AttributeSuggestionDto,
): AttributeSuggestionState {
  if (suggestion.conflict) return "CONFLICT";
  if (!suggestion.suggestedValue) return "RELEVANT_ONLY";
  if (suggestion.existingDisplay) {
    return suggestion.existingMatches === true
      ? "MATCHES_EXISTING"
      : "UNVERIFIED_EXISTING";
  }
  return "SUGGESTED";
}

export interface AttributeSuggestionGroups {
  /** Valued, no recorded value, no conflict: the work list. */
  suggested: AttributeSuggestionDto[];
  /** Valued and disagreeing with the record: needs a human decision. */
  conflicts: AttributeSuggestionDto[];
  /** Valued and positively equal to the record. */
  matches: AttributeSuggestionDto[];
  /** Valued, but the comparison with the record was inconclusive. */
  unverified: AttributeSuggestionDto[];
  /** Relevant with no value: shown so the reviewer knows what matters. */
  relevant: AttributeSuggestionDto[];
}

/**
 * Groups suggestions for display, conflicts first.
 *
 * Ordering within a group follows the backend's order, which already puts bound
 * attributes in the category's own order and discovered ones after them. Nothing
 * is hidden: an empty group is simply not rendered.
 */
export function groupAttributeSuggestions(
  suggestions: readonly AttributeSuggestionDto[],
): AttributeSuggestionGroups {
  const groups: AttributeSuggestionGroups = {
    suggested: [],
    conflicts: [],
    matches: [],
    unverified: [],
    relevant: [],
  };
  for (const suggestion of suggestions) {
    switch (attributeSuggestionState(suggestion)) {
      case "CONFLICT":
        groups.conflicts.push(suggestion);
        break;
      case "MATCHES_EXISTING":
        groups.matches.push(suggestion);
        break;
      case "UNVERIFIED_EXISTING":
        groups.unverified.push(suggestion);
        break;
      case "RELEVANT_ONLY":
        groups.relevant.push(suggestion);
        break;
      default:
        groups.suggested.push(suggestion);
    }
  }
  return groups;
}

/** Counts for the card's summary line. Nothing is estimated. */
export function summarizeAttributeSuggestions(
  suggestions: readonly AttributeSuggestionDto[],
): {
  total: number;
  relevant: number;
  withValues: number;
  conflicts: number;
  highConfidence: number;
} {
  const groups = groupAttributeSuggestions(suggestions);
  return {
    total: suggestions.length,
    relevant: groups.relevant.length,
    withValues:
      groups.suggested.length +
      groups.conflicts.length +
      groups.matches.length +
      groups.unverified.length,
    conflicts: groups.conflicts.length,
    highConfidence: suggestions.filter(
      (suggestion) =>
        suggestion.suggestedValue !== null &&
        suggestion.confidenceLevel === "HIGH",
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * The value as the reviewer should read it.
 *
 * `formatted` is the backend's own rendering of the canonical value (an option
 * code, or `"<amount> <unit>"` for a quantity), and it is what the manual editor
 * shows for the same value. The suggested value object is only read when the
 * backend omitted it, so the two surfaces cannot disagree.
 */
export function suggestedValueText(
  suggestion: AttributeSuggestionDto,
): string | null {
  if (!suggestion.suggestedValue) return null;
  const { formatted, unit, value } = suggestion.suggestedValue;
  if (formatted) return formatted;
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (!text) return null;
  return unit ? `${text} ${unit}` : text;
}

/**
 * Confidence as the reviewer should read it.
 *
 * The level comes from the backend (`confidenceLevel`), never recomputed here:
 * Python and the API already agree on the bands, and a third opinion in the
 * browser is how two surfaces start showing different words for one number. The
 * word is always present, so confidence is never communicated by colour alone.
 */
export function confidenceText(
  suggestion: AttributeSuggestionDto,
): string | null {
  if (suggestion.confidence === null) return null;
  const percent = `${Math.round(suggestion.confidence * 100)}%`;
  const level = suggestion.confidenceLevel;
  if (!level) return percent;
  if (level === "HIGH") return `${percent} · High confidence`;
  if (level === "MEDIUM") return `${percent} · Medium confidence`;
  return `${percent} · Low confidence`;
}

/** The recorded value, for the conflict and match lines. */
export function existingValueText(
  suggestion: AttributeSuggestionDto,
): string | null {
  return suggestion.existingDisplay;
}

/**
 * One line explaining why the attribute matters, from the strongest evidence.
 *
 * The backend orders relevance so the first entry is the strongest, and it
 * phrases it for a reviewer already ("Mounting Type is bound to Connectors").
 * Re-phrasing it here would put two descriptions of one fact in the UI.
 */
export function primaryRelevanceReason(
  suggestion: AttributeSuggestionDto,
): string | null {
  const [first] = suggestion.relevance;
  return first?.description ?? null;
}

/** The label for one evidence entry, generic across attribute types. */
export function describeEvidence(
  evidence: AttributeRelevanceEvidenceDto,
): { label: string; description: string } {
  return {
    label: evidenceTypeLabel(evidence.source ?? evidence.type),
    description: evidence.description,
  };
}

/**
 * Everything that justifies a suggestion, relevance first.
 *
 * Relevance and value evidence are the backend's own two lists; they are
 * concatenated for display because a reviewer reads one story ("this matters,
 * and here is why this value"), while the ordering keeps the reason ahead of the
 * proof.
 */
export function suggestionEvidence(
  suggestion: AttributeSuggestionDto,
): AttributeRelevanceEvidenceDto[] {
  return [...suggestion.relevance, ...suggestion.valueEvidence];
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Whether the reviewer may apply this suggestion.
 *
 * Deliberately narrow, and this is the rule the BULK action reads: a value
 * present, no conflict, and nothing already recorded. Medium and low confidence
 * are the rows most worth a human glance, and "relevant, value not determined"
 * has no value to write at all, so none of them may be swept in by one click.
 *
 * For the per-row decision see {@link canApplyIndividually}, which is broader on
 * purpose: a deliberate click on one row is a decision, not a silent sweep.
 */
export function canAcceptSuggestion(
  suggestion: AttributeSuggestionDto,
): boolean {
  return (
    suggestion.suggestedValue !== null &&
    suggestion.conflict === null &&
    suggestion.existingDisplay === null
  );
}

/**
 * Whether this single row has something to apply.
 *
 * A relevant-but-unknown attribute has no value, so it has no action at all; a
 * row whose value is *positively* already recorded has nothing to do either. A
 * conflict or an inconclusive comparison does have a value, and the reviewer may
 * choose to apply it — which is why the action is labelled "Review suggestion"
 * there and never "Accept": it is a replacement decision, not an
 * acknowledgement.
 */
export function canApplyIndividually(
  suggestion: AttributeSuggestionDto,
): boolean {
  return (
    suggestedValueText(suggestion) !== null &&
    suggestion.existingMatches !== true
  );
}

/**
 * The label for the row's apply action.
 *
 * "Accept" only where nothing is recorded and nothing disagrees; otherwise the
 * reviewer is replacing a value and the wording says so. `null` means the row
 * offers no apply action at all.
 */
export function applyActionLabel(
  suggestion: AttributeSuggestionDto,
): string | null {
  if (!canApplyIndividually(suggestion)) return null;
  return suggestion.conflict || suggestion.existingDisplay
    ? "Review suggestion"
    : "Accept";
}

/**
 * The label for the row's dismiss action.
 *
 * Where the component already records a value the reviewer is keeping *that*
 * value, and the wording follows; everywhere else the suggestion is simply
 * ignored — and nothing about the component changes either way.
 */
export function dismissActionLabel(
  suggestion: AttributeSuggestionDto,
): string {
  return suggestion.existingDisplay ? "Keep current" : "Reject";
}

/**
 * The reason an individual Apply is withheld, or null when it is offered.
 *
 * Returned as words: a suggestion the reviewer cannot apply must say why rather
 * than showing a button that does nothing or, worse, offering to overwrite a
 * value silently. When the backend withheld a value it read — an unknown unit, a
 * unit of another dimension, or a number with no unit — its own explanation is
 * the one shown, because it names the units involved.
 */
export function acceptUnavailableReason(
  suggestion: AttributeSuggestionDto,
): string | null {
  if (canApplyIndividually(suggestion)) return null;
  if (suggestion.valueWithheldReason) {
    return suggestion.valueWithheldReason;
  }
  if (suggestion.existingMatches === true) {
    return "This value is already recorded on the component.";
  }
  return "No value was determined for this specification yet.";
}

/** Whether the row positively matches what the component records. */
export function matchesExistingValue(
  suggestion: AttributeSuggestionDto,
): boolean {
  return attributeSuggestionState(suggestion) === "MATCHES_EXISTING";
}

/**
 * Whether a bulk action may write this row, given what the form already holds.
 *
 * The rule is deliberately narrow, and it is the ONE definition both bulk
 * actions read: a value present, no conflict, nothing recorded, and nothing the
 * reviewer has entered for the attribute already. That last clause is what keeps
 * one click from overwriting a correction — a value typed by hand is the
 * reviewer's intent, and a sweep is not permission to replace it.
 *
 * Named for the bulk actions that read it rather than for the row, so it cannot
 * be confused with `specification-intelligence.ts`'s per-finding rule.
 */
export function canApplySuggestionInBulk(
  suggestion: AttributeSuggestionDto,
  current: FormAttributeValue | null | undefined,
  units: readonly UnitDto[] = [],
): boolean {
  return (
    canAcceptSuggestion(suggestion) &&
    !formValueMatchesSuggestion(current, suggestion, units) &&
    !hasFormAttributeValue(current, suggestion.dataType)
  );
}

/**
 * The suggestions the bulk action may apply.
 *
 * Deliberately narrow — HIGH confidence only, a value present, no conflict,
 * nothing already recorded, and (when the form's own values are supplied) no
 * value of the reviewer's own. Medium and low confidence are the rows most worth
 * a human glance, and "relevant, value not determined" has no value to write at
 * all; none of them may be swept in by a single click. A row the reviewer
 * already applied is not offered again.
 *
 * The form's values are optional so the rule can be read against the backend's
 * verdicts alone, which is what the surface did before the form's state was
 * handed to it.
 */
export function suggestionsForBulkAccept(
  suggestions: readonly AttributeSuggestionDto[],
  appliedDefinitionIds: ReadonlySet<string>,
  currentValues?: ReadonlyMap<string, FormAttributeValue>,
  units: readonly UnitDto[] = [],
): AttributeSuggestionDto[] {
  return suggestions.filter(
    (suggestion) =>
      suggestion.confidenceLevel === "HIGH" &&
      !appliedDefinitionIds.has(suggestion.attributeDefinitionId) &&
      canApplySuggestionInBulk(
        suggestion,
        currentValues?.get(suggestion.attributeDefinitionId),
        units,
      ),
  );
}

/**
 * The reason the bulk action is unavailable, or null when it is available.
 *
 * Returned as words so a disabled button can explain itself rather than simply
 * refusing to work.
 */
export function bulkAcceptUnavailableReason(
  suggestions: readonly AttributeSuggestionDto[],
  appliedDefinitionIds: ReadonlySet<string>,
  currentValues?: ReadonlyMap<string, FormAttributeValue>,
  units: readonly UnitDto[] = [],
): string | null {
  if (
    suggestionsForBulkAccept(suggestions, appliedDefinitionIds, currentValues, units)
      .length > 0
  ) {
    return null;
  }
  if (suggestions.some((suggestion) => suggestion.conflict !== null)) {
    return "Nothing left to apply automatically — the remaining suggestions need a decision.";
  }
  // A value the reviewer has already entered — applied from this analysis or
  // typed by hand — is in the form, not waiting to be applied.
  if (
    suggestions.some(
      (suggestion) =>
        suggestion.suggestedValue !== null &&
        hasFormAttributeValue(
          currentValues?.get(suggestion.attributeDefinitionId),
          suggestion.dataType,
        ),
    )
  ) {
    return "Nothing left to apply automatically — the remaining suggestions are already in the form.";
  }
  if (
    suggestions.some(
      (suggestion) => suggestion.suggestedValue !== null && !suggestion.conflict,
    )
  ) {
    return "Only high-confidence suggestions can be applied together. Review the rest individually.";
  }
  return "None of these suggestions has a value to apply yet.";
}

// ---------------------------------------------------------------------------
// Reconciling a suggestion against the form's current state
// ---------------------------------------------------------------------------

/**
 * Every state a row can be in.
 *
 * The five the backend can report, plus the one only the form can establish:
 * `APPLIED` — the form already holds the suggested value, so there is nothing
 * left to apply.
 */
export const ATTRIBUTE_ROW_STATES = [
  "APPLIED",
  ...ATTRIBUTE_SUGGESTION_STATES,
] as const;

export type AttributeRowState =
  | "APPLIED"
  | AttributeSuggestionState;

/** One row's presentation, decided from the suggestion *and* the form value. */
export interface ReconciledAttributeSuggestion {
  state: AttributeRowState;
  /** The form already holds this value: the row offers no apply action. */
  applied: boolean;
  /** The row needs the reviewer's decision (the values disagree). */
  needsDecision: boolean;
  /** The form's own value, when the row's state is about it. */
  currentDisplay: string | null;
  /** The apply action's label, or null when the row offers no action. */
  applyLabel: string | null;
  /** Why the apply action is withheld, when it is shown disabled. */
  cannotApplyReason: string | null;
  dismissLabel: string;
}

/**
 * Decides a row from the current form value and the current suggestion.
 *
 * The form is authoritative, and this is where that is enforced: the recorded
 * value the backend compared against is the *saved* one, which stops describing
 * what the reviewer is looking at the moment they edit the field. So a form
 * value that agrees with the suggestion is applied (whatever the record says),
 * and a form value that disagrees is a conflict even when the record agrees with
 * the model — a row must never say "Matches existing" about a value the reviewer
 * has already replaced.
 *
 * Only when the form holds nothing for the attribute does the backend's own
 * verdict decide the row, which is what keeps a genuinely recorded value
 * visible as "Already recorded" and an inconclusive comparison as a question.
 */
export function reconcileAttributeSuggestion(
  suggestion: AttributeSuggestionDto,
  current: FormAttributeValue | null | undefined,
  units: readonly UnitDto[] = [],
): ReconciledAttributeSuggestion {
  const serverState = attributeSuggestionState(suggestion);
  const value = suggestedValueText(suggestion);

  // Relevant, but no value was determined: nothing to apply, and nothing the
  // form could be in conflict with.
  if (value === null) {
    return {
      state: "RELEVANT_ONLY",
      applied: false,
      needsDecision: false,
      currentDisplay: null,
      applyLabel: null,
      cannotApplyReason: acceptUnavailableReason(suggestion),
      dismissLabel: dismissActionLabel(suggestion),
    };
  }

  if (formValueMatchesSuggestion(current, suggestion, units)) {
    // The record's own "matches" verdict is kept where it applies, so a value
    // that was already there before this session is not reported as newly
    // applied; a value the form holds that the record does not is this
    // session's apply.
    return {
      state: serverState === "MATCHES_EXISTING" ? "MATCHES_EXISTING" : "APPLIED",
      applied: true,
      needsDecision: false,
      currentDisplay: formValueDisplay(current, suggestion),
      applyLabel: null,
      cannotApplyReason: null,
      dismissLabel: dismissActionLabel(suggestion),
    };
  }

  if (hasFormAttributeValue(current, suggestion.dataType)) {
    return {
      state: "CONFLICT",
      applied: false,
      needsDecision: true,
      currentDisplay: formValueDisplay(current, suggestion),
      applyLabel: "Review suggestion",
      cannotApplyReason: null,
      dismissLabel: "Keep current",
    };
  }

  const applyLabel = applyActionLabel(suggestion);
  return {
    state: serverState,
    applied: false,
    needsDecision: serverState === "CONFLICT",
    currentDisplay: null,
    applyLabel,
    cannotApplyReason: applyLabel
      ? null
      : acceptUnavailableReason(suggestion),
    dismissLabel: dismissActionLabel(suggestion),
  };
}

/**
 * The suggestions the form already holds the value of, by definition id.
 *
 * This is the applied state, and it is derived every time rather than
 * remembered: the same value survives an intelligence refresh, a category
 * re-conditioning, an edit in the attribute editor, and a reopened component,
 * because in all four cases the form still holds it. A remembered flag could
 * only ever describe the analysis it was set against.
 */
export function appliedSuggestionDefinitionIds(
  suggestions: readonly AttributeSuggestionDto[],
  currentValues: ReadonlyMap<string, FormAttributeValue>,
  units: readonly UnitDto[] = [],
): ReadonlySet<string> {
  const applied = new Set<string>();
  for (const suggestion of suggestions) {
    if (
      formValueMatchesSuggestion(
        currentValues.get(suggestion.attributeDefinitionId),
        suggestion,
        units,
      )
    ) {
      applied.add(suggestion.attributeDefinitionId);
    }
  }
  return applied;
}

/**
 * The form state one accepted suggestion writes.
 *
 * Returns the same shape the manual editor holds, so an accepted value is
 * indistinguishable from a typed one from here on: the existing Save flow
 * persists both, and no second write path exists.
 *
 * The unit comes from the backend and is never filled in here. A quantity the
 * backend resolved carries the unit it is to be recorded in — the document's own
 * unit when the attribute accepts it, the attribute's own unit when the quantity
 * was converted into it. Supplying a unit the backend did not resolve would be
 * re-interpreting the number under a different unit, which is how `10 °C` becomes
 * `10 °F`; a suggestion whose unit the backend withheld carries no value at all
 * and is not offered for apply.
 */
export function attributeValuePatch(suggestion: AttributeSuggestionDto): {
  attributeDefinitionId: string;
  value: unknown;
  unit?: string | null;
  optionCode?: string;
  selectedOptionCodes?: string[];
} | null {
  const suggested = suggestion.suggestedValue;
  if (!suggested) return null;
  const multi = suggested.selectedOptionCodes;
  return {
    attributeDefinitionId: suggestion.attributeDefinitionId,
    value: suggested.value,
    unit: suggested.unit ?? null,
    // The editor keys SELECT values by option code; the backend already
    // resolved the value to a real option of this definition.
    optionCode: suggested.optionCode,
    ...(multi && multi.length > 0 ? { selectedOptionCodes: multi } : {}),
  };
}

/**
 * Whether a suggestion's definition is still in the catalog the form holds.
 *
 * A definition can be deactivated or deleted between the analysis and the click,
 * and writing a value for it would produce a row the editor cannot render. The
 * check is by identity, so it holds for any attribute the library gains.
 */
export function suggestionResolvesToDefinition(
  suggestion: AttributeSuggestionDto,
  definitionIds: ReadonlySet<string>,
): boolean {
  return definitionIds.has(suggestion.attributeDefinitionId);
}

/** A stable identity for React keys and applied-tracking. */
export function suggestionKey(suggestion: AttributeSuggestionDto): string {
  return suggestion.attributeDefinitionId;
}

/** A human label for a group heading, with its count. */
export function groupHeading(
  group: keyof AttributeSuggestionGroups,
  count: number,
): string {
  const labels: Record<keyof AttributeSuggestionGroups, string> = {
    suggested: "Suggested values",
    conflicts: "Needs review",
    matches: "Already recorded",
    unverified: "Recorded — comparison inconclusive",
    relevant: "Relevant specifications",
  };
  return `${labels[group]} (${count})`;
}

/** The empty-state copy, which must not read like an error. */
export function emptySuggestionsMessage(hasCategory: boolean): string {
  return hasCategory
    ? "No additional attribute suggestions for this component yet."
    : "Select a category or provide more component information to see suggested specifications.";
}

/** The unavailable-state copy. The form stays fully usable. */
export const ATTRIBUTE_INTELLIGENCE_UNAVAILABLE =
  "Attribute intelligence is temporarily unavailable. Category-based specifications can still be configured manually.";

/** `operating_temp_min` → `Operating Temp Min`, for an unknown evidence source. */
export function attributeNameLabel(name: string, code: string): string {
  return name || humanizeKey(code);
}
