"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Search,
  Box,
  LayoutGrid,
  Anchor as AnchorIcon,
  Gauge,
  GitFork,
  Tags,
  Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { DetailChip } from "@/components/ui/detail-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  spatialApi,
  type LocationOperationalViewDto,
  type LocationOperationalViewChildDto,
} from "@/lib/api/spatial-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { computeSpatialLayout } from "@/lib/spatial/spatial-layout";
import {
  mapSpatialInventory,
  type MappedSpatialInventory,
} from "@/lib/spatial/spatial-inventory-mapper";
import {
  layoutChildrenFor3D,
  resolveTargetChildLocationId,
  resolveObjectDimensions,
  type Vector3D,
  type SpatialVisualizationMode,
} from "@/lib/spatial/spatial-3d-layout";
import {
  fromSpatialAnchor,
  createDefaultDraftAnchor,
  validateAnchor,
  computeAnchorPreviewLayout,
  getAnchorDiff,
  buildBulkSavePayload,
  formatSaveAnchorError,
  type DraftAnchor,
} from "@/lib/spatial/spatial-anchor-authoring";
import { buildSpatialBreadcrumbs } from "@/lib/spatial/spatial-hierarchy";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { SpatialGrid } from "./spatial-grid";
import { SpatialInspector } from "./spatial-inspector";
import { DynamicSpatial3DViewport } from "./spatial-3d-view";
import { SpatialBreadcrumbs } from "./spatial-breadcrumbs";
import { SpatialAnchorEditor } from "./spatial-anchor-editor";

export interface SpatialViewProps {
  locationId: string;
  focusLocationId?: string;
  focusComponentId?: string;
  onLocationSelect?: (locationId: string) => void;
  onNavigateLocation?: (locationId: string) => void;
  onOpenMapping?: () => void;
  allLocations?: LocationDto[];
  viewMode?: "2d" | "3d";
  onViewModeChange?: (mode: "2d" | "3d") => void;
  className?: string;
}

export function SpatialView({
  locationId,
  focusLocationId,
  focusComponentId,
  onLocationSelect,
  onNavigateLocation,
  onOpenMapping,
  allLocations,
  viewMode,
  onViewModeChange,
  className,
}: SpatialViewProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEditAnchors = hasPermission("Inventory.Update");
  const canReadInventory = hasPermission("Inventory.Read");
  const [data, setData] = React.useState<LocationOperationalViewDto | null>(
    null,
  );
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Visualization modes: standard, provenance (direct vs descendant), occupancy
  const [visualizationMode, setVisualizationMode] =
    React.useState<SpatialVisualizationMode>("standard");
  const [showBadges, setShowBadges] = React.useState(true);

  // Interaction states
  const [selectedLocationId, setSelectedLocationId] = React.useState<
    string | null
  >(focusLocationId || null);
  const [filterQuery, setFilterQuery] = React.useState("");

  // Mode state: 2D Operational Matrix or 3D Digital Twin
  const [internalMode, setInternalMode] = React.useState<"2d" | "3d">(
    viewMode || "2d",
  );

  React.useEffect(() => {
    if (viewMode) {
      setInternalMode(viewMode);
    }
  }, [viewMode]);

  const currentMode = viewMode || internalMode;
  const handleModeChange = (newMode: "2d" | "3d") => {
    setInternalMode(newMode);
    if (onViewModeChange) {
      onViewModeChange(newMode);
    }
  };

  // Anchor Authoring States
  const [isAuthoringAnchors, setIsAuthoringAnchors] = React.useState(false);
  const [draftAnchors, setDraftAnchors] = React.useState<DraftAnchor[]>([]);
  const [selectedAnchorId, setSelectedAnchorId] = React.useState<string | null>(
    null,
  );
  const [authoringGizmoMode, setAuthoringGizmoMode] = React.useState<
    "translate" | "rotate"
  >("translate");
  const [savingAnchors, setSavingAnchors] = React.useState(false);
  const [saveAnchorError, setSaveAnchorError] = React.useState<string | null>(
    null,
  );
  const [unsavedNavConfirmOpen, setUnsavedNavConfirmOpen] =
    React.useState(false);
  const [pendingNavAction, setPendingNavAction] = React.useState<
    (() => void) | null
  >(null);

  // Locations list for breadcrumb path traversal
  const [internalLocations, setInternalLocations] = React.useState<
    LocationDto[]
  >([]);

  React.useEffect(() => {
    if (!allLocations || allLocations.length === 0) {
      locationsApi.getAll().then(setInternalLocations).catch(() => {});
    }
  }, [allLocations]);

  const effectiveLocations =
    allLocations && allLocations.length > 0 ? allLocations : internalLocations;

  const breadcrumbs = React.useMemo(() => {
    return buildSpatialBreadcrumbs(locationId, effectiveLocations);
  }, [locationId, effectiveLocations]);

  const canGoUp = Boolean(data?.parent.location.parentId);
  const parentLocationId = data?.parent.location.parentId || undefined;

  // Track anchor diff for unsaved state
  const anchorDiff = React.useMemo(() => {
    if (!data?.parent.anchors) {
      return { added: [], updated: [], deletedIds: [], hasChanges: false };
    }
    return getAnchorDiff(data.parent.anchors, draftAnchors);
  }, [data?.parent.anchors, draftAnchors]);

  // Window unload guard if unsaved changes exist
  React.useEffect(() => {
    if (!isAuthoringAnchors || !anchorDiff.hasChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAuthoringAnchors, anchorDiff.hasChanges]);

  // Navigation guard helper
  const guardNavigation = React.useCallback(
    (action: () => void) => {
      if (isAuthoringAnchors && anchorDiff.hasChanges) {
        setPendingNavAction(() => action);
        setUnsavedNavConfirmOpen(true);
      } else {
        if (isAuthoringAnchors) {
          setIsAuthoringAnchors(false);
          setDraftAnchors([]);
          setSelectedAnchorId(null);
        }
        action();
      }
    },
    [isAuthoringAnchors, anchorDiff.hasChanges],
  );

  const handleNavigate = React.useCallback(
    (targetLocationId: string) => {
      guardNavigation(() => {
        if (onNavigateLocation) {
          onNavigateLocation(targetLocationId);
        } else {
          const params = new URLSearchParams();
          const viewParam = currentMode === "3d" ? "spatial3d" : "spatial";
          params.set("view", viewParam);
          if (focusComponentId) {
            params.set("focusComponent", focusComponentId);
          }
          const qs = params.toString();
          router.push(`/inventory/locations/${targetLocationId}${qs ? `?${qs}` : ""}`);
        }
      });
    },
    [onNavigateLocation, currentMode, router, guardNavigation, focusComponentId],
  );

  // Unified keyboard shortcuts: Enter to open selected compartment, Escape to clear selection
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, select, or editable element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // Check if an interactive overlay (modal dialog, alert dialog, menu, popover) is open
      const hasActiveModalOrMenu = Boolean(
        unsavedNavConfirmOpen ||
          document.querySelector(
            '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]',
          ),
      );

      if (e.key === "Escape") {
        // If a modal or menu is open, let its own handler process Escape
        if (hasActiveModalOrMenu) {
          return;
        }

        if (selectedLocationId) {
          e.preventDefault();
          setSelectedLocationId(null);
        }
      } else if (e.key === "Enter") {
        // Do not hijack Enter if focus is on any interactive control
        // (buttons, links, menus, dialogs have their own native activation)
        if (
          e.target instanceof HTMLElement &&
          e.target.closest(
            "button, a, select, [role='button'], [role='menuitem'], [role='dialog'], [role='alertdialog']",
          )
        ) {
          return;
        }

        if (selectedLocationId && !isAuthoringAnchors && !hasActiveModalOrMenu) {
          e.preventDefault();
          handleNavigate(selectedLocationId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedLocationId,
    isAuthoringAnchors,
    unsavedNavConfirmOpen,
    handleNavigate,
  ]);

  const handleUpOneLevel = React.useCallback(() => {
    if (parentLocationId) {
      handleNavigate(parentLocationId);
    }
  }, [parentLocationId, handleNavigate]);

  const handleSafeModeChange = (newMode: "2d" | "3d") => {
    guardNavigation(() => {
      handleModeChange(newMode);
    });
  };

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

  // Resolve target location if focusing a specific component or deep descendant
  const effectiveHighlightedLocationId = React.useMemo(() => {
    if (!data) return null;
    return resolveTargetChildLocationId(
      focusLocationId,
      focusComponentId,
      data.children,
      data.descendantLocations,
      inventoryMapping?.cellStockMap,
    );
  }, [focusLocationId, focusComponentId, data, inventoryMapping]);

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

  // Parent model dimensions
  const parentDimensions = React.useMemo<Vector3D | null>(() => {
    if (!data?.parent) return null;
    return resolveObjectDimensions(
      data.parent.model,
      null,
      data.parent.location.kind,
    );
  }, [data]);

  // Compute 2D layout matrix or grid
  const layout = React.useMemo(() => {
    return computeSpatialLayout(filteredChildren);
  }, [filteredChildren]);

  // Compute 3D child layout (divides into mapped and unmapped without inventing coordinates)
  const layout3D = React.useMemo(() => {
    if (!data || !inventoryMapping) {
      return { mapped: [], unmapped: [] };
    }
    return layoutChildrenFor3D(
      filteredChildren,
      data.parent.model,
      inventoryMapping.cellStockMap,
    );
  }, [filteredChildren, data, inventoryMapping]);

  // Live preview layout for 3D during anchor authoring
  const previewChildrenLayout = React.useMemo(() => {
    if (!isAuthoringAnchors) return layout3D.mapped;
    return computeAnchorPreviewLayout(
      layout3D.mapped,
      draftAnchors,
      parentDimensions,
    );
  }, [isAuthoringAnchors, layout3D.mapped, draftAnchors, parentDimensions]);

  // Enter authoring mode
  const handleEnterAuthoring = () => {
    if (!canEditAnchors) return;
    if (!data?.parent.model) {
      if (onOpenMapping) {
        onOpenMapping();
      }
      return;
    }
    const drafts = (data.parent.anchors || []).map(fromSpatialAnchor);
    setDraftAnchors(drafts);
    setSelectedLocationId(null);
    setSelectedAnchorId(drafts[0]?.id ?? null);
    setIsAuthoringAnchors(true);
    setSaveAnchorError(null);
  };

  const handleExitAuthoring = () => {
    setIsAuthoringAnchors(false);
    setDraftAnchors([]);
    setSelectedAnchorId(null);
    setSaveAnchorError(null);
  };

  const handleSaveAnchors = async () => {
    if (!canEditAnchors) {
      setSaveAnchorError(
        "You do not have permission to modify spatial anchors (Inventory.Update required).",
      );
      return;
    }
    if (!data?.parent.model) return;
    setSavingAnchors(true);
    setSaveAnchorError(null);

    // Validate all anchors
    for (const draft of draftAnchors) {
      const res = validateAnchor(draft, draftAnchors);
      if (!res.isValid) {
        setSaveAnchorError(`Anchor "${draft.code}": ${res.errors.join(", ")}`);
        setSelectedAnchorId(draft.id);
        setSavingAnchors(false);
        return;
      }
    }

    try {
      const diff = getAnchorDiff(data.parent.anchors, draftAnchors);
      const payload = buildBulkSavePayload(
        diff,
        data.parent.model.updatedAt,
      );

      await spatialApi.bulkSaveAnchors(data.parent.model.id, payload);

      await fetchData();
      handleExitAuthoring();
    } catch (err: unknown) {
      setSaveAnchorError(formatSaveAnchorError(err));
    } finally {
      setSavingAnchors(false);
    }
  };

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
      <div className={`space-y-4 ${className || ""}`}>
        {breadcrumbs.length > 0 && (
          <SpatialBreadcrumbs
            breadcrumbs={breadcrumbs}
            onNavigate={handleNavigate}
            onUpOneLevel={handleUpOneLevel}
            canGoUp={canGoUp}
          />
        )}
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
          <Box className="mx-auto size-9 text-muted-foreground/60 mb-2.5" />
          <h3 className="font-semibold text-sm text-foreground">
            No Spatial Layout Available
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Location <span className="font-mono font-bold">{data.parent.location.code}</span> does not have any nested sub-locations. Create drawers, shelves, or sub-bins under this location to view an operational layout.
          </p>
        </div>
      </div>
    );
  }

  const { stats, parentDirectComponents, parentDirectQuantity } = inventoryMapping;

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Physical Location Hierarchy Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <SpatialBreadcrumbs
          breadcrumbs={breadcrumbs}
          onNavigate={handleNavigate}
          onUpOneLevel={handleUpOneLevel}
          canGoUp={canGoUp}
        />
      )}

      {/* Top Operational Bar: Summary Metrics & Search Filter */}
      <div
        data-testid="spatial-operational-bar"
        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border shadow-xs"
      >
        {/* Quick Operational Metrics */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total Stock:</span>
            <span className="font-mono font-bold text-foreground">
              {canReadInventory ? (
                stats.totalUnitsBreakdown || `${stats.totalUnits.toLocaleString()} units`
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                  <Lock className="size-3" />
                  Protected
                </span>
              )}
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
            <span className="text-muted-foreground">
              {currentMode === "3d" ? "Spatial 3D:" : "Spatial Mapping:"}
            </span>
            <span className="font-mono font-medium text-foreground">
              {currentMode === "3d"
                ? `${layout3D.mapped.length} in 3D (${layout3D.unmapped.length} unmapped)`
                : `${stats.mappedLocations} mapped (${stats.unmappedLocations} unmapped)`}
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
                {canReadInventory
                  ? (inventoryMapping.parentDirectUnitsBreakdown || `${parentDirectQuantity.toLocaleString()} units`)
                  : "Quantities protected"}{" "}
                loose in the main container (not inside sub-drawers).
              </span>
            </div>
          </div>
          <DetailChip className="font-mono font-bold text-primary">
            {parentDirectComponents.length} {parentDirectComponents.length === 1 ? "item" : "items"}
          </DetailChip>
        </div>
      )}

      {/* Main Spatial Canvas Area (Always stable full-width; selecting a cell never resizes or reflows the canvas) */}
      <div className="relative w-full">
        <div className="w-full">
          <div className="bg-card rounded-xl border border-border p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase text-foreground">
                  {data.parent.location.code} {currentMode === "3d" ? "3D Digital Twin" : "Operational Layout"}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  ({filteredChildren.length} compartments)
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {filterQuery && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setFilterQuery("")}
                    className="text-xs text-muted-foreground hover:text-foreground h-6 px-1.5"
                  >
                    Clear filter
                  </Button>
                )}

                <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border/40">
                  <Button
                    variant={currentMode === "2d" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => handleSafeModeChange("2d")}
                    className="h-6 px-2 text-xs font-medium gap-1"
                    title="Switch to 2D operational layout"
                  >
                    <LayoutGrid className="size-3" />
                    <span>2D Grid</span>
                  </Button>
                  <Button
                    variant={currentMode === "3d" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => handleSafeModeChange("3d")}
                    className="h-6 px-2 text-xs font-medium gap-1"
                    title="Switch to 3D digital twin"
                  >
                    <Box className="size-3" />
                    <span>3D Scene</span>
                  </Button>
                </div>

                {currentMode === "3d" && (
                  <>
                    <div className="flex items-center rounded-md bg-muted/60 p-0.5 border border-border/60 text-xs">
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("standard")}
                        className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                          visualizationMode === "standard"
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        title="Standard 3D inventory view"
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("provenance")}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                          visualizationMode === "provenance"
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        title="Show direct inventory distinctly separated from nested sub-compartment inventory"
                      >
                        <GitFork className="size-3" />
                        <span>Provenance</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("occupancy")}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                          visualizationMode === "occupancy"
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        title="Visualize physical occupancy thresholds where configured, or presence where unspecified"
                      >
                        <Gauge className="size-3" />
                        <span>Occupancy</span>
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant={showBadges ? "secondary" : "ghost"}
                      size="xs"
                      onClick={() => setShowBadges((prev) => !prev)}
                      className="h-6 px-2 text-[11px] gap-1 font-medium"
                      title="Toggle accessible text badges on 3D compartment face plates"
                    >
                      <Tags className="size-3" />
                      <span className="hidden sm:inline">Labels</span>
                    </Button>

                    <Button
                      type="button"
                      variant={isAuthoringAnchors ? "secondary" : "outline"}
                      size="xs"
                      onClick={
                        isAuthoringAnchors
                          ? handleExitAuthoring
                          : handleEnterAuthoring
                      }
                      disabled={!canEditAnchors || (!isAuthoringAnchors && !data.parent.model)}
                      className={`h-6 px-2 text-xs font-medium gap-1 ${
                        isAuthoringAnchors
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50"
                          : ""
                      }`}
                      title={
                        !canEditAnchors
                          ? "You need the Inventory.Update permission to edit spatial anchors"
                          : data.parent.model
                            ? "Visually edit, add, or move 3D spatial anchors on this model"
                            : "Assign a 3D model first to author anchors"
                      }
                    >
                      <AnchorIcon className="size-3.5" />
                      <span>
                        {isAuthoringAnchors ? "Exit Edit" : "Edit Anchors"}
                      </span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {currentMode === "2d" ? (
              <SpatialGrid
                layout={layout}
                stockMap={inventoryMapping.cellStockMap}
                selectedLocationId={selectedLocationId}
                highlightedLocationId={effectiveHighlightedLocationId}
                onSelectCell={handleCellSelect}
                onEnterCell={handleNavigate}
              />
            ) : (
              <DynamicSpatial3DViewport
                parentData={data.parent}
                childrenLayout={previewChildrenLayout}
                unmappedChildren={layout3D.unmapped}
                stockMap={inventoryMapping.cellStockMap}
                selectedLocationId={selectedLocationId}
                highlightedLocationId={effectiveHighlightedLocationId}
                onSelectLocation={handleCellSelect}
                onEnterLocation={handleNavigate}
                onOpenMapping={onOpenMapping}
                onSwitchTo2D={() => handleSafeModeChange("2d")}
                visualizationMode={visualizationMode}
                showBadges={showBadges}
                isAuthoringAnchors={isAuthoringAnchors}
                draftAnchors={draftAnchors}
                selectedAnchorId={selectedAnchorId}
                authoringGizmoMode={authoringGizmoMode}
                onSelectAnchor={(id) => setSelectedAnchorId(id)}
                onAnchorTransformChange={(anchorId, updates) => {
                  setDraftAnchors((prev) =>
                    prev.map((a) =>
                      a.id === anchorId
                        ? { ...a, ...updates, isModified: true }
                        : a,
                    ),
                  );
                }}
                onGizmoModeChange={(mode) => setAuthoringGizmoMode(mode)}
              />
            )}
          </div>
        </div>

        {/* Selected Cell Inspector: Floating Overlay on Desktop, Bottom Sheet on Mobile */}
        {selectedLocationId && selectedChild && selectedSummary && !isAuthoringAnchors && (
          <div
            data-testid="spatial-inspector-overlay"
            className={cn(
              // Desktop & tablet: Floating overlay positioned top-right over canvas without resizing canvas
              "sm:absolute sm:top-14 sm:right-4 sm:z-20 sm:w-84 sm:max-w-[calc(100%-2rem)] sm:max-h-[min(640px,calc(100vh-10rem))] sm:overflow-y-auto sm:shadow-xl",
              // Mobile (<sm): Fixed bottom sheet overlay
              "fixed inset-x-0 bottom-0 z-50 p-2 bg-background/80 backdrop-blur-sm sm:p-0 sm:bg-transparent sm:backdrop-blur-none",
            )}
          >
            <SpatialInspector
              summary={selectedSummary}
              childDto={selectedChild}
              focusComponentId={focusComponentId}
              onClose={() => setSelectedLocationId(null)}
              onEnterLocation={handleNavigate}
              className="shadow-xl border-border bg-card/95 backdrop-blur-md max-h-[70vh] sm:max-h-[min(640px,calc(100vh-10rem))] overflow-y-auto"
            />
          </div>
        )}

        {/* Anchor Authoring Panel (preserved for 3D authoring mode) */}
        {isAuthoringAnchors && data.parent.model && (
          <div className="mt-4 lg:mt-0 lg:absolute lg:top-14 lg:right-4 lg:z-20 lg:w-96 lg:max-h-[min(640px,calc(100vh-10rem))] lg:overflow-y-auto lg:shadow-xl">
            <SpatialAnchorEditor
              model={data.parent.model}
              draftAnchors={draftAnchors}
              selectedAnchorId={selectedAnchorId}
              initialAnchors={data.parent.anchors || []}
              childrenLayout={previewChildrenLayout}
              onSelectAnchor={(id) => setSelectedAnchorId(id)}
              onAddAnchor={() => {
                const newDraft = createDefaultDraftAnchor(
                  data.parent.model!.id,
                  draftAnchors,
                  data.parent.model,
                );
                setDraftAnchors((prev) => [...prev, newDraft]);
                setSelectedAnchorId(newDraft.id);
              }}
              onUpdateAnchor={(anchorId, updates) => {
                setDraftAnchors((prev) =>
                  prev.map((a) =>
                    a.id === anchorId
                      ? { ...a, ...updates, isModified: true }
                      : a,
                  ),
                );
              }}
              onDeleteAnchor={(anchorId) => {
                setDraftAnchors((prev) =>
                  prev.filter((a) => a.id !== anchorId),
                );
                if (selectedAnchorId === anchorId) {
                  setSelectedAnchorId(null);
                }
              }}
              onSave={handleSaveAnchors}
              onCancel={handleExitAuthoring}
              saving={savingAnchors}
              saveError={saveAnchorError}
              authoringGizmoMode={authoringGizmoMode}
              onGizmoModeChange={setAuthoringGizmoMode}
            />
          </div>
        )}
      </div>

      {/* Discard Changes Navigation Guard Dialog */}
      <ConfirmDialog
        isOpen={unsavedNavConfirmOpen}
        onCancel={() => setUnsavedNavConfirmOpen(false)}
        title="Discard Unsaved Anchor Changes?"
        description="You have unsaved changes to spatial anchors on this model. Leaving will discard these changes."
        confirmText="Discard & Navigate"
        variant="destructive"
        onConfirm={() => {
          setUnsavedNavConfirmOpen(false);
          setIsAuthoringAnchors(false);
          setDraftAnchors([]);
          setSelectedAnchorId(null);
          if (pendingNavAction) {
            pendingNavAction();
            setPendingNavAction(null);
          }
        }}
      />
    </div>
  );
}
