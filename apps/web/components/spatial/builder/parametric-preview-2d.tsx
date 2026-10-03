"use client";

import * as React from "react";
import {
  type GeneratedCompartment,
  type ParametricCompartmentDiff,
} from "@ananya/inventory";
import {
  compute2DPreviewRowGroups,
  type SlotMappingRecord,
} from "@/lib/spatial/inventory-builder-state";
import { cn } from "@/lib/utils";

export interface ParametricPreview2DProps {
  compartments: GeneratedCompartment[];
  diff: ParametricCompartmentDiff | null;
  mappings: Map<string, SlotMappingRecord>;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  className?: string;
}

export function ParametricPreview2D({
  compartments,
  diff,
  mappings,
  selectedSlotId,
  onSelectSlot,
  className,
}: ParametricPreview2DProps) {
  // Set of modified slotIds from current diff
  const modifiedSlotIds = React.useMemo(() => {
    if (!diff) return new Set<string>();
    return new Set(diff.modified.map((m) => m.current.slotId));
  }, [diff]);

  // Group compartments by logical row, sorted descending by physical Y
  const rowGroups = React.useMemo(() => {
    return compute2DPreviewRowGroups(compartments);
  }, [compartments]);

  if (compartments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-xs text-muted-foreground">
        No compartments generated. Verify configuration parameters.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full overflow-auto p-4 bg-muted/20 border border-border rounded-lg",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 min-w-[500px]">
        {rowGroups.map(({ rowIndex, cells }) => {
          const isPalletRackOrShelf =
            cells[0]?.kind === "shelf" ||
            cells[0]?.metadata?.templateType === "PALLET_RACK";
          const rowLabel = isPalletRackOrShelf ? `L${rowIndex + 1}` : `R${rowIndex + 1}`;

          return (
            <div key={rowIndex} className="flex items-start gap-2.5">
              {/* Row Identifier Sidebar */}
              <div className="w-10 shrink-0 pt-2 text-right">
                <span className="inline-block font-mono text-[11px] font-bold text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/80 border border-border/40">
                  {rowLabel}
                </span>
              </div>

              {/* Row Cells */}
              <div className="flex-1 flex flex-wrap gap-2">
                {cells.map((comp) => {
                  const isSelected = selectedSlotId === comp.slotId;
                  const mapping = mappings.get(comp.slotId);
                  const isStale = Boolean(mapping?.isStale);
                  const isMapped = Boolean(mapping && !mapping.isStale);
                  const isModified = modifiedSlotIds.has(comp.slotId);

                  return (
                    <button
                      key={comp.slotId}
                      type="button"
                      onClick={() => onSelectSlot(comp.slotId)}
                      className={cn(
                        "flex-1 min-w-[90px] max-w-[140px] p-2 rounded-md border text-left transition-all cursor-pointer select-none",
                        "focus:outline-hidden",
                        isSelected
                          ? "ring-2 ring-primary ring-offset-1 bg-card shadow-sm border-primary"
                          : "bg-card border-border hover:border-foreground/30 hover:bg-card/90",
                        isStale && !isSelected && "border-amber-500/50 bg-amber-500/10",
                        isMapped && !isSelected && "border-emerald-500/40 bg-emerald-500/5",
                        isModified && !isSelected && !isStale && "border-amber-500/40 bg-amber-500/5",
                      )}
                    >
                      {/* Code & Kind */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-xs font-bold text-foreground truncate">
                          {comp.code}
                        </span>
                        {isStale ? (
                          <span
                            className="px-1 py-0.2 rounded text-[9px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            title={mapping?.staleReason}
                          >
                            Stale
                          </span>
                        ) : isMapped ? (
                          <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            Mapped
                          </span>
                        ) : isModified ? (
                          <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Modified
                          </span>
                        ) : (
                          <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-muted text-muted-foreground">
                            Draft
                          </span>
                        )}
                      </div>

                      {/* Mapped Location Name if associated */}
                      {mapping && (
                        <div
                          className={cn(
                            "text-[10px] font-medium truncate mb-1",
                            isStale
                              ? "text-amber-800 dark:text-amber-300"
                              : "text-emerald-800 dark:text-emerald-300",
                          )}
                          title={isStale ? `Stale: ${mapping.staleReason}` : undefined}
                        >
                          ↳ {mapping.locationName} {isStale ? "⚠️" : ""}
                        </div>
                      )}

                    {/* Outer Dimensions */}
                    <div className="text-[10px] font-mono text-muted-foreground leading-tight">
                      {comp.dimensions.widthMm}×{comp.dimensions.heightMm}×{comp.dimensions.depthMm}
                    </div>

                    {/* Internal Clear Space */}
                    <div className="text-[9px] font-mono text-muted-foreground/75 truncate mt-0.5">
                      clr: {comp.clearDimensions.widthMm}×{comp.clearDimensions.heightMm}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
