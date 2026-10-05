"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SpatialGridLayout } from "@/lib/spatial/spatial-layout";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";
import { SpatialCell } from "./spatial-cell";

export interface SpatialGridProps {
  layout: SpatialGridLayout;
  stockMap: Map<string, CellStockSummary>;
  selectedLocationId: string | null;
  highlightedLocationId?: string | null;
  onSelectCell: (locationId: string) => void;
  onEnterCell?: (locationId: string) => void;
  className?: string;
}

export function SpatialGrid({
  layout,
  stockMap,
  selectedLocationId,
  highlightedLocationId,
  onSelectCell,
  onEnterCell,
  className,
}: SpatialGridProps) {
  if (layout.cells.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No child locations available to display.
      </div>
    );
  }

  return (
    // The wrapper is a scroll container, so it also clips: an outer `ring-2` on a
    // card is painted 2px outside its border box and would be sliced off at the
    // grid edges. 4px of padding gives every ring (and its pulse) room to render,
    // while the matching negative margin keeps the cards exactly where they were.
    <div className={cn("w-full overflow-x-auto p-1 pb-3 -m-1", className)}>
      {layout.type === "matrix" && layout.rows ? (
        // Matrix presentation (e.g. Row A, Row B, ...)
        <div className="flex flex-col gap-3 min-w-[500px]">
          {layout.rows.map((row) => (
            <div key={row.rowLabel} className="flex items-start gap-2.5">
              {/* Row Header Label */}
              <div className="w-12 shrink-0 pt-2 text-right">
                <span className="inline-block font-mono text-xs font-bold text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                  {row.rowLabel}
                </span>
              </div>

              {/* Row Cells */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-2">
                {row.cells.map((gridCell) => {
                  const summary = stockMap.get(gridCell.child.location.id);
                  if (!summary) return null;
                  const isSelected =
                    selectedLocationId === gridCell.child.location.id;
                  const isHighlighted =
                    highlightedLocationId === gridCell.child.location.id;

                  return (
                    <SpatialCell
                      key={gridCell.key}
                      summary={summary}
                      isSelected={isSelected}
                      isHighlighted={isHighlighted}
                      onClick={() => onSelectCell(gridCell.child.location.id)}
                      onDoubleClick={() =>
                        onEnterCell?.(gridCell.child.location.id)
                      }
                      onEnter={() => onEnterCell?.(gridCell.child.location.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Fallback / standard grid presentation
        <div
          className={cn(
            "grid gap-2 min-w-[320px]",
            "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8",
          )}
        >
          {layout.cells.map((gridCell) => {
            const summary = stockMap.get(gridCell.child.location.id);
            if (!summary) return null;
            const isSelected =
              selectedLocationId === gridCell.child.location.id;
            const isHighlighted =
              highlightedLocationId === gridCell.child.location.id;

            return (
              <SpatialCell
                key={gridCell.key}
                summary={summary}
                representation={gridCell.representation}
                isSelected={isSelected}
                isHighlighted={isHighlighted}
                onClick={() => onSelectCell(gridCell.child.location.id)}
                onDoubleClick={() => onEnterCell?.(gridCell.child.location.id)}
                onEnter={() => onEnterCell?.(gridCell.child.location.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
