"use client";

import * as React from "react";
import {
  Sparkles,
  Check,
  AlertTriangle,
  Cpu,
  X,
  Boxes,
  Building2,
  Tag,
  HelpCircle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  mlApi,
  type ComponentSuggestionResponseDto,
  type EvidenceItemDto,
} from "@/lib/api/ml-api";

interface AiSuggestionReviewCardProps {
  suggestion: ComponentSuggestionResponseDto;
  creationContext?: Record<string, unknown>;
  onApplyAll: () => void;
  onApplyIdentity?: () => void;
  onApplyClassification?: () => void;
  onApplyNameDescription?: () => void;
  /**
   * Applies the suggested category, or — when the reviewer edited the row —
   * exactly the name they typed.
   *
   * The edited value is passed on rather than only being recorded as telemetry:
   * a custom name is the reviewer's decision, and the form is where it has to
   * end up (held as a pending category until the component is saved).
   */
  onApplyCategory?: (customName?: string) => void;
  onRejectCategory?: () => void;
  onApplyManufacturer?: (customName?: string) => void;
  onRejectManufacturer?: () => void;
  /**
   * The attribute-suggestions surface, rendered inside this card.
   *
   * It is a node rather than a set of props because the panel owns its own
   * state and eligibility rules; the card only decides where it sits — which is
   * what keeps one implementation of attribute suggestions in the product
   * instead of two that drift.
   */
  attributeSuggestionsSlot?: React.ReactNode;
  /**
   * Applies every eligible attribute suggestion through the form's attribute
   * state — the same path an individual Accept uses.
   */
  onApplySpecifications?: () => void;
  /**
   * How many attribute suggestions the bulk action can apply.
   *
   * Reported so the action states its own scope: it writes the suggestions that
   * have a value and nothing recorded, and says so rather than silently
   * skipping the rest.
   */
  specificationsAppliableCount?: number;
  /** True once every eligible suggestion has been applied. */
  specificationsApplied?: boolean;
  /**
   * Which fields the form currently holds the suggestion's value for.
   *
   * Derived by the form from the values it holds, never recorded here at click
   * time: a category change re-runs the analysis, and a field that has been
   * applied has to stay applied — the form still holds the value, so the
   * verdict is recomputed instead of being reset. A remembered marker could
   * only ever describe the analysis it was set against.
   */
  appliedFields?: Record<string, boolean>;
  onDismiss: () => void;
}

/**
 * Confirmation that a suggestion has been written into the form.
 *
 * Every apply action ends in this same indicator, so the card reads identically
 * whether the reviewer applied one field or all of them. It replaces the button
 * that was pressed — the applied state is what the reviewer needs to see, and
 * the value itself is already visible in the row above it.
 */
function AppliedIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20",
        className,
      )}
    >
      <Check className="size-3" /> Applied
    </span>
  );
}

export function AiSuggestionReviewCard({
  suggestion,
  creationContext = {},
  onApplyAll,
  onApplyIdentity,
  onApplyClassification,
  onApplyNameDescription,
  onApplyCategory,
  onRejectCategory,
  onApplyManufacturer,
  onRejectManufacturer,
  attributeSuggestionsSlot,
  onApplySpecifications,
  specificationsAppliableCount = 0,
  specificationsApplied = false,
  appliedFields = {},
  onDismiss,
}: AiSuggestionReviewCardProps) {
  // Local states for "Why?" evidence inspection
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>(
    {},
  );

  // Local states for inline editing
  const [editingCategory, setEditingCategory] = React.useState(false);
  const [categoryInput, setCategoryInput] = React.useState(
    suggestion.category?.subcategoryName ||
      suggestion.category?.categoryName ||
      "",
  );

  const [editingManufacturer, setEditingManufacturer] = React.useState(false);
  const [manufacturerInput, setManufacturerInput] = React.useState(
    suggestion.manufacturer?.manufacturerName || "",
  );

  React.useEffect(() => {
    setCategoryInput(
      suggestion.category?.subcategoryName ||
        suggestion.category?.categoryName ||
        "",
    );
    setManufacturerInput(suggestion.manufacturer?.manufacturerName || "");
    // A different suggestion starts from its own values, not the previous edit.
    setEditedCategory(null);
    setEditedManufacturer(null);
  }, [suggestion]);

  // Field dismissed / rejected state
  const [rejectedFields, setRejectedFields] = React.useState<
    Record<string, boolean>
  >({});
  /**
   * What the reviewer applied instead of the suggestion, per field.
   *
   * The row keeps showing the model's value otherwise, so a corrected category
   * looked identical to an untouched one and appeared to have been reverted. The
   * stored label is the value that was actually handed to the form.
   */
  const [editedCategory, setEditedCategory] = React.useState<string | null>(
    null,
  );
  const [editedManufacturer, setEditedManufacturer] = React.useState<
    string | null
  >(null);
  /** The suggestion this edit replaced, when the model named one. */
  const replacedCategoryName =
    suggestion.category?.subcategoryName ||
    suggestion.category?.categoryName ||
    null;

  /**
   * Whether a field has the suggestion's value in the form.
   *
   * Read from what the form holds (`appliedFields`) rather than remembered from
   * the click, so an intelligence refresh — which re-runs the analysis and hands
   * this card a new suggestion object — cannot make an applied field look
   * unapplied. A field the reviewer corrected is applied too: the form carries
   * their value, and the row says so beside the model's.
   */
  const isFieldApplied = (field: string) => {
    if (field === "specifications") return specificationsApplied;
    if (field === "category") {
      return Boolean(appliedFields.category) || editedCategory !== null;
    }
    if (field === "manufacturer") {
      return Boolean(appliedFields.manufacturer) || editedManufacturer !== null;
    }
    return Boolean(appliedFields[field]);
  };

  /**
   * The fields the suggestion actually proposes.
   *
   * A field the analysis determined nothing for has nothing to apply, so it
   * never shows an applied state and never keeps the card from reporting that
   * everything it did propose has reached the form.
   */
  const proposedFieldKeys = [
    "mpn",
    "name",
    "description",
    "category",
    "manufacturer",
  ].filter((field) =>
    field === "mpn"
      ? Boolean(suggestion.manufacturerPartNumber)
      : field === "name"
        ? Boolean(suggestion.suggestedName)
        : field === "description"
          ? Boolean(suggestion.suggestedDescription)
          : field === "category"
            ? Boolean(suggestion.category)
            : Boolean(suggestion.manufacturer),
  );
  const specificationsProposed =
    specificationsAppliableCount > 0 || specificationsApplied;
  /**
   * True once everything the card proposed is in the form.
   *
   * The specifications are one field here rather than one per attribute: they
   * are applied by the attribute-suggestions panel, which reports its own state
   * per row, so the card tracks whether the group as a whole has been applied.
   */
  const allSuggestionsApplied =
    (proposedFieldKeys.length > 0 || specificationsProposed) &&
    proposedFieldKeys.every((field) => isFieldApplied(field)) &&
    (!specificationsProposed || specificationsApplied);
  const allSpecificationsApplied = specificationsApplied;

  const toggleWhy = (fieldKey: string) => {
    setExpandedWhy((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const recordFeedbackEvent = async (
    type:
      | "CATEGORY"
      | "MANUFACTURER"
      | "ATTRIBUTE"
      | "DUPLICATE"
      | "MPN"
      | "NAME"
      | "DESCRIPTION",
    field: string,
    action: "ACCEPTED" | "REJECTED" | "EDITED",
    predicted: unknown,
    finalVal: unknown,
    confidence?: number,
    confLevel?: "HIGH" | "MEDIUM" | "LOW",
    evidence?: EvidenceItemDto[],
  ) => {
    try {
      await mlApi.recordFeedback({
        creationContext,
        items: [
          {
            suggestionType: type,
            field,
            userAction: action,
            predictedValue: predicted,
            finalValue: finalVal,
            confidence,
            confidenceLevel: confLevel,
            evidence,
          },
        ],
      });
    } catch (err) {
      console.warn("Telemetry feedback logging failed silently:", err);
    }
  };

  const handleAcceptCategory = () => {
    // Accepting the suggestion replaces any earlier correction for this field.
    setEditedCategory(null);
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "ACCEPTED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence,
    );
    onApplyCategory?.();
  };

  const handleRejectCategory = () => {
    setRejectedFields((prev) => ({ ...prev, category: true }));
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "REJECTED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      null,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence,
    );
    onRejectCategory?.();
  };

  const handleSaveEditCategory = () => {
    setEditingCategory(false);
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "EDITED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      categoryInput,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence,
    );
    // The typed value travels with the apply: recording it as feedback alone
    // left the form holding the model's suggestion instead of the reviewer's.
    const typed = categoryInput.trim();
    setEditedCategory(typed || null);
    onApplyCategory?.(typed || undefined);
  };

  const handleAcceptManufacturer = () => {
    setEditedManufacturer(null);
    recordFeedbackEvent(
      "MANUFACTURER",
      "manufacturer",
      "ACCEPTED",
      suggestion.manufacturer?.manufacturerName,
      suggestion.manufacturer?.manufacturerName,
      suggestion.manufacturer?.confidence,
      suggestion.manufacturer?.confidenceLevel,
      suggestion.manufacturer?.evidence,
    );
    onApplyManufacturer?.();
  };

  const handleRejectManufacturer = () => {
    setRejectedFields((prev) => ({ ...prev, manufacturer: true }));
    recordFeedbackEvent(
      "MANUFACTURER",
      "manufacturer",
      "REJECTED",
      suggestion.manufacturer?.manufacturerName,
      null,
      suggestion.manufacturer?.confidence,
      suggestion.manufacturer?.confidenceLevel,
      suggestion.manufacturer?.evidence,
    );
    onRejectManufacturer?.();
  };

  const handleSaveEditManufacturer = () => {
    setEditingManufacturer(false);
    recordFeedbackEvent(
      "MANUFACTURER",
      "manufacturer",
      "EDITED",
      suggestion.manufacturer?.manufacturerName,
      manufacturerInput,
      suggestion.manufacturer?.confidence,
      suggestion.manufacturer?.confidenceLevel,
      suggestion.manufacturer?.evidence,
    );
    // Same contract as the category row: the typed name is applied, not just logged.
    const typed = manufacturerInput.trim();
    setEditedManufacturer(typed || null);
    onApplyManufacturer?.(typed || undefined);
  };

  const handleAcceptAll = () => {
    // Record feedback for all items
    if (suggestion.manufacturerPartNumber) {
      recordFeedbackEvent(
        "MPN",
        "manufacturerPartNumber",
        "ACCEPTED",
        suggestion.manufacturerPartNumber,
        suggestion.manufacturerPartNumber,
        undefined,
        undefined,
        [],
      );
    }
    if (suggestion.suggestedName) {
      recordFeedbackEvent(
        "NAME",
        "name",
        "ACCEPTED",
        suggestion.suggestedName,
        suggestion.suggestedName,
      );
    }
    if (suggestion.suggestedDescription) {
      recordFeedbackEvent(
        "DESCRIPTION",
        "description",
        "ACCEPTED",
        suggestion.suggestedDescription,
        suggestion.suggestedDescription,
      );
    }
    if (
      suggestion.category &&
      !rejectedFields.category &&
      !isFieldApplied("category")
    ) {
      recordFeedbackEvent(
        "CATEGORY",
        "category",
        "ACCEPTED",
        suggestion.category.subcategoryName || suggestion.category.categoryName,
        suggestion.category.subcategoryName || suggestion.category.categoryName,
        suggestion.category.confidence,
        suggestion.category.confidenceLevel,
        suggestion.category.evidence,
      );
    }
    if (
      suggestion.manufacturer &&
      !rejectedFields.manufacturer &&
      !isFieldApplied("manufacturer")
    ) {
      recordFeedbackEvent(
        "MANUFACTURER",
        "manufacturer",
        "ACCEPTED",
        suggestion.manufacturer.manufacturerName,
        suggestion.manufacturer.manufacturerName,
        suggestion.manufacturer.confidence,
        suggestion.manufacturer.confidenceLevel,
        suggestion.manufacturer.evidence,
      );
    }
    onApplyAll();
  };

  /**
   * The identity block's grouped actions.
   *
   * Each writes a set of fields into the form and reports it, so the block
   * confirms what was applied exactly like the Category and Manufacturer rows
   * do. The feedback each one records is the same event the Apply All action
   * logs, which is what keeps the two paths equivalent for the model.
   */
  const handleApplyIdentity = () => {
    recordFeedbackEvent(
      "MPN",
      "manufacturerPartNumber",
      "ACCEPTED",
      suggestion.manufacturerPartNumber,
      suggestion.manufacturerPartNumber,
    );
    onApplyIdentity?.();
  };

  const handleApplyClassification = () => {
    // The classification IS the category suggestion: it lands in the same field
    // and shows the same applied state as the Category row's own Apply.
    setEditedCategory(null);
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "ACCEPTED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence,
    );
    onApplyClassification?.();
  };

  const handleApplyNameDescription = () => {
    if (suggestion.suggestedName) {
      recordFeedbackEvent(
        "NAME",
        "name",
        "ACCEPTED",
        suggestion.suggestedName,
        suggestion.suggestedName,
      );
    }
    if (suggestion.suggestedDescription) {
      recordFeedbackEvent(
        "DESCRIPTION",
        "description",
        "ACCEPTED",
        suggestion.suggestedDescription,
        suggestion.suggestedDescription,
      );
    }
    onApplyNameDescription?.();
  };

  const handleApplySpecifications = () => {
    // The specifications are applied by the attribute-suggestions panel through
    // the form's attribute state — the same path an individual Accept uses.
    // There is no second writer here, and the card records no per-attribute
    // feedback of its own: the panel does that for the rows it applied.
    onApplySpecifications?.();
  };

  const catConfidencePct = Math.round(
    (suggestion.category?.confidence || 0) * 100,
  );
  const mfgConfidencePct = Math.round(
    (suggestion.manufacturer?.confidence || 0) * 100,
  );

  const getStatusBadgeType = (level?: "HIGH" | "MEDIUM" | "LOW") => {
    switch (level) {
      case "HIGH":
        return "SUCCESS";
      case "MEDIUM":
        return "IN_REVIEW";
      default:
        return "DRAFT";
    }
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3.5 shadow-xs transition-all animate-in fade-in-50 duration-200">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-primary/15 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
            <Sparkles className="size-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground">
            AI Component Intelligence v2
          </span>
          <StatusBadge
            status={getStatusBadgeType(suggestion.confidenceLevel)}
            label={`${suggestion.confidenceLevel || "MEDIUM"} CONFIDENCE`}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          className="size-7 text-muted-foreground hover:text-foreground"
          title="Dismiss suggestions"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* ── Duplicate Warning Notice (if any) ──────────────────────────────── */}
      {suggestion.isDuplicate && suggestion.duplicateWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Potential Duplicate Component Detected</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
            Authoritative inventory items share identical normalized part
            numbers or specifications:
          </p>
          <div className="flex flex-wrap gap-2 pl-6 pt-1">
            {suggestion.duplicateWarnings.map((dup) => (
              <div
                key={dup.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-background/90 px-2.5 py-1 text-[11px] font-mono shadow-2xs"
              >
                <Boxes className="size-3 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-foreground">{dup.sku}</span>
                <span className="text-[10px] text-muted-foreground">
                  ({Math.round(dup.similarity * 100)}%)
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  {dup.matchType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border/80 bg-background/70 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Manufacturer Part Number
            </p>
            <p className="mt-1 font-mono text-xs font-semibold">
              {suggestion.manufacturerPartNumber || "Not identified"}
            </p>
            {isFieldApplied("mpn") && (
              <AppliedIndicator className="mt-1.5 w-fit" />
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Component Name
            </p>
            <p className="mt-1 text-xs font-semibold">
              {suggestion.suggestedName || "Not generated"}
            </p>
            {isFieldApplied("name") && (
              <AppliedIndicator className="mt-1.5 w-fit" />
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {suggestion.suggestedDescription || "Not generated"}
            </p>
            {isFieldApplied("description") && (
              <AppliedIndicator className="mt-1.5 w-fit" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          {/*
            Each handler is invoked with no arguments. Wiring one straight to
            `onClick` would hand it the click event instead, which an apply
            handler that accepts an optional value would mistake for one.
            An action that has run is replaced by its own applied state, so the
            block reports what reached the form just like the rows below do.
          */}
          {onApplyIdentity &&
            (isFieldApplied("mpn") ? (
              <AppliedIndicator />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleApplyIdentity()}
              >
                Apply Identity
              </Button>
            ))}
          {onApplyClassification &&
            (isFieldApplied("category") ? (
              <AppliedIndicator />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleApplyClassification()}
              >
                Apply Classification
              </Button>
            ))}
          {onApplySpecifications &&
            (allSpecificationsApplied ? (
              <AppliedIndicator />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={specificationsAppliableCount === 0}
                title={
                  specificationsAppliableCount === 0
                    ? "No suggestion has a value to apply yet — review the rows below."
                    : `Applies ${specificationsAppliableCount} specification suggestion${
                        specificationsAppliableCount === 1 ? "" : "s"
                      } into the attributes below`
                }
                onClick={() => handleApplySpecifications()}
              >
                Apply Specifications
              </Button>
            ))}
          {onApplyNameDescription &&
            (isFieldApplied("name") && isFieldApplied("description") ? (
              <AppliedIndicator />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleApplyNameDescription()}
              >
                Apply Name &amp; Description
              </Button>
            ))}
        </div>
      </div>

      {/*
        Specification conflicts are NOT summarised here.

        They are rendered by the attribute-suggestions panel as its "Needs
        review" group, where each one carries its own recorded value, confidence
        and the decision controls (Review suggestion / Keep current / Edit).
        A second summary listing the same conflicts in the card was the
        duplication this consolidation removes — and it could only name the
        codes, not act on them.
      */}

      {/* ── Suggestions Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
        {/* Category Suggestion */}
        {suggestion.category && !rejectedFields.category && (
          <div className="p-3 rounded-lg border border-border/80 bg-background/80 shadow-2xs flex flex-col justify-between gap-3">
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25 shrink-0">
                  <Tag className="size-3.5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </span>
              </div>

              {/* Editing mode */}
              {editingCategory ? (
                <div className="flex items-center gap-1.5 pt-1">
                  <Input
                    className="h-7 text-xs"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="Enter category name"
                  />
                  <Button
                    type="button"
                    size="xs"
                    className="h-7 px-2.5"
                    onClick={handleSaveEditCategory}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p
                    className="text-xs font-semibold text-foreground truncate"
                    title={
                      editedCategory ??
                      suggestion.category.subcategoryName ??
                      suggestion.category.categoryName
                    }
                  >
                    {editedCategory ??
                      suggestion.category.subcategoryName ??
                      suggestion.category.categoryName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {editedCategory ? (
                      <span className="inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                        {replacedCategoryName
                          ? `Edited · was ${replacedCategoryName}`
                          : "Edited"}
                      </span>
                    ) : (
                      <>
                        <span>{suggestion.category.categoryName}</span>
                        <span>•</span>
                        <StatusBadge
                          status={getStatusBadgeType(
                            suggestion.category.confidenceLevel,
                          )}
                          label={`${catConfidencePct}%`}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Why? Evidence Accordion */}
              {expandedWhy.category && (
                <div className="mt-2 pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                  <span className="font-semibold text-foreground text-[10px] uppercase tracking-wide">
                    Reasoning Evidence:
                  </span>
                  {suggestion.category.evidence &&
                  suggestion.category.evidence.length > 0 ? (
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      {suggestion.category.evidence.map((ev, i) => (
                        <li key={i} className="leading-tight">
                          <span className="font-medium text-foreground">
                            {ev.description}
                          </span>
                          {ev.source && (
                            <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                              [{ev.source}]
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Statistical n-gram text match
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions: help, edit, discard at left; apply at right */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  title="Why this category?"
                  onClick={() => toggleWhy("category")}
                >
                  <HelpCircle className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  title="Edit suggestion"
                  onClick={() => setEditingCategory(!editingCategory)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  title="Reject category"
                  onClick={handleRejectCategory}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <div>
                {isFieldApplied("category") ? (
                  <AppliedIndicator />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium px-2.5"
                    onClick={handleAcceptCategory}
                  >
                    Apply
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Manufacturer Suggestion */}
        {suggestion.manufacturer && !rejectedFields.manufacturer && (
          <div className="p-3 rounded-lg border border-border/80 bg-background/80 shadow-2xs flex flex-col justify-between gap-3">
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 shrink-0">
                  <Building2 className="size-3.5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Manufacturer
                </span>
              </div>

              {/* Editing mode */}
              {editingManufacturer ? (
                <div className="flex items-center gap-1.5 pt-1">
                  <Input
                    className="h-7 text-xs"
                    value={manufacturerInput}
                    onChange={(e) => setManufacturerInput(e.target.value)}
                    placeholder="Enter manufacturer name"
                  />
                  <Button
                    type="button"
                    size="xs"
                    className="h-7 px-2.5"
                    onClick={handleSaveEditManufacturer}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p
                    className="text-xs font-semibold text-foreground truncate"
                    title={
                      editedManufacturer ??
                      suggestion.manufacturer.manufacturerName ??
                      undefined
                    }
                  >
                    {editedManufacturer ??
                      suggestion.manufacturer.manufacturerName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {editedManufacturer ? (
                      <span className="inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                        {suggestion.manufacturer.manufacturerName
                          ? `Edited · was ${suggestion.manufacturer.manufacturerName}`
                          : "Edited"}
                      </span>
                    ) : (
                      <>
                        <span>Match: {suggestion.manufacturer.matchType}</span>
                        <span>•</span>
                        <StatusBadge
                          status={getStatusBadgeType(
                            suggestion.manufacturer.confidenceLevel,
                          )}
                          label={`${mfgConfidencePct}%`}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Why? Evidence Accordion */}
              {expandedWhy.manufacturer && (
                <div className="mt-2 pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                  <span className="font-semibold text-foreground text-[10px] uppercase tracking-wide">
                    Reasoning Evidence:
                  </span>
                  {suggestion.manufacturer.evidence &&
                  suggestion.manufacturer.evidence.length > 0 ? (
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      {suggestion.manufacturer.evidence.map((ev, i) => (
                        <li key={i} className="leading-tight">
                          <span className="font-medium text-foreground">
                            {ev.description}
                          </span>
                          {ev.source && (
                            <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                              [{ev.source}]
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Manufacturer catalog lookup
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions: help, edit, discard at left; apply at right */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  title="Why this manufacturer?"
                  onClick={() => toggleWhy("manufacturer")}
                >
                  <HelpCircle className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  title="Edit manufacturer"
                  onClick={() => setEditingManufacturer(!editingManufacturer)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  title="Reject manufacturer"
                  onClick={handleRejectManufacturer}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <div>
                {isFieldApplied("manufacturer") ? (
                  <AppliedIndicator />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium px-2.5"
                    onClick={handleAcceptManufacturer}
                  >
                    Apply
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/*
        AI Attribute Suggestions render here, inside the intelligence card.

        They used to be a second top-level card beside this one, which showed the
        same values twice: an extracted specification appeared once as a chip
        under "Extracted Specifications" and again as a suggestion row. There is
        now one attribute-suggestion surface (the Phase 3 panel) and it lives
        inside the card whose analysis produced it, so a value is shown once and
        applied through one path.

        The slot is a node rather than a set of props because the panel owns its
        own state and rules; the card only decides where it sits.
      */}
      {attributeSuggestionsSlot}

      {/* ── Footer Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-primary/15">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-background/80 px-2.5 text-[11px] font-mono text-muted-foreground border border-border">
          <Cpu className="size-3 text-primary" />
          {suggestion.isMlActive ? "Ananya ML" : "Deterministic Engine"} •{" "}
          {suggestion.executionTimeMs}ms
        </span>

        {allSuggestionsApplied ? (
          <AppliedIndicator />
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleAcceptAll}
            className="h-7 text-xs font-medium px-3 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Check className="size-3.5" />
            Apply All Suggestions
          </Button>
        )}
      </div>
    </div>
  );
}
