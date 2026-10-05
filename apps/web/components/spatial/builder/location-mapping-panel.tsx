"use client";

import * as React from "react";
import {
  MapPin,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  isSpatiallyCompatible,
  isTemplateRootCompatible,
  type CompartmentKind,
  type ParametricTemplateType,
} from "@ananya/inventory";
import type { LocationDto } from "@/lib/api/locations-api";
import {
  spatialApi,
  type LocationOperationalViewDto,
} from "@/lib/api/spatial-api";
import type { SlotMappingRecord } from "@/lib/spatial/inventory-builder-state";
import { cn } from "@/lib/utils";

export interface LocationMappingPanelProps {
  templateType: ParametricTemplateType;
  locations: LocationDto[];
  selectedParentId: string | null;
  onSelectParentId: (id: string) => void;
  mappings: Map<string, SlotMappingRecord>;
  onMapToSlot: (slotId: string, location: LocationDto) => void;
  availableSlots: Array<{ slotId: string; code: string; kind?: CompartmentKind }>;
  className?: string;
}

export function LocationMappingPanel({
  templateType,
  locations,
  selectedParentId,
  onSelectParentId,
  mappings,
  onMapToSlot,
  availableSlots,
  className,
}: LocationMappingPanelProps) {
  const [operationalView, setOperationalView] =
    React.useState<LocationOperationalViewDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchFilter, setSearchFilter] = React.useState("");

  // Set of locationIds that are currently mapped to slots in the builder
  const mappedLocationIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const record of mappings.values()) {
      set.add(record.locationId);
    }
    return set;
  }, [mappings]);

  const parentOptions = React.useMemo(() => {
    return locations
      .filter((loc) => isTemplateRootCompatible(templateType, loc.kind))
      .map((loc) => ({
        value: loc.id,
        label: `${loc.name} (${loc.code})`,
        sublabel: loc.kind,
        chip: loc.code,
      }));
  }, [locations, templateType]);

  // Fetch operational view when parent location is selected
  React.useEffect(() => {
    if (!selectedParentId) {
      setOperationalView(null);
      return;
    }

    let isCancelled = false;
    async function loadView() {
      setLoading(true);
      setError(null);
      try {
        const data = await spatialApi.getLocationOperationalView(selectedParentId!);
        if (!isCancelled) {
          setOperationalView(data);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load location operational view.",
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadView();
    return () => {
      isCancelled = true;
    };
  }, [selectedParentId]);

  // Filter children based on search
  const filteredChildren = React.useMemo(() => {
    if (!operationalView) return [];
    const query = searchFilter.toLowerCase().trim();
    if (!query) return operationalView.children;

    return operationalView.children.filter(
      (c) =>
        c.location.code.toLowerCase().includes(query) ||
        c.location.name.toLowerCase().includes(query),
    );
  }, [operationalView, searchFilter]);

  // Available unmapped builder slots that can receive a location
  const unassignedSlots = React.useMemo(() => {
    return availableSlots.filter((slot) => !mappings.has(slot.slotId));
  }, [availableSlots, mappings]);

  const parentKind = React.useMemo(
    () => locations.find((loc) => loc.id === selectedParentId)?.kind,
    [locations, selectedParentId],
  );

  /**
   * Reverse-direction filter: once a candidate location is picked, only slots
   * whose compartment kind accepts it are offered — the same rule the API
   * enforces, so an invalid combination can never be assembled here.
   */
  const compatibleSlotsFor = React.useCallback(
    (candidateKind: string | null | undefined) =>
      unassignedSlots.filter((slot) =>
        isSpatiallyCompatible({
          rootKind: parentKind,
          candidateKind,
          slotKind: slot.kind ?? null,
        }),
      ),
    [unassignedSlots, parentKind],
  );

  return (
    <div className={cn("space-y-4 text-xs", className)}>
      {/* 1. Parent Location Picker */}
      <div className="space-y-1.5 p-3.5 rounded-lg border border-border bg-card">
        <Label className="text-xs font-semibold text-foreground">
          Target Storage Structure (Parent Location)
        </Label>
        <SearchableSelect
          options={parentOptions}
          value={selectedParentId ?? ""}
          onValueChange={(id) => {
            if (id) onSelectParentId(id);
          }}
          placeholder="Search and select a compatible root location..."
          searchPlaceholder="Search storage locations..."
          emptyText="No locations found."
        />
        <p className="text-[11px] text-muted-foreground leading-snug">
          Select an existing physical storage node to associate its sub-locations with the parametric template.
        </p>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="p-6 rounded-lg border bg-card flex items-center justify-center">
          <LoadingState message="Loading child locations & stock data..." />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10">
          <ErrorState title="Failed to load location details" message={error} />
        </div>
      )}

      {/* 2. Children Locations Listing & Slot Assignment */}
      {!loading && operationalView && (
        <div className="space-y-3 p-3.5 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Layers className="size-3.5 text-muted-foreground" />
              <span>
                Child Locations ({operationalView.children.length})
              </span>
            </div>
            <div className="w-40">
              <Input
                type="text"
                placeholder="Filter locations..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>

          {filteredChildren.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No matching child storage locations found under this parent.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {filteredChildren.map((child) => {
                const isMappedInBuilder = mappedLocationIds.has(child.location.id);
                const candidateSlots = compatibleSlotsFor(child.location.kind);

                return (
                  <div
                    key={child.location.id}
                    className={cn(
                      "p-2 rounded-md border flex items-center justify-between text-xs transition-colors",
                      isMappedInBuilder
                        ? "bg-emerald-500/5 border-emerald-500/30"
                        : "bg-muted/30 border-border/50 hover:bg-muted/50",
                    )}
                  >
                    <div className="space-y-0.5 max-w-[200px] truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-foreground">
                          {child.location.code}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({child.location.kind})
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {child.location.name}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isMappedInBuilder ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          Draft Mapped
                        </span>
                      ) : candidateSlots.length > 0 ? (
                        <Select
                          onValueChange={(slotId) => {
                            if (typeof slotId === "string") {
                              const targetLoc = locations.find(
                                (l) => l.id === child.location.id,
                              );
                              if (targetLoc) {
                                onMapToSlot(slotId, targetLoc);
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-28">
                            <SelectValue placeholder="Map to slot..." />
                          </SelectTrigger>
                          <SelectContent>
                            {candidateSlots.map((s) => (
                              <SelectItem key={s.slotId} value={s.slotId}>
                                Slot {s.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : unassignedSlots.length > 0 ? (
                        <span
                          className="text-[10px] text-amber-700 dark:text-amber-400 italic text-right max-w-[140px]"
                          title={`Kinds this template cannot store: ${child.location.kind}`}
                        >
                          No compatible slot
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">
                          No free slots
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty State when no parent location is picked */}
      {!loading && !operationalView && !error && (
        <div className="p-8 rounded-lg border border-dashed border-border bg-card text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
          <MapPin className="size-8 text-muted-foreground/30 mb-2" />
          <span className="font-medium text-foreground">No Parent Storage Selected</span>
          <span className="text-[11px] text-muted-foreground mt-0.5 max-w-sm">
            Select a parent warehouse location above to inspect existing compartments and map them to the builder slots.
          </span>
        </div>
      )}
    </div>
  );
}
