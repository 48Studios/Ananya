"use client";

import * as React from "react";
import Link from "next/link";
import {
  X,
  ExternalLink,
  MapPin,
  CheckCircle2,
  ArrowRight,
  CornerDownRight,
  Lock,
  GitFork,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailChip } from "@/components/ui/detail-field";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";
import type { LocationOperationalViewChildDto } from "@/lib/api/spatial-api";

export interface SpatialInspectorProps {
  summary: CellStockSummary | null;
  childDto: LocationOperationalViewChildDto | null;
  focusComponentId?: string;
  onClose: () => void;
  onEnterLocation?: (locationId: string) => void;
  className?: string;
}

export function SpatialInspector({
  summary,
  childDto,
  focusComponentId,
  onClose,
  onEnterLocation,
  className,
}: SpatialInspectorProps) {
  const { hasPermission } = useAuth();
  const canReadInventory = hasPermission("Inventory.Read");

  // The inspector instance is reused across selections, so the body is rewound
  // explicitly instead of remounting the whole panel on every selection.
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const summaryLocationId = summary?.locationId ?? null;
  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [summaryLocationId]);

  if (!summary || !childDto) return null;

  const {
    locationCode,
    locationName,
    isMapped,
    components,
    directComponentCount,
    descendantComponentCount,
    directUnitsBreakdown,
    descendantUnitsBreakdown,
    provenanceStatus,
    capacity,
    capacityUnit,
    fillRatio,
    occupancyLevel,
  } = summary;

  return (
    <div
      className={cn(
        // Fills the positioning wrapper: the header stays pinned while the body
        // owns the single scroll container. `overflow-hidden` + `min-h-0` keep
        // long content inside the panel instead of leaking a horizontal bar.
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-sm backdrop-blur-md transition-all",
        className,
      )}
    >
      {/* Header: stays visible while the body scrolls. The identity row owns
          the full width, so a long code/name truncates instead of painting over
          the actions, which sit on their own row below. */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className="min-w-0 max-w-full truncate font-mono text-sm font-bold uppercase tracking-tight text-foreground"
            title={locationCode}
          >
            {locationCode}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={locationName}
          >
            {locationName}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isMapped ? (
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle2 className="size-3 shrink-0" />
                <span
                  className="min-w-0 truncate"
                  title={
                    childDto.anchor
                      ? `Anchor: ${childDto.anchor.code}`
                      : childDto.model
                        ? `Model: ${childDto.model.code}`
                        : "Mapped"
                  }
                >
                  {childDto.anchor
                    ? `Anchor: ${childDto.anchor.code}`
                    : childDto.model
                      ? `Model: ${childDto.model.code}`
                      : "Mapped"}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                Unmapped
              </span>
            )}

            <DetailChip className="capitalize text-[11px]">
              {childDto.location.kind}
            </DetailChip>

            {/* Provenance Badge */}
            {provenanceStatus === "direct-only" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-sky-700 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                <GitFork className="size-2.5" />
                Direct Only
              </span>
            )}
            {provenanceStatus === "descendant-only" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-purple-700 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                <GitFork className="size-2.5" />
                Sub-compartments
              </span>
            )}
            {provenanceStatus === "mixed" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                <GitFork className="size-2.5" />
                Mixed Stock
              </span>
            )}
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Link href={`/inventory/locations/${summary.locationId}`}>
            <Button
              variant="outline"
              size="xs"
              className="gap-1 font-mono text-xs"
              title={`View details and inventory for ${locationCode}`}
              aria-label={`View details for ${locationCode}`}
            >
              <span>Details</span>
              <ArrowRight className="size-3" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => {
              // Never let a dismissal bubble into a card/canvas selection
              // handler sitting underneath the non-modal inspector.
              event.stopPropagation();
              onClose();
            }}
            aria-label="Close inspector (Esc)"
            title="Close inspector (Esc)"
            className="size-7"
          >
            <X className="size-4" />
          </Button>
          </div>
        </div>
      </div>

      {/* Body: the single scroll container for every detail section. */}
      <div
        ref={bodyRef}
        data-testid="spatial-inspector-body"
        className="min-h-0 flex-1 space-y-3.5 overflow-x-hidden overflow-y-auto px-4 py-3.5"
      >

      {/* Stock Provenance Breakdown (Unit-Safe) */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0 rounded-lg bg-muted/30 border border-border/40 p-2.5 space-y-1">
          <span className="text-[11px] font-medium text-sky-700 dark:text-sky-400 flex items-center gap-1">
            <span>Direct Stock</span>
          </span>
          <div className="min-w-0 break-words font-mono font-semibold text-foreground text-xs leading-snug">
            {canReadInventory ? (
              directUnitsBreakdown || <span className="text-muted-foreground italic">0</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                <Lock className="size-3" />
                Protected
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {directComponentCount} {directComponentCount === 1 ? "component" : "components"} directly at this level
          </span>
        </div>

        <div className="min-w-0 rounded-lg bg-muted/30 border border-border/40 p-2.5 space-y-1">
          <span className="text-[11px] font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
            <span>Sub-compartment Stock</span>
          </span>
          <div className="min-w-0 break-words font-mono font-semibold text-foreground text-xs leading-snug">
            {canReadInventory ? (
              descendantUnitsBreakdown || <span className="text-muted-foreground italic">0</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                <Lock className="size-3" />
                Protected
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {descendantComponentCount} {descendantComponentCount === 1 ? "component" : "components"} in child compartments
          </span>
        </div>
      </div>

      {/* Physical Capacity / Occupancy HUD */}
      <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50 text-xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
            <Gauge className="size-3 shrink-0 text-muted-foreground" />
            Physical Capacity:
          </span>
          <span className="min-w-0 break-words text-right font-mono font-medium text-foreground">
            {capacity !== null && capacity !== undefined ? (
              `${capacity.toLocaleString()} ${capacityUnit || "units"}`
            ) : (
              <span className="text-muted-foreground italic">Unspecified (Not Configured)</span>
            )}
          </span>
        </div>

        {capacity !== null && capacity !== undefined && fillRatio !== null ? (
          <div className="space-y-1">
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  occupancyLevel === "over-capacity"
                    ? "bg-rose-500"
                    : occupancyLevel === "high"
                    ? "bg-amber-500"
                    : occupancyLevel === "moderate"
                    ? "bg-sky-500"
                    : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, Math.round(fillRatio * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Occupancy: {Math.round(fillRatio * 100)}%</span>
              <span className="capitalize">{occupancyLevel?.replace("-", " ")}</span>
            </div>
          </div>
        ) : capacity !== null && capacity !== undefined && !capacityUnit ? (
          <div className="text-[10px] text-amber-700 dark:text-amber-400/90 italic">
            Capacity unit is not configured. Displaying inventory presence without percentage.
          </div>
        ) : capacity !== null && capacity !== undefined && summary.hasStock ? (
          <div className="text-[10px] text-amber-700 dark:text-amber-400/90 italic">
            Stock measure is incompatible with configured capacity unit ({capacityUnit}). Displaying presence without percentage.
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground/80 italic">
            Physical capacity is not inferred from 3D model dimensions without explicit location configuration.
          </div>
        )}
      </div>

      {/* Component Inventory List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Stored Components ({components.length})</span>
          {!canReadInventory && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              Quantities Redacted
            </span>
          )}
        </div>

        {components.length > 0 ? (
          <div className="min-w-0 space-y-1.5 divide-y divide-border/30">
            {components.map((item) => {
              const isTarget = item.componentId === focusComponentId;
              return (
                <div
                  key={`${item.componentId}-${item.subLocationId || "direct"}`}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded px-1.5 py-1 pt-1.5 first:pt-0 transition-colors",
                    isTarget &&
                      "bg-emerald-500/15 border border-emerald-500/30",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/inventory/components/${item.componentId}`}
                        className="flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        <span className="truncate">{item.sku}</span>
                        <ExternalLink className="size-3 opacity-60 shrink-0" />
                      </Link>
                      {isTarget && (
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/30">
                          Target
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground block truncate">
                      {item.name}
                    </span>
                    {!item.isDirect && item.subLocationName && (
                      <span
                        className="mt-0.5 flex min-w-0 items-center gap-1 font-mono text-[10px] text-amber-700 dark:text-amber-400"
                        title={`In sub-compartment: ${item.subLocationName}`}
                      >
                        <MapPin className="size-3 shrink-0" />
                        <span className="min-w-0 truncate">
                          In sub-compartment: {item.subLocationName}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {canReadInventory ? (
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 font-mono text-xs font-bold",
                          isTarget
                            ? "bg-emerald-500 text-white dark:bg-emerald-600 shadow-xs"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {item.quantity.toLocaleString()} {item.unit}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                        <Lock className="size-3" />
                        Redacted
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-border/50 bg-muted/20 py-4 text-center text-xs italic text-muted-foreground">
            This storage compartment is currently empty.
          </div>
        )}
      </div>
      </div>

      {/* Footer: pinned outside the scroll container so the primary navigation
          action and the keyboard affordances stay reachable on long content. */}
      <div
        data-testid="spatial-inspector-footer"
        className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-card/95 px-4 py-2.5"
      >
        {onEnterLocation ? (
          <Button
            variant="default"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onEnterLocation(summary.locationId);
            }}
            className="min-w-0 flex-1 gap-1 truncate font-mono text-xs shadow-2xs"
            title={`Enter ${locationCode} to inspect nested compartments (Enter)`}
            aria-label={`Enter location ${locationCode}`}
          >
            <CornerDownRight className="size-3.5 shrink-0" />
            <span className="truncate">Enter Location</span>
          </Button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {locationCode}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground/70 select-none">
          <span className="hidden sm:inline">
            <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[9px] border border-border/40">
              Enter
            </kbd>{" "}
            Open
          </span>
          <span>
            <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[9px] border border-border/40">
              Esc
            </kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

