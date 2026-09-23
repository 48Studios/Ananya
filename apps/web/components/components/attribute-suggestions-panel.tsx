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
import {
  ATTRIBUTE_INTELLIGENCE_UNAVAILABLE,
  acceptUnavailableReason,
  applyActionLabel,
  attributeNameLabel,
  bulkAcceptUnavailableReason,
  confidenceText,
  describeEvidence,
  dismissActionLabel,
  emptySuggestionsMessage,
  groupAttributeSuggestions,
  groupHeading,
  primaryRelevanceReason,
  suggestedValueText,
  suggestionEvidence,
  suggestionKey,
  suggestionsForBulkAccept,
} from "@/lib/attribute-suggestions";

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
  /** Attributes the reviewer has already applied, by definition id. */
  appliedDefinitionIds?: ReadonlySet<string>;
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
  appliedDefinitionIds = new Set<string>(),
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
  const bulkEligible = suggestionsForBulkAccept(visible, appliedDefinitionIds);
  const bulkReason = bulkAcceptUnavailableReason(visible, appliedDefinitionIds);

  const toggleEvidence = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const reject = (suggestion: AttributeSuggestionDto) => {
    setRejected((prev) => ({ ...prev, [suggestionKey(suggestion)]: true }));
    onReject(suggestion);
  };

  const renderRow = (suggestion: AttributeSuggestionDto) => {
    const key = suggestionKey(suggestion);
    const state = {
      isApplied: appliedDefinitionIds.has(key),
      isMissingDefinition:
        definitionIds !== undefined && !definitionIds.has(key),
      value: suggestedValueText(suggestion),
      confidence: confidenceText(suggestion),
      reason: primaryRelevanceReason(suggestion),
      evidence: suggestionEvidence(suggestion),
      cannotApply: acceptUnavailableReason(suggestion),
      applyLabel: applyActionLabel(suggestion),
      dismissLabel: dismissActionLabel(suggestion),
      isOpen: Boolean(expanded[key]),
      isConflict: suggestion.conflict !== null,
      isRelevantOnly: suggestion.suggestedValue === null,
      matchesExisting: suggestion.existingMatches === true,
    };

    return (
      <li
        key={key}
        className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-2xs"
        data-attribute-code={suggestion.code}
        data-suggestion-state={
          state.isConflict
            ? "CONFLICT"
            : state.isRelevantOnly
              ? "RELEVANT_ONLY"
              : state.matchesExisting
                ? "MATCHES_EXISTING"
                : suggestion.existingDisplay
                  ? "UNVERIFIED_EXISTING"
                  : "SUGGESTED"
        }
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
                {suggestion.existingDisplay && (
                  <span className="text-[11px] text-muted-foreground">
                    Recorded:{" "}
                    <span className="font-mono text-foreground">
                      {suggestion.existingDisplay}
                    </span>
                  </span>
                )}
              </div>
            )}

            {state.reason && (
              <p className="text-[11px] text-muted-foreground">{state.reason}</p>
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
      className="space-y-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-2xs"
      aria-label="AI attribute suggestions"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="size-3.5" aria-hidden />
          </div>
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
        <p
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
          Analyzing component specifications…
        </p>
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
