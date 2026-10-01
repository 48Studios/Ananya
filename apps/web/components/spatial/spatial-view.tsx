"use client";

import * as React from "react";
import { Package, Search, Box } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { DetailChip } from "@/components/ui/detail-field";
import {
  spatialApi,
  type LocationOperationalViewDto,
  type LocationOperationalViewChildDto,
} from "@/lib/api/spatial-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { computeSpatialLayout } from "@/lib/spatial/spatial-layout";
import {
  mapSpatialInventory,
  type MappedSpatialInventory,
} from "@/lib/spatial/spatial-inventory-mapper";
import { SpatialGrid } from "./spatial-grid";
import { SpatialInspector } from "./spatial-inspector";

export interface SpatialViewProps {
  locationId: string;
  focusLocationId?: string;
  focusComponentId?: string;
  onLocationSelect?: (locationId: string) => void;
  className?: string;
}

export function SpatialView({
  locationId,
  focusLocationId,
  focusComponentId,
  onLocationSelect,
  className,
}: SpatialViewProps) {
  const [data, setData] = React.useState<LocationOperationalViewDto | null>(
    null,
  );
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Interaction states
  const [selectedLocationId, setSelectedLocationId] = React.useState<
    string | null
  >(focusLocationId || null);
  const [filterQuery, setFilterQuery] = React.useState("");

  const fetchData = React.useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const [viewData, compList] = await Promise.all([
        spatialApi.getLocationOperationalView(locationId),
        componentsApi.getAll().catch(() => []),
      ]);
      setData(viewData);
      setComponents(compList);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load spatial operational view");
      }
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronize focus props
  React.useEffect(() => {
    if (focusLocationId) {
      setSelectedLocationId(focusLocationId);
    }
  }, [focusLocationId]);

  // Build component lookup map
  const componentMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) {
      map.set(c.id, c);
    }
    return map;
  }, [components]);

  // Map spatial inventory
  const inventoryMapping = React.useMemo<MappedSpatialInventory | null>(() => {
    if (!data) return null;
    return mapSpatialInventory(
      data.parent.location.id,
      data.children,
      data.descendantLocations,
      data.projections,
      componentMap,
    );
  }, [data, componentMap]);

  // Resolve target location if focusing a specific component
  const effectiveHighlightedLocationId = React.useMemo(() => {
    if (focusLocationId) return focusLocationId;
    if (focusComponentId && inventoryMapping) {
      for (const [childId, summary] of inventoryMapping.cellStockMap.entries()) {
        const containsComp = summary.components.some(
          (c) => c.componentId === focusComponentId,
        );
        if (containsComp) return childId;
      }
    }
    return null;
  }, [focusLocationId, focusComponentId, inventoryMapping]);

  // Auto-select focused location on initial data arrival
  React.useEffect(() => {
    if (effectiveHighlightedLocationId && !selectedLocationId) {
      setSelectedLocationId(effectiveHighlightedLocationId);
    }
  }, [effectiveHighlightedLocationId, selectedLocationId]);

  // Filter children based on query (by code, name, or stored SKU)
  const filteredChildren = React.useMemo(() => {
    if (!data) return [];
    if (!filterQuery.trim() || !inventoryMapping) return data.children;

    const q = filterQuery.toLowerCase().trim();
    return data.children.filter((child) => {
      if (child.location.code.toLowerCase().includes(q)) return true;
      if (child.location.name.toLowerCase().includes(q)) return true;
      const summary = inventoryMapping.cellStockMap.get(child.location.id);
      if (summary) {
        return summary.components.some(
          (c) =>
            c.sku.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
        );
      }
      return false;
    });
  }, [data, filterQuery, inventoryMapping]);

  // Compute 2D layout matrix or grid
  const layout = React.useMemo(() => {
    return computeSpatialLayout(filteredChildren);
  }, [filteredChildren]);

  // Find currently selected child & summary
  const selectedChild = React.useMemo<LocationOperationalViewChildDto | null>(() => {
    if (!data || !selectedLocationId) return null;
    return (
      data.children.find((c) => c.location.id === selectedLocationId) || null
    );
  }, [data, selectedLocationId]);

  const selectedSummary = React.useMemo(() => {
    if (!inventoryMapping || !selectedLocationId) return null;
    return inventoryMapping.cellStockMap.get(selectedLocationId) || null;
  }, [inventoryMapping, selectedLocationId]);

  const handleCellSelect = (id: string) => {
    setSelectedLocationId((prev) => (prev === id ? null : id));
    if (onLocationSelect) {
      onLocationSelect(id);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading spatial operational view..." />
      </div>
    );
  }

  if (error || !data || !inventoryMapping) {
    return (
      <div className="py-8">
        <ErrorState
          title="Spatial View Error"
          message={error || "Unable to render spatial operational layout."}
          onRetry={fetchData}
        />
      </div>
    );
  }

  // Empty state: no child locations exist
  if (data.children.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
        <Box className="mx-auto size-9 text-muted-foreground/60 mb-2.5" />
        <h3 className="font-semibold text-sm text-foreground">
          No Spatial Layout Available
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          Location <span className="font-mono font-bold">{data.parent.location.code}</span> does not have any nested sub-locations. Create drawers, shelves, or sub-bins under this location to view an operational 2D map.
        </p>
      </div>
    );
  }

  const { stats, parentDirectComponents, parentDirectQuantity } = inventoryMapping;

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Top Operational Bar: Summary Metrics & Search Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border shadow-xs">
        {/* Quick Operational Metrics */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total Stock:</span>
            <span className="font-mono font-bold text-foreground">
              {stats.totalUnits.toLocaleString()} units
            </span>
          </div>

          <span className="text-border" aria-hidden="true">
            |
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Occupancy:</span>
            <span className="font-mono font-medium text-foreground">
              {stats.occupiedLocations} / {stats.totalLocations} occupied
            </span>
          </div>

          <span className="text-border" aria-hidden="true">
            |
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Spatial Mapping:</span>
            <span className="font-mono font-medium text-foreground">
              {stats.mappedLocations} mapped ({stats.unmappedLocations} unmapped)
            </span>
          </div>
        </div>

        {/* Search filter input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter drawer / SKU..."
            className="h-8 pl-8 pr-3 text-xs"
          />
        </div>
      </div>

      {/* Parent Direct Stock Notification (if parent holds inventory directly) */}
      {parentDirectQuantity > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-primary shrink-0" />
            <div>
              <span className="font-semibold text-foreground">
                Direct Stock at Parent ({data.parent.location.code}):
              </span>{" "}
              <span className="text-muted-foreground">
                {parentDirectQuantity.toLocaleString()} units loose in the main container (not inside sub-drawers).
              </span>
            </div>
          </div>
          <DetailChip className="font-mono font-bold text-primary">
            {parentDirectComponents.length} {parentDirectComponents.length === 1 ? "item" : "items"}
          </DetailChip>
        </div>
      )}

      {/* Main Grid View Area + Inspector Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Spatial Grid Matrix (7 or 8 columns on large screens if inspector is open) */}
        <div
          className={
            selectedLocationId
              ? "lg:col-span-8 order-2 lg:order-1"
              : "lg:col-span-12 order-2 lg:order-1"
          }
        >
          <div className="bg-card rounded-xl border border-border p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase text-foreground">
                  {data.parent.location.code} Operational Layout
                </span>
                <span className="text-xs text-muted-foreground">
                  ({filteredChildren.length} compartments)
                </span>
              </div>

              {filterQuery && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setFilterQuery("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear filter
                </Button>
              )}
            </div>

            <SpatialGrid
              layout={layout}
              stockMap={inventoryMapping.cellStockMap}
              selectedLocationId={selectedLocationId}
              highlightedLocationId={effectiveHighlightedLocationId}
              onSelectCell={handleCellSelect}
            />
          </div>
        </div>

        {/* Selected Cell Inspector (4 columns on large screens) */}
        {selectedLocationId && selectedChild && selectedSummary && (
          <div className="lg:col-span-4 order-1 lg:order-2 sticky top-4">
            <SpatialInspector
              summary={selectedSummary}
              childDto={selectedChild}
              focusComponentId={focusComponentId}
              onClose={() => setSelectedLocationId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
