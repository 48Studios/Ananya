"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Layers,
  Box,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Package,
  Sliders,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  SpatialTree,
  SpatialMappingWorkspace,
  SpatialMappingDialog,
} from "@/components/spatial";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { spatialApi, type SpatialNodeDto } from "@/lib/api/spatial-api";
import {
  spatialLayoutsApi,
  type SpatialLayoutDto,
} from "@/lib/api/spatial-layouts-api";
import {
  buildLocationTree,
  filterLocationTree,
  getAncestorIds,
  calculateHierarchyStats,
  type LocationTreeNode,
} from "@/lib/spatial/spatial-hierarchy";

function SpatialInventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryLocationId = searchParams.get("location");

  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [nodes, setNodes] = React.useState<SpatialNodeDto[]>([]);
  const [layouts, setLayouts] = React.useState<SpatialLayoutDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Search & Tree expansion state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [selectedLocationId, setSelectedLocationId] = React.useState<string | null>(
    queryLocationId || null,
  );

  // Mapping Dialog state
  const [mappingLocationId, setMappingLocationId] = React.useState<string | null>(
    null,
  );
  const [isMappingDialogOpen, setIsMappingDialogOpen] = React.useState(false);

  // Fetch all locations and spatial nodes in parallel
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allLocs, allNodes, allLayouts] = await Promise.all([
        locationsApi.getAll(),
        spatialApi.getAllNodes().catch(() => []),
        spatialLayoutsApi.getAll().catch(() => []),
      ]);
      setLocations(allLocs);
      setNodes(allNodes);
      setLayouts(allLayouts);

      // Auto-expand ancestors of the selected or default location
      const initialTarget = queryLocationId || (allLocs.length > 0 ? allLocs[0]?.id : null);
      if (initialTarget) {
        setSelectedLocationId((prev) => prev || initialTarget);
        const ancestors = getAncestorIds(allLocs, initialTarget);
        setExpandedIds((prev) => {
          const next = new Set(prev);
          ancestors.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load spatial inventory data.",
      );
    } finally {
      setLoading(false);
    }
  }, [queryLocationId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronize when URL search param changes externally
  React.useEffect(() => {
    if (queryLocationId && queryLocationId !== selectedLocationId) {
      setSelectedLocationId(queryLocationId);
      if (locations.length > 0) {
        const ancestors = getAncestorIds(locations, queryLocationId);
        setExpandedIds((prev) => {
          const next = new Set(prev);
          ancestors.forEach((id) => next.add(id));
          return next;
        });
      }
    }
  }, [queryLocationId, locations, selectedLocationId]);

  // Update selected location and URL
  const handleSelectLocation = React.useCallback(
    (locId: string) => {
      setSelectedLocationId(locId);
      // Ensure ancestors are expanded
      const ancestors = getAncestorIds(locations, locId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.add(id));
        return next;
      });

      const params = new URLSearchParams(window.location.search);
      params.set("location", locId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [locations, router],
  );

  // Toggle tree node expansion
  const handleToggleExpand = React.useCallback((locId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(locId)) {
        next.delete(locId);
      } else {
        next.add(locId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = React.useCallback(() => {
    const allIds = new Set<string>();
    locations.forEach((l) => allIds.add(l.id));
    setExpandedIds(allIds);
  }, [locations]);

  const handleCollapseAll = React.useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Open mapping dialog for a specific location
  const handleOpenMapping = React.useCallback((targetLocationId: string) => {
    setMappingLocationId(targetLocationId);
    setIsMappingDialogOpen(true);
  }, []);

  // Compute hierarchical tree and filter by search
  const rawTree = React.useMemo(() => {
    return buildLocationTree(locations, nodes, layouts);
  }, [locations, nodes, layouts]);

  const filteredTree = React.useMemo(() => {
    return filterLocationTree(rawTree, searchQuery);
  }, [rawTree, searchQuery]);

  // Expand matching ancestors automatically when user types search
  React.useEffect(() => {
    if (searchQuery.trim()) {
      const allMatchingIds = new Set<string>();
      function collectMatchingAncestors(items: LocationTreeNode[]) {
        for (const item of items) {
          if (item.children.length > 0) {
            allMatchingIds.add(item.id);
            collectMatchingAncestors(item.children);
          }
        }
      }
      collectMatchingAncestors(filteredTree);
      setExpandedIds((prev) => new Set([...prev, ...allMatchingIds]));
    }
  }, [searchQuery, filteredTree]);

  // Aggregate statistics
  const stats = React.useMemo(() => {
    return calculateHierarchyStats(locations, nodes);
  }, [locations, nodes]);

  if (loading && locations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingState message="Loading Spatial Inventory workspace..." />
      </div>
    );
  }

  if (error && locations.length === 0) {
    return (
      <div className="p-8">
        <ErrorState
          title="Failed to load Spatial Inventory"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Spatial Inventory"
        description="Configure physical spatial mapping for warehouse locations, racks, drawers, and bins."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/inventory/locations/spatial-builder">
              <Button size="sm" className="gap-1.5 text-xs">
                <Sliders className="size-3.5" />
                <span>Inventory Builder</span>
              </Button>
            </Link>
            <Link href="/inventory/locations/spatial-models">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Box className="size-3.5" />
                <span>Spatial Models & Anchors</span>
              </Button>
            </Link>
            <Link href="/inventory/locations">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <MapPin className="size-3.5" />
                <span>Locations Directory</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. KPI Summary Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Storage Locations"
          value={stats.totalLocations}
          subtitle="All storage facilities & bins"
          icon={Package}
        />
        <StatCard
          title="Mapped Locations"
          value={stats.mappedCount}
          subtitle="Has dedicated SpatialNode"
          icon={CheckCircle2}
        />
        <StatCard
          title="Unmapped Locations"
          value={stats.unmappedCount}
          subtitle="Sub-locations with no SpatialNode"
          icon={AlertTriangle}
        />
        <StatCard
          title="Partially Mapped Parents"
          value={stats.partialCount}
          subtitle="Parent mapped, sub-locations pending"
          icon={Layers}
        />
      </div>

      {stats.rootCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.rootCount} top-level{" "}
          {stats.rootCount === 1 ? "facility is" : "facilities are"} not placed
          in a parent frame, so{" "}
          {stats.rootCount === 1 ? "it is" : "they are"} excluded from the
          unmapped count.
        </p>
      )}

      {/* 3. Two-Pane Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-270px)] min-h-[580px]">
        {/* Left Pane: Location Hierarchy Tree */}
        <div className="lg:col-span-4 xl:col-span-4 h-full min-h-[350px]">
          <SpatialTree
            tree={filteredTree}
            selectedLocationId={selectedLocationId}
            onSelectLocation={handleSelectLocation}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            className="h-full shadow-xs"
          />
        </div>

        {/* Right Pane: Selected Location Workspace */}
        <div className="lg:col-span-8 xl:col-span-8 h-full min-h-[350px]">
          <SpatialMappingWorkspace
            locationId={selectedLocationId}
            onOpenMapping={handleOpenMapping}
            onSelectLocation={handleSelectLocation}
            className="h-full shadow-xs"
          />
        </div>
      </div>

      {/* 4. Spatial Mapping Modal */}
      {mappingLocationId && (
        <SpatialMappingDialog
          locationId={mappingLocationId}
          open={isMappingDialogOpen}
          onOpenChange={(open) => {
            setIsMappingDialogOpen(open);
            if (!open) setMappingLocationId(null);
          }}
          onSuccess={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}

export default function SpatialInventoryPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingState message="Loading Spatial Inventory workspace..." />
        </div>
      }
    >
      <SpatialInventoryContent />
    </React.Suspense>
  );
}
