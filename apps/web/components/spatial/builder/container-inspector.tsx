"use client";

import * as React from "react";
import {
  AlertTriangle,
  Box,
  Layers,
  MapPin,
  Maximize2,
  Unlink2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  checkSpatialMappingCompatibility,
  isTemplateRootCompatible,
  type CompartmentKind,
  type Dimensions3D,
  type ParametricTemplateType,
} from "@ananya/inventory";
import type { LocationDto } from "@/lib/api/locations-api";
import type { SlotMappingRecord } from "@/lib/spatial/inventory-builder-state";
import { cn } from "@/lib/utils";

const TEMPLATE_LABELS: Record<ParametricTemplateType, string> = {
  SMD_DRAWER_CABINET: "SMD Cabinet",
  OPEN_BIN_MATRIX: "Open Bins",
  PALLET_RACK: "Pallet Rack",
  GRID_PARTS_TRAY: "Parts Tray",
};

export interface ContainerInspectorProps {
  templateType: ParametricTemplateType;
  outerDimensions: Dimensions3D;
  totalCompartments: number;
  locations: LocationDto[];
  selectedParentId: string | null;
  mappings: Map<string, SlotMappingRecord>;
  slotKindsBySlotId?: ReadonlyMap<string, CompartmentKind>;
  onSelectParentId: (id: string) => void;
  /** Clears the container assignment (draft state only; mappings are kept for review). */
  onClearParent?: () => void;
  className?: string;
}

/**
 * Inspector for the layout's top-level container.
 *
 * The container's Ananya location is the layout's `parentLocationId` — the same
 * relationship persisted with the layout. It is deliberately NOT a compartment
 * mapping: assigning it here never writes a `spatial_layout_mappings` row and
 * never creates a spatial node for the container itself.
 */
export function ContainerInspector({
  templateType,
  outerDimensions,
  totalCompartments,
  locations,
  selectedParentId,
  mappings,
  slotKindsBySlotId,
  onSelectParentId,
  onClearParent,
  className,
}: ContainerInspectorProps) {
  const selectedParent = React.useMemo(
    () => locations.find((loc) => loc.id === selectedParentId) ?? null,
    [locations, selectedParentId],
  );

  // Locations already mapped to individual compartments cannot also be the
  // container: the API rejects that pairing (ParentCannotBeSlotError).
  const compartmentLocationIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const record of mappings.values()) {
      set.add(record.locationId);
    }
    return set;
  }, [mappings]);

  const parentOptions = React.useMemo(() => {
    return locations.map((loc) => {
      const isCompatibleRoot = isTemplateRootCompatible(templateType, loc.kind);
      const isMappedToCompartment = compartmentLocationIds.has(loc.id);
      const hasIncompatibleMapping = [...mappings.values()].some((record) => {
        const slotKind = slotKindsBySlotId?.get(record.slotId);
        return !checkSpatialMappingCompatibility({
          rootKind: loc.kind,
          candidateKind: record.locationKind,
          slotKind,
        }).compatible;
      });
      const details = [loc.kind];
      if (!loc.isActive) details.push("inactive");
      if (isMappedToCompartment) details.push("mapped to a compartment");
      if (hasIncompatibleMapping) details.push("incompatible with mapped slots");
      if (!isCompatibleRoot) details.push("incompatible root type");

      return {
        value: loc.id,
        label: `${loc.name} (${loc.code})`,
        sublabel: details.filter(Boolean).join(" • "),
        chip: loc.code,
        disabled:
          !isCompatibleRoot || isMappedToCompartment || hasIncompatibleMapping,
      };
    });
  }, [
    locations,
    compartmentLocationIds,
    mappings,
    slotKindsBySlotId,
    templateType,
  ]);

  const handleAssignParent = (locId: string) => {
    if (!locId || locId === selectedParentId) return;
    const loc = locations.find((candidate) => candidate.id === locId);
    if (loc && compartmentLocationIds.has(loc.id)) return;
    if (loc && !isTemplateRootCompatible(templateType, loc.kind)) return;
    if (
      loc &&
      [...mappings.values()].some((record) => {
        const slotKind = slotKindsBySlotId?.get(record.slotId);
        return !checkSpatialMappingCompatibility({
          rootKind: loc.kind,
          candidateKind: record.locationKind,
          slotKind,
        }).compatible;
      })
    ) {
      return;
    }
    onSelectParentId(locId);
  };

  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-card space-y-4 text-xs shadow-xs",
        className,
      )}
      data-testid="container-inspector"
    >
      {/* 1. Header */}
      <div className="flex items-start justify-between pb-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-1.5">
            <Box className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">
              Top-Level Container
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {TEMPLATE_LABELS[templateType]} ·{" "}
            <span className="font-mono">
              {outerDimensions.widthMm} × {outerDimensions.heightMm} ×{" "}
              {outerDimensions.depthMm} mm
            </span>
          </div>
        </div>

        {selectedParent ? (
          selectedParent.isActive ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              Assigned
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              <span>Inactive</span>
            </span>
          )
        ) : (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
            Unassigned
          </span>
        )}
      </div>

      {/* 2. Container geometry */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 p-2.5 rounded bg-muted/30 border border-border/40">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <Maximize2 className="size-3 text-muted-foreground" />
            <span>Outer Envelope</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            <div>W: {outerDimensions.widthMm} mm</div>
            <div>H: {outerDimensions.heightMm} mm</div>
            <div>D: {outerDimensions.depthMm} mm</div>
          </div>
        </div>
        <div className="space-y-1 p-2.5 rounded bg-muted/30 border border-border/40">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
            <Layers className="size-3 text-muted-foreground" />
            <span>Compartments</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            <div>Slots: {totalCompartments}</div>
            <div>Mapped: {mappings.size}</div>
          </div>
        </div>
      </div>

      {/* 3. Parent location assignment */}
      <div className="space-y-2 pt-2 border-t border-border/60">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1">
          <MapPin className="size-3.5 text-muted-foreground" />
          <span>Container Ananya Location</span>
        </span>

        {selectedParent ? (
          <div className="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1">
            <div className="text-xs font-semibold text-foreground">
              {selectedParent.name}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              Code: {selectedParent.code} • Kind: {selectedParent.kind}
            </div>
            {!selectedParent.isActive && (
              <div className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                <span>
                  Inactive container: drafts can be saved, but publication is
                  blocked until the location is active again.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2.5 rounded-md border border-dashed border-border bg-muted/20 text-[11px] text-muted-foreground">
            No Ananya location is assigned to this container. Select one below to
            enable saving and publishing the layout.
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">
              {selectedParent
                ? "Reassign container location"
                : "Assign container location"}
            </Label>
            {selectedParent && onClearParent && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onClearParent}
                data-testid="container-clear-assignment"
                className="h-6 gap-1 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                title="Clear the container assignment"
              >
                <Unlink2 className="size-3" />
                <span>Clear assignment</span>
              </Button>
            )}
          </div>
          <SearchableSelect
            id="container-parent-location-select"
            options={parentOptions}
            value={selectedParentId ?? ""}
            onValueChange={handleAssignParent}
            placeholder="Search and select warehouse, cabinet, or rack..."
            searchPlaceholder="Search storage locations..."
            emptyText="No matching storage locations found."
          />
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          This is the layout&apos;s parent storage location, not a compartment
          mapping. Compartment slots can only be mapped to active descendant
          locations of this container; locations already mapped to a compartment
          cannot also be the container. Clearing the assignment keeps existing
          compartment mappings for review — they are flagged stale, never
          silently discarded.
        </p>
      </div>
    </div>
  );
}
