"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitCommit,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParametricCompartmentDiff } from "@ananya/inventory";
import { cn } from "@/lib/utils";

export interface ParametricDiffPanelProps {
  diff: ParametricCompartmentDiff | null;
  onCommitBaseline: () => void;
  className?: string;
}

export function ParametricDiffPanel({
  diff,
  onCommitBaseline,
  className,
}: ParametricDiffPanelProps) {
  const [showAllModified, setShowAllModified] = React.useState(false);

  if (!diff || !diff.hasChanges) {
    return (
      <div
        className={cn(
          "p-3 rounded-lg border border-border/60 bg-muted/20 text-xs flex items-center justify-between text-muted-foreground",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>No uncommitted geometric or structural changes.</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {diff?.retained.length ?? 0} slots in sync
        </span>
      </div>
    );
  }

  const {
    retained,
    added,
    removed,
    modified,
    isStructuralChange,
    meaningChangedSlots,
  } = diff;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3.5 space-y-3.5 text-xs shadow-xs",
        className,
      )}
    >
      {/* 1. Header & Quick Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <GitCommit className="size-4 text-primary" />
          <span>Configuration Changes</span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCommitBaseline}
          className="h-7 text-xs gap-1"
        >
          <RotateCcw className="size-3" />
          <span>Accept Baseline</span>
        </Button>
      </div>

      {/* 2. Structural Warning Banner */}
      {isStructuralChange && (
        <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>Structural Changes Detected</span>
          </div>
          <p className="text-[11px] leading-relaxed opacity-90">
            Compartments were added, removed, reordered, or the Builder preset
            changed. Physical items mapped to shifted or deleted slots must be
            reviewed prior to warehouse reconciliation.
          </p>
        </div>
      )}

      {/* 3. Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2 rounded bg-muted/40 border border-border/40 text-center">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">
            Retained
          </div>
          <div className="text-base font-semibold font-mono text-foreground">
            {retained.length}
          </div>
        </div>

        <div
          className={cn(
            "p-2 rounded border text-center",
            modified.length > 0
              ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
              : "bg-muted/40 border-border/40 text-muted-foreground",
          )}
        >
          <div className="text-[10px] uppercase font-medium">Modified Geo</div>
          <div className="text-base font-semibold font-mono">
            {modified.length}
          </div>
        </div>

        <div
          className={cn(
            "p-2 rounded border text-center",
            added.length > 0
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-muted/40 border-border/40 text-muted-foreground",
          )}
        >
          <div className="text-[10px] uppercase font-medium">Added</div>
          <div className="text-base font-semibold font-mono">
            +{added.length}
          </div>
        </div>

        <div
          className={cn(
            "p-2 rounded border text-center",
            removed.length > 0
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-muted/40 border-border/40 text-muted-foreground",
          )}
        >
          <div className="text-[10px] uppercase font-medium">Removed</div>
          <div className="text-base font-semibold font-mono">
            -{removed.length}
          </div>
        </div>
      </div>

      {/* 4. Detailed Meaning Changed Slots */}
      {meaningChangedSlots && meaningChangedSlots.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-semibold text-foreground flex items-center justify-between">
            <span>
              Semantic & Orientation Shifts ({meaningChangedSlots.length})
            </span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
            {meaningChangedSlots.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                className="p-1.5 rounded bg-muted/30 border border-border/40 flex items-center justify-between text-muted-foreground"
              >
                <span className="font-semibold text-foreground">
                  {item.current.code} ({item.current.slotId})
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[200px]">
                  {item.reason}
                </span>
              </div>
            ))}
            {meaningChangedSlots.length > 5 && (
              <div className="text-[10px] text-muted-foreground italic text-center pt-0.5">
                + {meaningChangedSlots.length - 5} more orientation shifts
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Geometric Delta Details (Surfaced even when isStructuralChange is false) */}
      {modified.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <div className="text-[11px] font-semibold text-foreground flex items-center justify-between">
            <span>Dimensional Resizing Delta ({modified.length})</span>
            <button
              type="button"
              onClick={() => setShowAllModified(!showAllModified)}
              className="text-[10px] text-primary hover:underline cursor-pointer"
            >
              {showAllModified ? "Collapse" : "View Details"}
            </button>
          </div>

          <div
            className={cn(
              "space-y-1 font-mono text-[11px] pr-1",
              showAllModified
                ? "max-h-48 overflow-y-auto"
                : "max-h-20 overflow-hidden",
            )}
          >
            {modified
              .slice(0, showAllModified ? undefined : 3)
              .map((item, idx) => {
                const deltaW =
                  item.current.dimensions.widthMm -
                  item.previous.dimensions.widthMm;
                const deltaH =
                  item.current.dimensions.heightMm -
                  item.previous.dimensions.heightMm;
                const deltaD =
                  item.current.dimensions.depthMm -
                  item.previous.dimensions.depthMm;

                const formatDelta = (d: number) =>
                  d === 0 ? "±0" : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);

                return (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-muted/20 border border-border/30 flex items-center justify-between"
                  >
                    <span className="font-semibold text-foreground">
                      {item.current.code}
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
                      <span>
                        {item.previous.dimensions.widthMm}×
                        {item.previous.dimensions.heightMm}×
                        {item.previous.dimensions.depthMm}mm
                      </span>
                      <span>→</span>
                      <span className="font-semibold text-foreground">
                        {item.current.dimensions.widthMm}×
                        {item.current.dimensions.heightMm}×
                        {item.current.dimensions.depthMm}mm
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        ({formatDelta(deltaW)}w, {formatDelta(deltaH)}h,{" "}
                        {formatDelta(deltaD)}d)
                      </span>
                    </div>
                  </div>
                );
              })}
            {!showAllModified && modified.length > 3 && (
              <div className="text-[10px] text-muted-foreground italic text-center pt-0.5">
                + {modified.length - 3} more modified slots (expand to view all)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
