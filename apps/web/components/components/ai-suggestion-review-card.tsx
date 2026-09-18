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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentSuggestionResponseDto } from "@/lib/api/ml-api";

interface AiSuggestionReviewCardProps {
  suggestion: ComponentSuggestionResponseDto;
  onApplyAll: () => void;
  onApplyCategory?: () => void;
  onApplyManufacturer?: () => void;
  onApplyAttributes?: (attributes: Record<string, unknown>) => void;
  onDismiss: () => void;
}

export function AiSuggestionReviewCard({
  suggestion,
  onApplyAll,
  onApplyCategory,
  onApplyManufacturer,
  onApplyAttributes,
  onDismiss,
}: AiSuggestionReviewCardProps) {
  const catConfidencePct = Math.round((suggestion.category?.confidence || 0) * 100);
  const mfgConfidencePct = Math.round((suggestion.manufacturer?.confidence || 0) * 100);
  const attrEntries = Object.entries(suggestion.attributes || {});

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3.5 shadow-xs transition-all animate-in fade-in-50 duration-200">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-primary/15 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                AI Component Suggestions
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                <Cpu className="size-2.5 text-primary" />
                {suggestion.isMlActive ? "ananya-ml CPU" : "Deterministic Engine"} • {suggestion.executionTimeMs}ms
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={onApplyAll}
            className="h-7 text-xs font-medium px-2.5 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Check className="size-3.5" />
            Apply All
          </Button>
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
      </div>

      {/* ── Duplicate Warning Notice (if any) ──────────────────────────────── */}
      {suggestion.isDuplicate && suggestion.duplicateWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Potential Duplicate Component Detected</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
            Existing inventory items share identical normalized part numbers or specifications:
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

      {/* ── Suggestions Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
        {/* Category Suggestion */}
        {suggestion.category && (
          <div className="flex items-start justify-between p-2.5 rounded-lg border border-border/80 bg-background/70 shadow-2xs gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Tag className="size-3 text-primary" />
                <span>Suggested Category</span>
              </div>
              <p className="text-xs font-semibold text-foreground truncate">
                {suggestion.category.subcategoryName || suggestion.category.categoryName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {suggestion.category.categoryName} • {catConfidencePct}% confidence
              </p>
            </div>
            {onApplyCategory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => onApplyCategory()}
              >
                Apply
              </Button>
            )}
          </div>
        )}

        {/* Manufacturer Suggestion */}
        {suggestion.manufacturer && (
          <div className="flex items-start justify-between p-2.5 rounded-lg border border-border/80 bg-background/70 shadow-2xs gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Building2 className="size-3 text-primary" />
                <span>Resolved Manufacturer</span>
              </div>
              <p className="text-xs font-semibold text-foreground truncate">
                {suggestion.manufacturer.manufacturerName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Rule: {suggestion.manufacturer.matchType} • {mfgConfidencePct}% match
              </p>
            </div>
            {onApplyManufacturer && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => onApplyManufacturer()}
              >
                Apply
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Extracted Attributes & Specifications ─────────────────────────── */}
      {attrEntries.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="size-3 text-primary" />
              Extracted Specifications ({attrEntries.length})
            </span>
            {onApplyAttributes && (
              <button
                type="button"
                onClick={() => onApplyAttributes(suggestion.attributes)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Apply attributes only
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {attrEntries.map(([code, attr]) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 py-0.5 text-[11px] font-mono shadow-2xs text-foreground"
              >
                <span className="text-muted-foreground uppercase text-[9px]">{code}:</span>
                <span className="font-semibold">{attr.formatted}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
