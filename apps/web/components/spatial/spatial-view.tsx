"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Search,
  Box,
  CheckCircle2,
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
  resolveAuthoredContainerDimensions,
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
import {
  hasOwnSpatialFrame,
  resolveSpatialViewContext,
  type SpatialViewContextResolution,
} from "@/lib/spatial/spatial-view-context";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { SpatialGrid } from "./spatial-grid";
import { SpatialInspector } from "./spatial-inspector";
import { SpatialInspectorEmptyState } from "./spatial-inspector-empty-state";
import { DynamicSpatial3DViewport } from "./spatial-3d-view";
import { SpatialBreadcrumbs } from "./spatial-breadcrumbs";
import { SpatialAnchorEditor } from "./spatial-anchor-editor";

/**
 * Segmented-control styling for the spatial canvas toolbar. The track is a solid
 * muted surface and the selected segment a raised card, so the active mode is
 * unambiguous in both themes (a translucent muted track plus the near-identical
 * `secondary` surface used to render the selected and unselected segments the
 * same colour).
 */
const TOOLBAR_TRACK_CLASS =
  "flex h-[30px] items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5";
/**
 * Standalone toolbar controls (toggles and actions) reserve the same outer band
 * as a segmented track — 1px borders + 2px padding around the 24px segments — so
 * the whole toolbar row reads as one height instead of mixing 24px and 30px
 * blocks.
 */
const TOOLBAR_CONTROL_CLASS =
  "h-[30px] gap-1 rounded-lg px-2.5 text-xs font-medium";
const TOOLBAR_SEGMENT_CLASS =
  "flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors";
const TOOLBAR_SEGMENT_ACTIVE_CLASS = "bg-card text-foreground shadow-xs";
const TOOLBAR_SEGMENT_INACTIVE_CLASS =
  "text-muted-foreground hover:text-foreground";

/**
 * Location kinds that may slide open along their front axis. Container kinds
 * (warehouse, room_area, rack, shelf, cabinet) are never slidable. The legacy
 * aliases `tray`/`tube` are retained so existing persisted rows stay openable.
 */
const OPERATIONAL_OPENABLE_KINDS = [
  "drawer",
  "bin",
  "matrix_tray",
  "reel_slot",
  "ic_tube_rail",
  "tray",
  "tube",
] as const;

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
  /**
   * Requested-vs-rendered resolution: which frame is on screen and which
   * location inside it the operator asked for. `locationId` stays the requested
   * location even when an ancestor frame is rendered.
   */
  const [viewResolution, setViewResolution] =
    React.useState<SpatialViewContextResolution | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Visualization modes: standard, provenance (direct vs descendant), occupancy
  const [visualizationMode, setVisualizationMode] =
    React.useState<SpatialVisualizationMode>("standard");
  const [showBadges, setShowBadges] = React.useState(true);

  // Interaction states. `selectedLocationId` is the single source of truth for
  // the inspector: `null` means closed, and every close path only clears it.
  const [selectedLocationId, setSelectedLocationId] = React.useState<
    string | null
  >(focusLocationId || null);
  /**
   * Locate/QR deep-link targets already revealed for this mount. Without it the
   * "reveal the deep-link target" rule would re-select on every dismissal.
   */
  const consumedFocusTargetRef = React.useRef<string | null>(null);

  /**
   * The one authoritative close path: clearing the selection *is* closing the
   * inspector. It never touches mapping, layout, inventory, drawer motion, or
   * navigation, and the inspector's own controls stop propagation so a dismissal
   * can never bubble into a card/canvas selection handler.
   */
  const handleCloseInspector = React.useCallback(() => {
    setSelectedLocationId(null);
  }, []);

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

  const requestedLocation = React.useMemo(
    () => effectiveLocations.find((loc) => loc.id === locationId) || null,
    [effectiveLocations, locationId],
  );

  const breadcrumbs = React.useMemo(() => {
    return buildSpatialBreadcrumbs(locationId, effectiveLocations);
  }, [locationId, effectiveLocations]);

  // "Up one level" always steps from the requested location, never from the
  // ancestor frame that may be rendered on its behalf.
  const canGoUp = Boolean(requestedLocation?.parentId);
  const parentLocationId = requestedLocation?.parentId || undefined;

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
          handleCloseInspector();
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
    handleCloseInspector,
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
      const [requestedView, locateTarget, compList] = await Promise.all([
        spatialApi.getLocationOperationalView(locationId),
        spatialApi.resolveLocationLocate(locationId).catch(() => null),
        componentsApi.getAll().catch(() => []),
      ]);

      // The requested location keeps priority: an ancestor frame is only
      // rendered when the requested location has no frame of its own and is
      // placed inside one. Even then the requested location stays selected.
      const resolution = resolveSpatialViewContext({
        requestedLocationId: locationId,
        requestedHasOwnFrame: hasOwnSpatialFrame(requestedView),
        resolvedSpatialRootLocationId: locateTarget?.spatialRootLocationId,
        resolvedFocusLocationId: locateTarget?.focusLocationId,
      });

      const viewData =
        resolution.contextLocationId === locationId
          ? requestedView
          : await spatialApi.getLocationOperationalView(
              resolution.contextLocationId,
            );

      setViewResolution(resolution);
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

  /**
   * The location to reveal inside the rendered frame: an explicit focus
   * (locate/QR deep link) wins, otherwise a leaf request selects itself inside
   * the ancestor frame rendered on its behalf. This keeps the requested
   * location visible without ever redefining it as the ancestor.
   */
  const revealTargetId =
    focusLocationId ||
    (viewResolution?.isContextView ? locationId : undefined);

  // Resolve target location if focusing a specific component or deep descendant
  const effectiveHighlightedLocationId = React.useMemo(() => {
    if (!data) return null;
    return resolveTargetChildLocationId(
      revealTargetId,
      focusComponentId,
      data.children,
      data.descendantLocations,
      inventoryMapping?.cellStockMap,
    );
  }, [revealTargetId, focusComponentId, data, inventoryMapping]);

  // Locate/QR deep links arrive with a target to reveal. The target is consumed
  // once per value: re-selecting whenever the selection is empty would undo every
  // dismissal (close button, Escape, outside click) and make the inspector
  // impossible to close, so the effect deliberately does not depend on
  // `selectedLocationId`.
  React.useEffect(() => {
    if (!effectiveHighlightedLocationId) return;
    if (consumedFocusTargetRef.current === effectiveHighlightedLocationId) {
      return;
    }
    consumedFocusTargetRef.current = effectiveHighlightedLocationId;
    setSelectedLocationId((prev) => prev ?? effectiveHighlightedLocationId);
  }, [effectiveHighlightedLocationId]);

  // A selection that no longer resolves to a child of this parent (location
  // deleted, moved, or otherwise unavailable after a refetch) is dropped so the
  // inspector cannot linger on stale state.
  React.useEffect(() => {
    if (!data || !selectedLocationId) return;
    const isKnownChild = data.children.some(
      (child) => child.location.id === selectedLocationId,
    );
    if (!isKnownChild) {
      setSelectedLocationId(null);
    }
  }, [data, selectedLocationId]);

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
    // The published layout's configured dimensions are the frame the builder
    // authored the child coordinates in. Prefer them over the container's own
    // model so the same node lands in the same place in every viewer.
    const authoredFrame = resolveAuthoredContainerDimensions(
      data.parent.mapping,
      data.parent.model,
    );
    return layoutChildrenFor3D(
      filteredChildren,
      data.parent.model,
      inventoryMapping.cellStockMap,
      authoredFrame,
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

  const isInspectorOpen = Boolean(
    selectedLocationId && selectedChild && selectedSummary && !isAuthoringAnchors,
  );
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

  // Empty state: no child locations exist. A location that is itself mapped
  // must never read as "no spatial layout": its placement does not require it
  // to own a nested layout.
  if (data.children.length === 0) {
    const parentMapping = data.parent.mapping;
    const isPlaced = parentMapping.hasSpatialNode;
    const slotMapping = parentMapping.slotMapping;

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
          {isPlaced ? (
            <CheckCircle2 className="mx-auto size-9 text-emerald-600/70 mb-2.5" />
          ) : (
            <Box className="mx-auto size-9 text-muted-foreground/60 mb-2.5" />
          )}
          <h3 className="font-semibold text-sm text-foreground">
            {isPlaced ? "Spatially Mapped" : "No Spatial Layout Available"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            {isPlaced ? (
              <>
                Location{" "}
                <span className="font-mono font-bold">
                  {data.parent.location.code}
                </span>{" "}
                is placed inside its parent&apos;s spatial frame
                {slotMapping
                  ? ` (slot ${slotMapping.slotCode} of layout ${slotMapping.layoutCode}).`
                  : "."}{" "}
                It has no nested sub-locations of its own yet.
              </>
            ) : (
              <>
                Location{" "}
                <span className="font-mono font-bold">
                  {data.parent.location.code}
                </span>{" "}
                {parentMapping.isMappingEligible
                  ? "does not have any nested sub-locations. Create drawers, shelves, or sub-bins under this location to view an operational layout."
                  : "is a top-level facility with no nested sub-locations and no spatial node. Configure a spatial model and layout to map its compartments."}
              </>
            )}
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

      {/* Main Spatial Workspace. The canvas keeps a stable width for a given
          sidebar state: selecting a cell swaps the inspector contents instead of
          resizing or reflowing the visualization. */}
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
                {viewResolution?.isContextView && (
                  <span
                    className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
                    title={`${requestedLocation?.name ?? locationId} is selected inside its parent's spatial frame`}
                  >
                    {requestedLocation?.code ?? locationId} selected
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {filterQuery && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setFilterQuery("")}
                    className={cn(
                      TOOLBAR_CONTROL_CLASS,
                      "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Clear filter
                  </Button>
                )}

                <div className={TOOLBAR_TRACK_CLASS}>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleSafeModeChange("2d")}
                    aria-pressed={currentMode === "2d"}
                    className={cn(
                      TOOLBAR_SEGMENT_CLASS,
                      currentMode === "2d"
                        ? `${TOOLBAR_SEGMENT_ACTIVE_CLASS} hover:bg-card`
                        : `${TOOLBAR_SEGMENT_INACTIVE_CLASS} hover:bg-transparent`,
                    )}
                    title="Switch to 2D operational layout"
                  >
                    <LayoutGrid className="size-3.5" />
                    <span>2D Grid</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleSafeModeChange("3d")}
                    aria-pressed={currentMode === "3d"}
                    className={cn(
                      TOOLBAR_SEGMENT_CLASS,
                      currentMode === "3d"
                        ? `${TOOLBAR_SEGMENT_ACTIVE_CLASS} hover:bg-card`
                        : `${TOOLBAR_SEGMENT_INACTIVE_CLASS} hover:bg-transparent`,
                    )}
                    title="Switch to 3D digital twin"
                  >
                    <Box className="size-3.5" />
                    <span>3D Scene</span>
                  </Button>
                </div>

                {currentMode === "3d" && (
                  <>
                    <div
                      className={TOOLBAR_TRACK_CLASS}
                      role="group"
                      aria-label="3D visualization mode"
                    >
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("standard")}
                        aria-pressed={visualizationMode === "standard"}
                        className={cn(
                          TOOLBAR_SEGMENT_CLASS,
                          visualizationMode === "standard"
                            ? TOOLBAR_SEGMENT_ACTIVE_CLASS
                            : TOOLBAR_SEGMENT_INACTIVE_CLASS,
                        )}
                        title="Standard 3D inventory view"
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("provenance")}
                        aria-pressed={visualizationMode === "provenance"}
                        className={cn(
                          TOOLBAR_SEGMENT_CLASS,
                          visualizationMode === "provenance"
                            ? TOOLBAR_SEGMENT_ACTIVE_CLASS
                            : TOOLBAR_SEGMENT_INACTIVE_CLASS,
                        )}
                        title="Show direct inventory distinctly separated from nested sub-compartment inventory"
                      >
                        <GitFork className="size-3.5" />
                        <span>Provenance</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualizationMode("occupancy")}
                        aria-pressed={visualizationMode === "occupancy"}
                        className={cn(
                          TOOLBAR_SEGMENT_CLASS,
                          visualizationMode === "occupancy"
                            ? TOOLBAR_SEGMENT_ACTIVE_CLASS
                            : TOOLBAR_SEGMENT_INACTIVE_CLASS,
                        )}
                        title="Visualize physical occupancy thresholds where configured, or presence where unspecified"
                      >
                        <Gauge className="size-3.5" />
                        <span>Occupancy</span>
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowBadges((prev) => !prev)}
                      aria-pressed={showBadges}
                      className={cn(
                        TOOLBAR_CONTROL_CLASS,
                        showBadges
                          ? "bg-muted text-foreground shadow-xs hover:bg-muted"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title="Toggle accessible text badges on 3D compartment face plates"
                    >
                      <Tags className="size-3.5" />
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
                      className={cn(
                        TOOLBAR_CONTROL_CLASS,
                        isAuthoringAnchors
                          ? "bg-amber-500/20 text-amber-700 border-amber-500/50 dark:text-amber-300"
                          : "",
                      )}
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

            {/* Spatial workspace: the visualization and the inspector are
                layout siblings. The inspector is part of the workspace grid
                rather than an overlay, which is what keeps it from ever
                covering the canvas, the page chrome, or the footer, and lets
                the visualization use exactly the remaining width. */}
            <div className="flex flex-col gap-4 lg:min-h-[520px] lg:flex-row lg:items-stretch">
              <div
                data-testid="spatial-canvas-region"
                className="relative min-w-0 flex-1"
              >
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
                    enableDrawerOpening
                    openableKinds={OPERATIONAL_OPENABLE_KINDS}
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

                {/* Anchor Authoring Panel: a transient editing surface for
                    anchor authoring, pinned to the shell chrome instead of the
                    canvas region so it can never run past the viewport or over
                    the footer. */}
                {isAuthoringAnchors && data.parent.model && (
                  <div
                    data-testid="spatial-anchor-editor-overlay"
                    className={cn(
                      "fixed inset-x-2 bottom-[calc(var(--app-footer-height,3.5rem)+1rem)] z-40 flex flex-col",
                      "sm:left-auto sm:right-4 sm:bottom-auto sm:top-[calc(var(--app-header-height,3.5rem)+1rem)] sm:w-96 sm:max-w-[calc(100vw-2rem)]",
                      "max-h-[calc(100dvh-var(--app-header-height,3.5rem)-var(--app-footer-height,3.5rem)-2rem)]",
                    )}
                  >
                    <SpatialAnchorEditor
                      className="min-h-0"
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

              {/* Spatial Location Inspector: a fixed-width, in-flow sidebar. It
                  stays mounted and shows an empty state when nothing is
                  selected, so selection changes only swap its contents - no
                  positioning, dismissal, or collision logic exists. */}
              <aside
                data-testid="spatial-inspector-sidebar"
                data-state={isInspectorOpen ? "selected" : "empty"}
                aria-label="Spatial location inspector"
                className={cn(
                  "flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card/60",
                  // Desktop: predictable inspector column beside the canvas.
                  "lg:w-[280px] lg:shrink-0 xl:w-[320px]",
                  // Mobile: the canvas stacks above a bounded inspector panel.
                  "max-h-[70vh] lg:max-h-none",
                )}
              >
                {isInspectorOpen && selectedSummary && selectedChild ? (
                  <SpatialInspector
                    summary={selectedSummary}
                    childDto={selectedChild}
                    focusComponentId={focusComponentId}
                    onClose={handleCloseInspector}
                    onEnterLocation={handleNavigate}
                    className="min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none backdrop-blur-none"
                  />
                ) : (
                  <SpatialInspectorEmptyState isAuthoring={isAuthoringAnchors} />
                )}
              </aside>
            </div>
          </div>
        </div>
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
