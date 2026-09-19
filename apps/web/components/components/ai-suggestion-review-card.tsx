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
  Layers,
  HelpCircle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
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
  attributeConflicts?: Array<{ code: string; existing: string; extracted: string }>;
  onApplyCategory?: () => void;
  onRejectCategory?: () => void;
  onApplyManufacturer?: () => void;
  onRejectManufacturer?: () => void;
  onApplyAttributes?: (attributes: Record<string, unknown>) => void;
  onApplySingleAttribute?: (code: string, attr: unknown) => void;
  onRejectAttribute?: (code: string) => void;
  onDismiss: () => void;
}

export function AiSuggestionReviewCard({
  suggestion,
  creationContext = {},
  onApplyAll,
  onApplyIdentity,
  onApplyClassification,
  onApplyNameDescription,
  attributeConflicts = [],
  onApplyCategory,
  onRejectCategory,
  onApplyManufacturer,
  onRejectManufacturer,
  onApplyAttributes,
  onApplySingleAttribute,
  onRejectAttribute,
  onDismiss,
}: AiSuggestionReviewCardProps) {
  // Local states for "Why?" evidence inspection
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>({});

  // Local states for inline editing
  const [editingCategory, setEditingCategory] = React.useState(false);
  const [categoryInput, setCategoryInput] = React.useState(
    suggestion.category?.subcategoryName || suggestion.category?.categoryName || ""
  );

  const [editingManufacturer, setEditingManufacturer] = React.useState(false);
  const [manufacturerInput, setManufacturerInput] = React.useState(
    suggestion.manufacturer?.manufacturerName || ""
  );

  React.useEffect(() => {
    setCategoryInput(
      suggestion.category?.subcategoryName || suggestion.category?.categoryName || ""
    );
    setManufacturerInput(suggestion.manufacturer?.manufacturerName || "");
  }, [suggestion]);

  // Field dismissed / rejected state
  const [rejectedFields, setRejectedFields] = React.useState<Record<string, boolean>>({});
  const [acceptedFields, setAcceptedFields] = React.useState<Record<string, boolean>>({});

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
    evidence?: EvidenceItemDto[]
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
    setAcceptedFields((prev) => ({ ...prev, category: true }));
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "ACCEPTED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence
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
      suggestion.category?.evidence
    );
    onRejectCategory?.();
  };

  const handleSaveEditCategory = () => {
    setEditingCategory(false);
    setAcceptedFields((prev) => ({ ...prev, category: true }));
    recordFeedbackEvent(
      "CATEGORY",
      "category",
      "EDITED",
      suggestion.category?.subcategoryName || suggestion.category?.categoryName,
      categoryInput,
      suggestion.category?.confidence,
      suggestion.category?.confidenceLevel,
      suggestion.category?.evidence
    );
    onApplyCategory?.();
  };

  const handleAcceptManufacturer = () => {
    setAcceptedFields((prev) => ({ ...prev, manufacturer: true }));
    recordFeedbackEvent(
      "MANUFACTURER",
      "manufacturer",
      "ACCEPTED",
      suggestion.manufacturer?.manufacturerName,
      suggestion.manufacturer?.manufacturerName,
      suggestion.manufacturer?.confidence,
      suggestion.manufacturer?.confidenceLevel,
      suggestion.manufacturer?.evidence
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
      suggestion.manufacturer?.evidence
    );
    onRejectManufacturer?.();
  };

  const handleSaveEditManufacturer = () => {
    setEditingManufacturer(false);
    setAcceptedFields((prev) => ({ ...prev, manufacturer: true }));
    recordFeedbackEvent(
      "MANUFACTURER",
      "manufacturer",
      "EDITED",
      suggestion.manufacturer?.manufacturerName,
      manufacturerInput,
      suggestion.manufacturer?.confidence,
      suggestion.manufacturer?.confidenceLevel,
      suggestion.manufacturer?.evidence
    );
    onApplyManufacturer?.();
  };

  const handleAcceptSingleAttribute = (
    code: string,
    attr: { value: unknown; formatted: string; evidence?: EvidenceItemDto[] }
  ) => {
    setAcceptedFields((prev) => ({ ...prev, [`attr_${code}`]: true }));
    recordFeedbackEvent(
      "ATTRIBUTE",
      `attributes.${code}`,
      "ACCEPTED",
      attr.formatted,
      attr.formatted,
      1.0,
      "HIGH",
      attr.evidence
    );
    onApplySingleAttribute?.(code, attr.value ?? attr.formatted);
  };

  const handleRejectSingleAttribute = (
    code: string,
    attr: { value: unknown; formatted: string; evidence?: EvidenceItemDto[] }
  ) => {
    setRejectedFields((prev) => ({ ...prev, [`attr_${code}`]: true }));
    recordFeedbackEvent(
      "ATTRIBUTE",
      `attributes.${code}`,
      "REJECTED",
      attr.formatted,
      null,
      1.0,
      "HIGH",
      attr.evidence
    );
    onRejectAttribute?.(code);
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
      recordFeedbackEvent("NAME", "name", "ACCEPTED", suggestion.suggestedName, suggestion.suggestedName);
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
    if (suggestion.category && !rejectedFields.category && !acceptedFields.category) {
      recordFeedbackEvent(
        "CATEGORY",
        "category",
        "ACCEPTED",
        suggestion.category.subcategoryName || suggestion.category.categoryName,
        suggestion.category.subcategoryName || suggestion.category.categoryName,
        suggestion.category.confidence,
        suggestion.category.confidenceLevel,
        suggestion.category.evidence
      );
    }
    if (suggestion.manufacturer && !rejectedFields.manufacturer && !acceptedFields.manufacturer) {
      recordFeedbackEvent(
        "MANUFACTURER",
        "manufacturer",
        "ACCEPTED",
        suggestion.manufacturer.manufacturerName,
        suggestion.manufacturer.manufacturerName,
        suggestion.manufacturer.confidence,
        suggestion.manufacturer.confidenceLevel,
        suggestion.manufacturer.evidence
      );
    }
    for (const [code, attr] of Object.entries(suggestion.attributes || {})) {
      if (!rejectedFields[`attr_${code}`] && !acceptedFields[`attr_${code}`]) {
        recordFeedbackEvent(
          "ATTRIBUTE",
          code,
          "ACCEPTED",
          attr.value,
          attr.value,
          attr.confidence,
          attr.confidenceLevel,
          attr.evidence
        );
      }
    }
    onApplyAll();
  };

  const attrEntries = Object.entries(suggestion.attributes || {});
  const catConfidencePct = Math.round((suggestion.category?.confidence || 0) * 100);
  const mfgConfidencePct = Math.round((suggestion.manufacturer?.confidence || 0) * 100);

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
            Authoritative inventory items share identical normalized part numbers or specifications:
          </p>
          <div className="flex flex-wrap gap-2 pl-6 pt-1">
            {suggestion.duplicateWarnings.map((dup) => (
              <div
                key={dup.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-background/90 px-2.5 py-1 text-[11px] font-mono shadow-2xs"
              >
                <Boxes className="size-3 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-foreground">{dup.sku}</span>
                <span className="text-[10px] text-muted-foreground">({Math.round(dup.similarity * 100)}%)</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">{dup.matchType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border/80 bg-background/70 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manufacturer Part Number</p>
            <p className="mt-1 font-mono text-xs font-semibold">{suggestion.manufacturerPartNumber || "Not identified"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Component Name</p>
            <p className="mt-1 text-xs font-semibold">{suggestion.suggestedName || "Not generated"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{suggestion.suggestedDescription || "Not generated"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2">
          {onApplyIdentity && <Button type="button" variant="outline" size="xs" onClick={onApplyIdentity}>Apply Identity</Button>}
          {onApplyClassification && <Button type="button" variant="outline" size="xs" onClick={onApplyClassification}>Apply Classification</Button>}
          {onApplyAttributes && <Button type="button" variant="outline" size="xs" onClick={() => onApplyAttributes(suggestion.attributes)}>Apply Specifications</Button>}
          {onApplyNameDescription && <Button type="button" variant="outline" size="xs" onClick={onApplyNameDescription}>Apply Name &amp; Description</Button>}
        </div>
      </div>

      {attributeConflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Specification conflicts need review</p>
          <div className="mt-1 space-y-1">
            {attributeConflicts.map((conflict) => (
              <p key={conflict.code}>
                <span className="font-mono">{conflict.code}</span>: existing {conflict.existing}, extracted {conflict.extracted}
              </p>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Keep Existing leaves the current value unchanged. Use Extracted is available per specification below.</p>
        </div>
      )}

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
                    title={suggestion.category.subcategoryName || suggestion.category.categoryName}
                  >
                    {suggestion.category.subcategoryName || suggestion.category.categoryName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{suggestion.category.categoryName}</span>
                    <span>•</span>
                    <StatusBadge
                      status={getStatusBadgeType(suggestion.category.confidenceLevel)}
                      label={`${catConfidencePct}%`}
                    />
                  </div>
                </div>
              )}

              {/* Why? Evidence Accordion */}
              {expandedWhy.category && (
                <div className="mt-2 pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                  <span className="font-semibold text-foreground text-[10px] uppercase tracking-wide">
                    Reasoning Evidence:
                  </span>
                  {suggestion.category.evidence && suggestion.category.evidence.length > 0 ? (
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      {suggestion.category.evidence.map((ev, i) => (
                        <li key={i} className="leading-tight">
                          <span className="font-medium text-foreground">{ev.description}</span>
                          {ev.source && (
                            <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                              [{ev.source}]
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground italic">Statistical n-gram text match</p>
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
                {acceptedFields.category ? (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <Check className="size-3" /> Applied
                  </span>
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
                    title={suggestion.manufacturer.manufacturerName}
                  >
                    {suggestion.manufacturer.manufacturerName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>Match: {suggestion.manufacturer.matchType}</span>
                    <span>•</span>
                    <StatusBadge
                      status={getStatusBadgeType(suggestion.manufacturer.confidenceLevel)}
                      label={`${mfgConfidencePct}%`}
                    />
                  </div>
                </div>
              )}

              {/* Why? Evidence Accordion */}
              {expandedWhy.manufacturer && (
                <div className="mt-2 pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                  <span className="font-semibold text-foreground text-[10px] uppercase tracking-wide">
                    Reasoning Evidence:
                  </span>
                  {suggestion.manufacturer.evidence && suggestion.manufacturer.evidence.length > 0 ? (
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      {suggestion.manufacturer.evidence.map((ev, i) => (
                        <li key={i} className="leading-tight">
                          <span className="font-medium text-foreground">{ev.description}</span>
                          {ev.source && (
                            <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                              [{ev.source}]
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground italic">Manufacturer catalog lookup</p>
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
                {acceptedFields.manufacturer ? (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <Check className="size-3" /> Applied
                  </span>
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

      {/* ── Extracted Attributes & Specifications ─────────────────────────── */}
      {attrEntries.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" />
              Extracted Specifications ({attrEntries.length})
            </span>
            {onApplyAttributes && (
              <button
                type="button"
                onClick={() => onApplyAttributes(suggestion.attributes)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Apply specifications only
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {attrEntries
              .filter(([code]) => !rejectedFields[`attr_${code}`])
              .map(([code, attr]) => {
                const isAccepted = !!acceptedFields[`attr_${code}`];
                return (
                  <span
                    key={code}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-mono shadow-2xs ${isAccepted
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-border bg-background/90 text-foreground"
                      }`}
                    title={attr.evidence?.[0]?.description || `Extracted ${code}`}
                  >
                    <span className="text-muted-foreground uppercase text-[10px] tracking-wide">{code}:</span>
                    <span className="font-semibold">{attr.formatted}</span>
                    {isAccepted ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-1.5">
                        {onApplySingleAttribute && (
                          <button
                            type="button"
                            onClick={() => handleAcceptSingleAttribute(code, attr)}
                            className="hover:text-emerald-400 p-0.5 text-muted-foreground transition-colors"
                            title={`Accept ${code}`}
                          >
                            <Check className="size-3" />
                          </button>
                        )}
                        {onRejectAttribute && (
                          <button
                            type="button"
                            onClick={() => handleRejectSingleAttribute(code, attr)}
                            className="hover:text-rose-400 p-0.5 text-muted-foreground transition-colors"
                            title={`Reject ${code}`}
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Footer Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-primary/15">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-background/80 px-2.5 text-[11px] font-mono text-muted-foreground border border-border">
          <Cpu className="size-3 text-primary" />
          {suggestion.isMlActive ? "Ananya ML" : "Deterministic Engine"} • {suggestion.executionTimeMs}ms
        </span>

        <Button
          type="button"
          size="sm"
          onClick={handleAcceptAll}
          className="h-7 text-xs font-medium px-3 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Check className="size-3.5" />
          Apply All Suggestions
        </Button>
      </div>
    </div>
  );
}
