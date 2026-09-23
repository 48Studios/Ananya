"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { AttributeSuggestionDto } from "@/lib/api/ml-api";
import type { UnitDto } from "@/lib/api/units-api";
import type { FormAttributeValue } from "@/lib/attribute-value-equivalence";
import {
  ATTRIBUTE_INTELLIGENCE_UNAVAILABLE,
  appliedSuggestionDefinitionIds,
  attributeNameLabel,
  bulkAcceptUnavailableReason,
  confidenceText,
  describeEvidence,
  emptySuggestionsMessage,
  groupAttributeSuggestions,
  groupHeading,
  primaryRelevanceReason,
  reconcileAttributeSuggestion,
  suggestedValueText,
  suggestionEvidence,
  suggestionKey,
  suggestionsForBulkAccept,
} from "@/lib/attribute-suggestions";

/** Stable identities for the optional props, so a default cannot churn a memo. */
const NO_CURRENT_VALUES: ReadonlyMap<string, FormAttributeValue> = new Map();
const NO_UNITS: readonly UnitDto[] = [];

/**
 * AI Attribute Suggestions.
 *
 * Renders whatever the backend judged about this component's specifications —
 * which attributes matter, which values the evidence supports, and why. The
 * panel knows no attribute by name: every row is driven by the returned
 * Attribute Definition metadata, so a definition created in the database
 * tomorrow renders here with no frontend change.
 *
 * Applying a row writes the suggested value into the same form state the manual
 * editor uses (`onApply`), which is what makes an accepted suggestion
 * indistinguishable from a typed one all the way to Save.
 */
export interface AttributeSuggestionsPanelProps {
  suggestions: AttributeSuggestionDto[];
  /** Analysis in flight: the panel keeps its shape and reports progress. */
  loading?: boolean;
  /** The intelligence call failed. The form stays fully usable. */
  unavailable?: boolean;
  /** Whether a category is established, which changes the empty-state copy. */
  hasCategory?: boolean;
  /**
   * The definitions the form currently holds, so a suggestion whose definition
   * disappeared between the analysis and the click is not applied blindly.
   */
  definitionIds?: ReadonlySet<string>;
  /**
   * The form's current attribute values, by definition id.
   *
   * This is what decides whether a row has already been applied, and whether a
   * value the reviewer typed disagrees with the suggestion. It is handed over
   * rather than summarised into a flag so the verdict is recomputed from the
   * form every time — a remembered "applied" could only ever describe the
   * analysis it was set against, and would be wrong after a refresh, a category
   * change or an edit.
   */
  currentValues?: ReadonlyMap<string, FormAttributeValue>;
  /**
   * The authoritative unit catalog, so a quantity is compared as a quantity
   * (`100 kΩ` is `100000 Ω`) instead of as two strings.
   */
  units?: readonly UnitDto[];
  /**
   * Render as a section of a parent card rather than as a card of its own.
   *
   * This panel is part of Component Intelligence, not a second intelligence
   * surface: inside the intelligence card it contributes a heading, the
   * statistics and the rows, while the card keeps its own frame. The two
   * variants differ in chrome only — never in behaviour, which is why the
   * rules stay in `lib/attribute-suggestions.ts` rather than here.
   */
  embedded?: boolean;
  onApply: (suggestion: AttributeSuggestionDto) => void;
  onEdit: (suggestion: AttributeSuggestionDto) => void;
  onReject: (suggestion: AttributeSuggestionDto) => void;
  onAcceptAll?: (suggestions: AttributeSuggestionDto[]) => void;
}

const CHIP =
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium";

export function AttributeSuggestionsPanel({
  suggestions,
  loading = false,
  unavailable = false,
  hasCategory = false,
  definitionIds,
  currentValues = NO_CURRENT_VALUES,
  units = NO_UNITS,
  embedded = false,
  onApply,
  onEdit,
  onReject,
  onAcceptAll,
}: AttributeSuggestionsPanelProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [rejected, setRejected] = React.useState<Record<string, boolean>>({});

  // A rejection belongs to the analysis it was made against: a fresh analysis
  // must not keep hiding a row the reviewer has not seen yet.
  const suggestionSignature = suggestions
    .map((suggestion) => suggestionKey(suggestion))
    .join(",");
  React.useEffect(() => {
    setRejected({});
    setExpanded({});
  }, [suggestionSignature]);

  const visible = suggestions.filter(
    (suggestion) => !rejected[suggestionKey(suggestion)],
  );
  const groups = groupAttributeSuggestions(visible);
  /**
   * The rows the form already holds the value of.
   *
   * Derived from the form state on every render, never remembered: this is the
   * same set the form itself computes for its own actions, from the same rule.
   */
  const appliedDefinitionIds = React.useMemo(
    () => appliedSuggestionDefinitionIds(suggestions, currentValues, units),
    [suggestions, currentValues, units],
  );
  const bulkEligible = suggestionsForBulkAccept(
    visible,
    appliedDefinitionIds,
    currentValues,
    units,
  );
  const bulkReason = bulkAcceptUnavailableReason(
    visible,
    appliedDefinitionIds,
    currentValues,
    units,
  );

  const toggleEvidence = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const reject = (suggestion: AttributeSuggestionDto) => {
    setRejected((prev) => ({ ...prev, [suggestionKey(suggestion)]: true }));
    onReject(suggestion);
  };

  const renderRow = (suggestion: AttributeSuggestionDto) => {
    const key = suggestionKey(suggestion);
    /**
     * The row's verdict, from the suggestion and the form's current value.
     *
     * The form outranks the backend's recorded-value verdict here, because the
     * record is the *saved* value: once the reviewer edits the field, a
     * "matches existing" reading describes a value that is no longer on screen.
     */
    const reconciled = reconcileAttributeSuggestion(
      suggestion,
      currentValues.get(key),
      units,
    );
    const state = {
      isApplied: reconciled.applied,
      isMissingDefinition:
        definitionIds !== undefined && !definitionIds.has(key),
      value: suggestedValueText(suggestion),
      confidence: confidenceText(suggestion),
      reason: primaryRelevanceReason(suggestion),
      evidence: suggestionEvidence(suggestion),
      cannotApply: reconciled.cannotApplyReason,
      applyLabel: reconciled.applyLabel,
      dismissLabel: reconciled.dismissLabel,
      isOpen: Boolean(expanded[key]),
      isConflict: reconciled.needsDecision,
      isRelevantOnly: suggestion.suggestedValue === null,
      matchesExisting: reconciled.state === "MATCHES_EXISTING",
      currentDisplay: reconciled.currentDisplay,
      reconciledState: reconciled.state,
    };

    return (
      <li
        key={key}
        className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-2xs"
        data-attribute-code={suggestion.code}
        data-suggestion-state={state.reconciledState}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-foreground">
                {attributeNameLabel(suggestion.name, suggestion.code)}
              </span>
              {suggestion.isRequired && (
                <span
                  className="text-[10px] font-semibold text-destructive"
                  title="Required for this category"
                >
                  Required
                </span>
              )}
              {state.matchesExisting && (
                <span
                  className={cn(
                    CHIP,
                    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <Check className="size-2.5" aria-hidden />
                  Matches existing value
                </span>
              )}
              {state.isConflict && (
                <span
                  className={cn(
                    CHIP,
                    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  )}
                >
                  <AlertTriangle className="size-2.5" aria-hidden />
                  Conflict
                </span>
              )}
              {state.isApplied && (
                <span
                  className={cn(
                    CHIP,
                    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <Check className="size-2.5" aria-hidden />
                  Applied
                </span>
              )}
            </div>

            {state.isRelevantOnly ? (
              <p className="text-xs text-muted-foreground">
                Relevant to this component ·{" "}
                <span className="italic">value not determined</span>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {state.value}
                </span>
                {state.confidence && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StatusBadge
                      status={
                        suggestion.confidenceLevel === "HIGH"
                          ? "SUCCESS"
                          : suggestion.confidenceLevel === "LOW"
                            ? "DRAFT"
                            : "IN_REVIEW"
                      }
                      label={suggestion.confidenceLevel ?? "MEDIUM"}
                    />
                    {state.confidence}
                  </span>
                )}
                {/*
                  A conflict is stated against the value the reviewer is
                  actually looking at. The backend's recorded value describes
                  what was saved, so it is only shown while the form holds
                  nothing for this attribute — once the field has a value of its
                  own, that value is the current one and the saved one is a
                  stale reading that must not be presented as the state of the
                  component.
                */}
                {state.isConflict && state.currentDisplay ? (
                  <span className="text-[11px] text-muted-foreground">
                    Current:{" "}
                    <span className="font-mono text-foreground">
                      {state.currentDisplay}
                    </span>
                  </span>
                ) : (
                  !state.currentDisplay &&
                  suggestion.existingDisplay && (
                    <span className="text-[11px] text-muted-foreground">
                      Recorded:{" "}
                      <span className="font-mono text-foreground">
                        {suggestion.existingDisplay}
                      </span>
                    </span>
                  )
                )}
              </div>
            )}

            {state.reason && (
              <p className="text-[11px] text-muted-foreground">{state.reason}</p>
            )}
            {/*
              A value the backend read but withheld is not the same as one it
              never determined: the reason names the units involved (an unknown
              unit, or one of another dimension), so it is shown rather than
              leaving the reviewer to wonder why the row has nothing to apply.
            */}
            {state.isRelevantOnly && suggestion.valueWithheldReason && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {suggestion.valueWithheldReason}
              </p>
            )}
            {state.isMissingDefinition && (
              <p className="text-[11px] text-muted-foreground">
                This specification is no longer in the attribute library, so it
                cannot be applied.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {/*
              An apply action exists only where there is something to apply. A
              relevant-but-unknown attribute has no value and a row that already
              matches the record has nothing to do, so neither shows an action —
              presenting relevance as if it were a prediction is the one thing
              this panel must never do. A conflict or an inconclusive comparison
              does have a value and the reviewer may choose it, which is why the
              label there is "Review suggestion" rather than "Accept".
            */}
            {!state.isApplied &&
              !state.isMissingDefinition &&
              state.applyLabel && (
                <Button
                  type="button"
                  size="sm"
                  variant={state.cannotApply ? "outline" : "default"}
                  className="h-7 px-2 text-[11px]"
                  disabled={state.cannotApply !== null}
                  title={state.cannotApply ?? `Apply ${state.value}`}
                  onClick={() => onApply(suggestion)}
                >
                  {state.applyLabel}
                </Button>
              )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onEdit(suggestion)}
              title="Edit this specification in the attribute editor"
            >
              <Pencil className="size-3" aria-hidden />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => reject(suggestion)}
              title="Ignore this suggestion — nothing about the component is changed"
            >
              <X className="size-3" aria-hidden />
              {state.dismissLabel}
            </Button>
            {state.evidence.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                aria-expanded={state.isOpen}
                onClick={() => toggleEvidence(key)}
              >
                <HelpCircle className="size-3" aria-hidden />
                Evidence
                {state.isOpen ? (
                  <ChevronDown className="size-3" aria-hidden />
                ) : (
                  <ChevronRight className="size-3" aria-hidden />
                )}
              </Button>
            )}
          </div>
        </div>

        {state.isOpen && (
          <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Evidence
            </p>
            <ul className="space-y-1.5">
              {state.evidence.map((item, index) => {
                const described = describeEvidence(item);
                return (
                  <li
                    key={`${item.source ?? item.type}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]"
                  >
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Check className="size-3 text-primary" aria-hidden />
                      {described.label}
                    </span>
                    <span className="text-foreground">
                      {described.description}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </li>
    );
  };

  const isEmpty = visible.length === 0;

  /**
   * The section's one-line status.
   *
   * An empty result is not a failure and a failure is not an empty result, so
   * the two never share wording: a header that said "no suggestions" beside a
   * body that said "unavailable" would be claiming a fact the analysis never
   * established.
   */
  const statusLine = unavailable
    ? "Analysis unavailable"
    : loading
      ? "Analyzing component specifications…"
      : isEmpty
        ? emptySuggestionsMessage(hasCategory)
        : `${visible.length} relevant · ${
            groups.suggested.length +
            groups.conflicts.length +
            groups.matches.length +
            groups.unverified.length
          } with a value · ${groups.conflicts.length} conflict${
            groups.conflicts.length === 1 ? "" : "s"
          }`;

  return (
    <section
      className={cn(
        "space-y-2.5",
        embedded
          ? // A section of the intelligence card: a rule separates it, and the
            // card keeps its own frame, padding and background.
            "border-t border-primary/15 pt-3"
          : "rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-2xs",
      )}
      aria-label="AI attribute suggestions"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className={embedded ? "min-w-0" : "flex items-start gap-2.5"}>
          {!embedded && (
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="size-3.5" aria-hidden />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-foreground">
              AI Attribute Suggestions
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {statusLine}
            </p>
          </div>
        </div>

        {!isEmpty && onAcceptAll && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 border-primary/30 bg-background/80 px-2.5 text-[11px] text-primary hover:bg-primary/10"
            disabled={bulkEligible.length === 0}
            title={
              bulkReason ??
              `Apply ${bulkEligible.length} high-confidence suggestion${
                bulkEligible.length === 1 ? "" : "s"
              }`
            }
            onClick={() => onAcceptAll(bulkEligible)}
          >
            <ShieldCheck className="size-3" aria-hidden />
            Accept {bulkEligible.length} high-confidence
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-2" role="status">
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
            Analyzing component specifications…
          </p>
          {/*
            Placeholder rows rather than a bare spinner: the section keeps its
            shape while the analysis runs, so the form does not jump when the
            results arrive, and the reviewer can see what is coming.
          */}
          <ul className="space-y-1.5" aria-hidden>
            {[0, 1].map((index) => (
              <li
                key={index}
                className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-32 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted/70" />
                  </div>
                  <div className="h-6 w-24 rounded bg-muted/60" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unavailable && (
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-amber-500"
            aria-hidden
          />
          {ATTRIBUTE_INTELLIGENCE_UNAVAILABLE}
        </p>
      )}

      {isEmpty && !loading && !unavailable && (
        <p className="text-[11px] text-muted-foreground">
          Nothing to apply yet — specifications can still be entered by hand
          below.
        </p>
      )}

      {(["conflicts", "suggested", "unverified", "matches", "relevant"] as const).map(
        (group) =>
          groups[group].length > 0 && (
            <div key={group} className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                {groupHeading(group, groups[group].length)}
              </p>
              {group === "conflicts" && (
                <p className="text-[11px] text-muted-foreground">
                  The recorded value is kept unless you apply the suggestion.
                </p>
              )}
              <ul className="space-y-1.5">
                {groups[group].map((suggestion) => renderRow(suggestion))}
              </ul>
            </div>
          ),
      )}
    </section>
  );
}
