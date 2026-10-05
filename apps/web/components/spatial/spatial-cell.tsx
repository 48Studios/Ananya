"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";

export interface SpatialCellProps {
  summary: CellStockSummary;
  isSelected?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onEnter?: () => void;
  className?: string;
}

export function SpatialCell({
  summary,
  isSelected = false,
  isHighlighted = false,
  onClick,
  onDoubleClick,
  onEnter,
  className,
}: SpatialCellProps) {
  const {
    locationCode,
    isMapped,
    hasStock,
    totalQuantity,
    distinctComponentsCount,
    components,
    directProjections,
    descendantProjections,
  } = summary;

  const hasDescendantStock = descendantProjections.length > 0;
  const isDirectOnly = directProjections.length > 0 && !hasDescendantStock;
  const isDescendantOnly = descendantProjections.length > 0 && directProjections.length === 0;

  // Single component preview
  const primaryComponent = components.length === 1 ? components[0] : null;

  const cellRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (isHighlighted && cellRef.current) {
      cellRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [isHighlighted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      if (onEnter) {
        e.preventDefault();
        e.stopPropagation();
        onEnter();
      }
    }
  };

  return (
    <button
      ref={cellRef}
      type="button"
      data-spatial-location-id={summary.locationId}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Storage location ${locationCode}, ${
        hasStock
          ? `${totalQuantity} units across ${distinctComponentsCount} items`
          : "empty"
      }, ${isMapped ? "spatially mapped" : "unmapped"}`}
      aria-pressed={isSelected}
      title={`${locationCode} - Click to select, double-click or Enter to open`}
      className={cn(
        "group relative flex flex-col justify-between text-left rounded-lg p-2.5 transition-all outline-none",
        "min-h-[82px] select-none",
        // Base border & background
        hasStock
          ? "bg-card border border-border/80 hover:border-primary/50 hover:bg-accent/40 shadow-xs"
          : "bg-muted/20 border border-dashed border-border/60 hover:border-border hover:bg-muted/40",
        // Mapped vs Unmapped visual nuance
        !isMapped && "opacity-90",
        // Selection state
        isSelected &&
          "ring-2 ring-primary border-primary bg-primary/5 hover:bg-primary/10 shadow-sm",
        // Locate Target / Highlighted state (high-visibility emerald pulse)
        isHighlighted &&
          "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/10 animate-pulse",
        className,
      )}
    >
      {/* Top Header: Code & Status Indicator */}
      <div className="flex items-center justify-between gap-1 w-full">
        <span
          className={cn(
            "font-mono text-xs font-bold tracking-tight truncate",
            hasStock ? "text-foreground" : "text-muted-foreground",
            isSelected && "text-primary",
            isHighlighted && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {locationCode}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {!isMapped && (
            <span
              title="Location has no spatial coordinates or anchor"
              className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground/80 border border-border/50"
            >
              Unmapped
            </span>
          )}
          {hasStock && (
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full shrink-0",
                isHighlighted
                  ? "bg-emerald-500"
                  : isSelected
                  ? "bg-primary"
                  : "bg-emerald-600 dark:bg-emerald-400",
              )}
            />
          )}
        </div>
      </div>

      {/* Center Body: Component SKU preview or Empty tag */}
      <div className="my-1 min-w-0 w-full">
        {hasStock ? (
          primaryComponent ? (
            <div className="truncate">
              <span className="font-mono text-[11px] font-semibold text-foreground/90 block truncate">
                {primaryComponent.sku}
              </span>
              <span className="text-[10px] text-muted-foreground block truncate">
                {primaryComponent.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-medium text-foreground/80 truncate">
              <Package className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {distinctComponentsCount} {distinctComponentsCount === 1 ? "part" : "parts"}
              </span>
            </div>
          )
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground/60 italic block">
            — Empty
          </span>
        )}
      </div>

      {/* Bottom Footer: Quantity and Direct/Descendant badge */}
      <div className="flex items-center justify-between gap-1 w-full pt-1 border-t border-border/30 text-[10px]">
        {hasStock ? (
          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 truncate">
            {totalQuantity.toLocaleString()} {primaryComponent?.unit || "pcs"}
          </span>
        ) : (
          <span className="font-mono text-muted-foreground/50">0 pcs</span>
        )}

        {/* Provenance badge */}
        {hasStock && (
          <span className="shrink-0 text-[9px] font-mono text-muted-foreground">
            {isDirectOnly ? (
              <span className="text-muted-foreground/80">Direct</span>
            ) : isDescendantOnly ? (
              <span
                className="text-amber-600 dark:text-amber-400 font-medium"
                title="Inventory is stored in nested sub-compartments"
              >
                Sub-bin
              </span>
            ) : (
              <span
                className="text-primary font-medium"
                title="Contains both direct stock and sub-compartment stock"
              >
                Mixed
              </span>
            )}
          </span>
        )}
      </div>
    </button>
  );
}
