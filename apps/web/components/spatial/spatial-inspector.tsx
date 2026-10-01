"use client";

import * as React from "react";
import Link from "next/link";
import {
  X,
  ExternalLink,
  MapPin,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailChip } from "@/components/ui/detail-field";
import { cn } from "@/lib/utils";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";
import type { LocationOperationalViewChildDto } from "@/lib/api/spatial-api";

export interface SpatialInspectorProps {
  summary: CellStockSummary | null;
  childDto: LocationOperationalViewChildDto | null;
  focusComponentId?: string;
  onClose: () => void;
  className?: string;
}

export function SpatialInspector({
  summary,
  childDto,
  focusComponentId,
  onClose,
  className,
}: SpatialInspectorProps) {
  if (!summary || !childDto) return null;

  const {
    locationCode,
    locationName,
    isMapped,
    totalQuantity,
    components,
    directProjections,
    descendantProjections,
  } = summary;

  const directUnits = directProjections.reduce(
    (sum, p) => sum + Number(p.quantity || 0),
    0,
  );
  const descendantUnits = descendantProjections.reduce(
    (sum, d) => sum + Number(d.projection.quantity || 0),
    0,
  );

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
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link href={`/locations/${summary.locationId}`}>
            <Button variant="outline" size="xs" className="gap-1 font-mono">
              <span>Open</span>
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

      {/* Stock Provenance Breakdown */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded bg-muted/30 border border-border/40">
          <span className="text-[11px] text-muted-foreground block">
            Direct Stock
          </span>
          <span className="font-mono font-semibold text-foreground text-sm">
            {directUnits.toLocaleString()} units
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            {directProjections.length}{" "}
            {directProjections.length === 1 ? "part" : "parts"} stored directly
          </span>
        </div>

        <div className="p-2 rounded bg-muted/30 border border-border/40">
          <span className="text-[11px] text-muted-foreground block">
            Sub-compartment Stock
          </span>
          <span className="font-mono font-semibold text-foreground text-sm">
            {descendantUnits.toLocaleString()} units
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            {descendantProjections.length}{" "}
            {descendantProjections.length === 1 ? "part" : "parts"} in child
            bins
          </span>
        </div>
      </div>

      {/* Component Inventory List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Stored Components ({components.length})</span>
          <span className="font-mono">
            Total: {totalQuantity.toLocaleString()} units
          </span>
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
                        In sub-bin: {item.subLocationName}
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
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
