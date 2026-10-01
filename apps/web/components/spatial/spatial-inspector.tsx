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
        "rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3.5 transition-all",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold uppercase tracking-tight text-foreground">
              {locationCode}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {locationName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {isMapped ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle2 className="size-3" />
                {childDto.anchor
                  ? `Anchor: ${childDto.anchor.code}`
                  : childDto.model
                  ? `Model: ${childDto.model.code}`
                  : "Mapped"}
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
        </div>

        <div className="flex items-center gap-1.5">
          {onEnterLocation && (
            <Button
              variant="default"
              size="xs"
              onClick={() => onEnterLocation(summary.locationId)}
              className="gap-1 font-mono text-xs shadow-2xs"
              title={`Enter ${locationCode} to inspect nested compartments`}
            >
              <CornerDownRight className="size-3" />
              <span>Enter</span>
            </Button>
          )}
          <Link href={`/locations/${summary.locationId}`}>
            <Button
              variant="outline"
              size="xs"
              className="gap-1 font-mono text-xs"
              title={`Open ${locationCode} details page`}
            >
              <span>Page</span>
              <ArrowRight className="size-3" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close inspector"
            className="size-7"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Stock Provenance Breakdown (Unit-Safe) */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
          <span className="text-[11px] font-medium text-sky-700 dark:text-sky-400 flex items-center gap-1">
            <span>Direct Stock</span>
          </span>
          <div className="font-mono font-semibold text-foreground text-xs leading-snug">
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

        <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
          <span className="text-[11px] font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
            <span>Sub-compartment Stock</span>
          </span>
          <div className="font-mono font-semibold text-foreground text-xs leading-snug">
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
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
            <Gauge className="size-3 text-muted-foreground" />
            Physical Capacity:
          </span>
          <span className="font-mono font-medium text-foreground">
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
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/30">
            {components.map((item) => {
              const isTarget = item.componentId === focusComponentId;
              return (
                <div
                  key={`${item.componentId}-${item.subLocationId || "direct"}`}
                  className={cn(
                    "pt-1.5 first:pt-0 flex items-center justify-between gap-2 rounded px-1.5 py-1 transition-colors",
                    isTarget &&
                      "bg-emerald-500/15 border border-emerald-500/30",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/components/${item.componentId}`}
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
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-mono mt-0.5">
                        <MapPin className="size-3" />
                        In sub-compartment: {item.subLocationName}
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
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
          <div className="py-4 text-center text-xs text-muted-foreground italic rounded bg-muted/20 border border-dashed border-border/50">
            This storage compartment is currently empty.
          </div>
        )}
      </div>
    </div>
  );
}

