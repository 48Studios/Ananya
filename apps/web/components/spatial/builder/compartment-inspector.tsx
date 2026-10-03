"use client";

import * as React from "react";
import {
  Box,
  MapPin,
  Maximize2,
  Minimize2,
  Unlink2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { GeneratedCompartment } from "@ananya/inventory";
import type { LocationDto } from "@/lib/api/locations-api";
import {
  getDescendantLocationIds,
  INCOMPATIBLE_COMPARTMENT_KINDS,
  type SlotMappingRecord,
} from "@/lib/spatial/inventory-builder-state";
import { cn } from "@/lib/utils";

export interface CompartmentInspectorProps {
  compartment: GeneratedCompartment | null;
  mapping: SlotMappingRecord | undefined;
  mappings?: Map<string, SlotMappingRecord>;
  availableLocations: LocationDto[];
  selectedParentId?: string | null;
  onMapToLocation: (slotId: string, location: LocationDto) => void;
  onUnmap: (slotId: string) => void;
  onAcknowledgeStale?: (slotId: string) => void;
  className?: string;
}

export function CompartmentInspector({
  compartment,
  mapping,
  mappings,
  availableLocations,
  selectedParentId,
  onMapToLocation,
  onUnmap,
  onAcknowledgeStale,
  className,
}: CompartmentInspectorProps) {
  const [selectedLocId, setSelectedLocId] = React.useState<string>("");

  // Set of location IDs that are already mapped to OTHER slots
  const mappedLocationIds = React.useMemo(() => {
    const set = new Set<string>();
    if (mappings && compartment) {
      for (const [slotId, record] of mappings.entries()) {
        if (slotId !== compartment.slotId) {
          set.add(record.locationId);
        }
      }
    }
    return set;
  }, [mappings, compartment]);

  // Set of valid descendant location IDs under the selected parent container
  const descendantIds = React.useMemo(() => {
    if (!selectedParentId) return new Set<string>();
    return getDescendantLocationIds(availableLocations, selectedParentId);
  }, [availableLocations, selectedParentId]);

  // Filter available locations:
  // 1. Must be a valid descendant of the selected parent container
  // 2. Must not be the selected parent container itself
  // 3. Exclude incompatible structural container kinds (warehouse, room, etc.)
  // 4. Exclude locations already mapped to other slots
  const eligibleLocations = React.useMemo(() => {
    if (!selectedParentId) return [];
    return availableLocations.filter((loc) => {
      if (loc.id === selectedParentId) return false;
      if (!descendantIds.has(loc.id)) return false;
      const kind = (loc.kind || "").toLowerCase().trim();
      if (INCOMPATIBLE_COMPARTMENT_KINDS.has(kind)) return false;
      if (mappedLocationIds.has(loc.id)) return false;
      return true;
    });
  }, [availableLocations, selectedParentId, descendantIds, mappedLocationIds]);

  const locationOptions = React.useMemo(() => {
    return eligibleLocations.map((loc) => ({
      value: loc.id,
      label: `${loc.name} (${loc.code})`,
      sublabel: loc.kind,
      chip: loc.code,
    }));
  }, [eligibleLocations]);

  if (!compartment) {
    return (
      <div
        className={cn(
          "p-6 rounded-lg border border-dashed border-border bg-card text-center text-xs text-muted-foreground flex flex-col items-center justify-center min-h-[220px]",
          className,
        )}
      >
        <Box className="size-8 text-muted-foreground/40 mb-2" />
        <span className="font-medium text-foreground">No Compartment Selected</span>
        <span className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px]">
          Click any slot in the 2D or 3D preview to inspect coordinates and manage location mapping.
        </span>
      </div>
    );
  }

  const handleAssignLocation = (locId: string) => {
    if (!locId) return;
    const loc = availableLocations.find((l) => l.id === locId);
    if (loc) {
      onMapToLocation(compartment.slotId, loc);
      setSelectedLocId("");
    }
  };

  const isStale = Boolean(mapping?.isStale);

  return (
    <div
      data-testid="compartment-inspector"
      className={cn(
        "p-4 rounded-lg border border-border bg-card space-y-4 text-xs shadow-xs",
        className,
      )}
    >
      {/* 1. Header */}
      <div className="flex items-start justify-between pb-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-foreground">
              {compartment.code}
            </span>
            <span className="text-xs text-muted-foreground">({compartment.kind})</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Slot ID: <span className="font-mono text-foreground">{compartment.slotId}</span>
          </div>
        </div>

        {mapping ? (
          isStale ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              <span>Stale Association</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              Associated
            </span>
          )
        ) : (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
            Draft Slot
          </span>
        )}
      </div>

      {/* 2. Geometric Dimensions & Coordinates */}
      <div className="grid grid-cols-2 gap-3">
        {/* Physical Envelope */}
        <div className="space-y-1 p-2.5 rounded bg-muted/30 border border-border/40">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <Maximize2 className="size-3 text-muted-foreground" />
            <span>Outer Envelope</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            <div>W: {compartment.dimensions.widthMm} mm</div>
            <div>H: {compartment.dimensions.heightMm} mm</div>
            <div>D: {compartment.dimensions.depthMm} mm</div>
          </div>
        </div>

        {/* Usable Clear Space */}
        <div className="space-y-1 p-2.5 rounded bg-muted/30 border border-border/40">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <Minimize2 className="size-3 text-muted-foreground" />
            <span>Usable Free Space</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            <div>W: {compartment.clearDimensions.widthMm} mm</div>
            <div>H: {compartment.clearDimensions.heightMm} mm</div>
            <div>D: {compartment.clearDimensions.depthMm} mm</div>
          </div>
        </div>
      </div>

      {/* 3D Center Position */}
      <div className="p-2.5 rounded bg-muted/20 border border-border/30 flex items-center justify-between font-mono text-[11px]">
        <span className="text-muted-foreground">Local Center (X, Y, Z):</span>
        <span className="text-foreground font-semibold">
          ({compartment.position.x}, {compartment.position.y}, {compartment.position.z}) mm
        </span>
      </div>

      {/* 3. Location Association Section */}
      <div className="space-y-2 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1">
            <MapPin className="size-3.5 text-muted-foreground" />
            <span>Ananya Location Mapping</span>
          </span>
        </div>

        {mapping ? (
          <div
            className={cn(
              "p-2.5 rounded-md border space-y-2.5",
              isStale
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-emerald-500/30 bg-emerald-500/5",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground">
                  {mapping.locationName}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  Code: {mapping.locationCode} • Kind: {mapping.locationKind}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUnmap(compartment.slotId)}
                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
              >
                <Unlink2 className="size-3" />
                <span>Unlink</span>
              </Button>
            </div>

            {/* Stale warning alert banner with explicit acknowledgment */}
            {isStale && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 space-y-1.5 text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-1 font-medium text-[11px]">
                  <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Physical Meaning Changed</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {mapping.staleReason || "The physical orientation or code of this slot changed."}
                </p>
                {onAcknowledgeStale && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onAcknowledgeStale(compartment.slotId)}
                    className="h-6 px-2.5 text-[10px] border-amber-500/40 hover:bg-amber-500/20 font-medium"
                  >
                    Confirm & Keep Association
                  </Button>
                )}
              </div>
            )}

            <div className="text-[10px] text-muted-foreground italic">
              Draft association in memory. No persistent database mutations executed.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Associate slot with existing location
              </Label>
              <SearchableSelect
                options={locationOptions}
                value={selectedLocId}
                onValueChange={handleAssignLocation}
                placeholder={
                  !selectedParentId
                    ? "Select parent container first..."
                    : "Search and select location to map..."
                }
                searchPlaceholder="Search by name, code, or kind..."
                emptyText={
                  !selectedParentId
                    ? "Select a parent storage container first to see eligible locations."
                    : eligibleLocations.length === 0
                      ? "No eligible unmapped descendant locations found under selected parent."
                      : "No matching locations found."
                }
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Associates this slot with a physical master-data location record in the workspace draft.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
