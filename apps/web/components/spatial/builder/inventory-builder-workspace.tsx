"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  MapPin,
  Sliders,
  Grid,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Save,
  UploadCloud,
  Archive,
  History,
  Trash2,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  spatialLayoutsApi,
  type CreateSpatialLayoutPayload,
  type UpdateSpatialLayoutPayload,
} from "@/lib/api/spatial-layouts-api";
import { ApiError } from "@/lib/api-client";
import {
  createInitialBuilderState,
  updateParametricConfig,
  setTemplateType,
  commitAsBaseline,
  mapSlotToLocation,
  unmapSlot,
  switchWorkspaceMode,
  acknowledgeStaleMapping,
  setSelectedParentLocation,
  unmapIncompatibleHierarchySlots,
  selectContainer,
  selectCompartment,
  PARENT_CONFLICT_STALE_PREFIX,
  isChildInteractionEnabled,
  buildBuilderUrlSearchParams,
  syncStateFromUrl,
  loadLayoutIntoWorkspace,
  resetWorkspaceToDraft,
  formatWorkspaceMappingsForApi,
  computeIsWorkspaceDirty,
  type BuilderWorkspaceMode,
  type PreviewViewMode,
  type SlotMappingRecord,
} from "@/lib/spatial/inventory-builder-state";
import type {
  ParametricStorageConfig,
  ParametricTemplateType,
  SpatialLayoutWithMappings,
} from "@ananya/inventory";
import { ParametricConfigPanel } from "./parametric-config-panel";
import { ParametricDiffPanel } from "./parametric-diff-panel";
import { ParametricPreview2D } from "./parametric-preview-2d";
import { ParametricPreview3D } from "./parametric-preview-3d";
import { CompartmentInspector } from "./compartment-inspector";
import { ContainerInspector } from "./container-inspector";
import { LocationMappingPanel } from "./location-mapping-panel";
import { LayoutSaveDialog } from "./layout-save-dialog";
import {
  LayoutConflictDialog,
  type LayoutConflictInfo,
} from "./layout-conflict-dialog";
import { LayoutRevisionHistoryDialog } from "./layout-revision-history-dialog";
import { cn } from "@/lib/utils";

export interface InventoryBuilderWorkspaceProps {
  initialMode?: BuilderWorkspaceMode;
  initialParentLocationId?: string | null;
  className?: string;
}

/**
 * Sentinel stored in `pendingParentSwitchId` when the pending action is
 * clearing the container assignment (a real location id is never empty).
 */
const CLEAR_PARENT_SENTINEL = "";

export function InventoryBuilderWorkspace({
  initialMode = "build",
  initialParentLocationId = null,
  className,
}: InventoryBuilderWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Core workspace state (framework-independent state machine)
  const [state, setState] = React.useState(() =>
    createInitialBuilderState(initialMode, initialParentLocationId),
  );

  // 2. Master-data locations for mapping
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loadingLocations, setLoadingLocations] = React.useState(true);
  const [locationsError, setLocationsError] = React.useState<string | null>(
    null,
  );

  // 3. Persisted layouts for the selected parent container
  const [layouts, setLayouts] = React.useState<SpatialLayoutWithMappings[]>([]);
  const [loadingLayouts, setLoadingLayouts] = React.useState(false);
  const [layoutsError, setLayoutsError] = React.useState<string | null>(null);

  // 4. Persistence dialog states & loading indicators
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = React.useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = React.useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // 5. Conflict handling state
  const [conflictInfo, setConflictInfo] =
    React.useState<LayoutConflictInfo | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = React.useState(false);

  // 6. Navigation / layout switch protection (unsaved changes)
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = React.useState(false);
  const [pendingLayoutSwitchId, setPendingLayoutSwitchId] = React.useState<
    string | null
  >(null);
  const [pendingParentSwitchId, setPendingParentSwitchId] = React.useState<
    string | null
  >(null);

  // 7. Draft protection: confirmation for destructive template changes
  const [pendingTemplateType, setPendingTemplateType] =
    React.useState<ParametricTemplateType | null>(null);

  // 8. Invalid deep-link parent location warning & loop prevention ref
  const [invalidParentWarning, setInvalidParentWarning] = React.useState<
    string | null
  >(null);
  const checkedInvalidParentRef = React.useRef<string | null>(null);

  // 9. Success banner / status feedback
  const [notification, setNotification] = React.useState<{
    type: "success" | "info" | "warning";
    message: string;
  } | null>(null);

  // 10. Track last synchronized query string to prevent echo loops with router / history
  const lastSyncedQsRef = React.useRef<string>(
    searchParams ? searchParams.toString() : "",
  );

  // Currently loaded server layout object
  const currentLoadedLayout = React.useMemo(() => {
    if (!state.loadedLayoutId) return null;
    return layouts.find((l) => l.id === state.loadedLayoutId) ?? null;
  }, [layouts, state.loadedLayoutId]);

  // Dirty check: has the workspace drifted from the loaded layout?
  const isDirty = React.useMemo(() => {
    return computeIsWorkspaceDirty(state, currentLoadedLayout);
  }, [state, currentLoadedLayout]);

  // Read by async layout refetches: a response that arrives after the operator
  // started editing must never replace the workspace.
  const isDirtyRef = React.useRef(isDirty);
  React.useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Warn on tab/window close when uncommitted edits exist
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Load master-data locations
  const fetchLocations = React.useCallback(async () => {
    setLoadingLocations(true);
    setLocationsError(null);
    try {
      const data = await locationsApi.getAll();
      setLocations(data);
    } catch (err: unknown) {
      setLocationsError(
        err instanceof Error
          ? err.message
          : "Failed to load master-data locations.",
      );
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const initialAutoLoadedParentRef = React.useRef<string | null>(null);
  const loadedLayoutIdRef = React.useRef<string | null>(state.loadedLayoutId);
  React.useEffect(() => {
    loadedLayoutIdRef.current = state.loadedLayoutId;
  }, [state.loadedLayoutId]);

  // Fetch layouts for selected parent container
  const fetchLayouts = React.useCallback(
    async (parentId: string, keepCurrentLoadedId?: string | null) => {
      setLoadingLayouts(true);
      setLayoutsError(null);
      try {
        const data = await spatialLayoutsApi.getByParent(parentId);
        setLayouts(data);

        // If explicitly requested to remain on a new draft (null), do not auto-load any existing layout
        if (keepCurrentLoadedId === null) {
          return data;
        }

        // If a specific layout was loaded, URL specified layout, or keepCurrentLoadedId specified
        const urlLayoutId = searchParams ? searchParams.get("layout") : null;
        const targetId =
          keepCurrentLoadedId ?? loadedLayoutIdRef.current ?? urlLayoutId;
        let matching = targetId
          ? data.find((l) => l.id === targetId)
          : undefined;

        // If no targetId specified and this container was not previously auto-loaded on mount,
        // default to PUBLISHED layout or first layout if available
        if (
          !matching &&
          !targetId &&
          data.length > 0 &&
          initialAutoLoadedParentRef.current !== parentId
        ) {
          initialAutoLoadedParentRef.current = parentId;
          matching = data.find((l) => l.status === "PUBLISHED") ?? data[0];
        }

        if (matching) {
          // A background refetch (triggered by a URL or master-data change)
          // must never overwrite unsaved workspace edits. Re-loading the
          // already-open layout while the workspace is clean is still useful:
          // it re-resolves mapping labels once master data arrives.
          const alreadyLoaded = loadedLayoutIdRef.current === matching.id;
          if (!alreadyLoaded || !isDirtyRef.current) {
            setState((prev) =>
              loadLayoutIntoWorkspace(prev, matching, locations),
            );
          }
        }
        return data;
      } catch (err) {
        setLayoutsError(
          err instanceof Error
            ? err.message
            : "Failed to load layouts for parent container.",
        );
        setLayouts([]);
        return [];
      } finally {
        setLoadingLayouts(false);
      }
    },
    [locations, searchParams],
  );

  React.useEffect(() => {
    if (state.selectedParentLocationId) {
      fetchLayouts(state.selectedParentLocationId);
    } else {
      setLayouts([]);
    }
  }, [state.selectedParentLocationId, fetchLayouts]);

  // Synchronize state changes to URL query parameters preserving unrelated query parameters
  const updateUrl = React.useCallback(
    (
      newMode: BuilderWorkspaceMode,
      newParentId: string | null,
      newLayoutId?: string | null,
    ) => {
      const currentQs = searchParams ? searchParams.toString() : "";
      const params = buildBuilderUrlSearchParams(currentQs, {
        mode: newMode,
        selectedParentLocationId: newParentId,
        loadedLayoutId:
          newLayoutId !== undefined ? newLayoutId : state.loadedLayoutId,
      });
      const newQs = params.toString();

      if (newQs !== currentQs) {
        lastSyncedQsRef.current = newQs;
        const newUrl = newQs ? `?${newQs}` : window.location.pathname;
        router.push(newUrl, { scroll: false });
      }
    },
    [searchParams, router, state.loadedLayoutId],
  );

  // Synchronize URL changes (e.g. Browser Back/Forward navigation) into state
  React.useEffect(() => {
    const currentQs = searchParams ? searchParams.toString() : "";
    if (currentQs === lastSyncedQsRef.current) {
      return;
    }
    lastSyncedQsRef.current = currentQs;

    setState((prev) => {
      const { state: updatedState, changed } = syncStateFromUrl(
        prev,
        searchParams,
        locations,
      );
      return changed ? updatedState : prev;
    });
  }, [searchParams, locations]);

  // Deep-link validation: verify requested parent-location ID exists in master-data
  React.useEffect(() => {
    if (
      !loadingLocations &&
      state.selectedParentLocationId &&
      locations.length > 0
    ) {
      const exists = locations.some(
        (l) => l.id === state.selectedParentLocationId,
      );
      if (
        !exists &&
        checkedInvalidParentRef.current !== state.selectedParentLocationId
      ) {
        checkedInvalidParentRef.current = state.selectedParentLocationId;
        setInvalidParentWarning(
          `Requested parent storage location "${state.selectedParentLocationId}" was not found or is inaccessible.`,
        );
        setState((prev) => setSelectedParentLocation(prev, null, locations));
        updateUrl(state.mode, null);
      }
    }
  }, [
    loadingLocations,
    locations,
    state.selectedParentLocationId,
    state.mode,
    updateUrl,
  ]);

  // ==========================================
  // Layout Persistence Actions & Handlers
  // ==========================================

  // Switching layout with unsaved-changes protection
  const handleSelectLayout = React.useCallback(
    (layoutId: string | null) => {
      if (!layoutId || layoutId === state.loadedLayoutId) return;

      if (isDirty) {
        setPendingLayoutSwitchId(layoutId);
        setIsUnsavedConfirmOpen(true);
        return;
      }

      if (layoutId === "NEW") {
        setState((prev) => resetWorkspaceToDraft(prev));
        updateUrl(state.mode, state.selectedParentLocationId, null);
      } else {
        const layout = layouts.find((l) => l.id === layoutId);
        if (layout) {
          setState((prev) => loadLayoutIntoWorkspace(prev, layout, locations));
          updateUrl(state.mode, state.selectedParentLocationId, layout.id);
        }
      }
    },
    [
      isDirty,
      state.loadedLayoutId,
      layouts,
      locations,
      state.mode,
      state.selectedParentLocationId,
      updateUrl,
    ],
  );

  const handleConfirmDiscardAndSwitch = React.useCallback(() => {
    setIsUnsavedConfirmOpen(false);
    if (pendingLayoutSwitchId !== null) {
      if (pendingLayoutSwitchId === "NEW") {
        setState((prev) => resetWorkspaceToDraft(prev));
        updateUrl(state.mode, state.selectedParentLocationId, null);
      } else {
        const layout = layouts.find((l) => l.id === pendingLayoutSwitchId);
        if (layout) {
          setState((prev) => loadLayoutIntoWorkspace(prev, layout, locations));
          updateUrl(state.mode, state.selectedParentLocationId, layout.id);
        }
      }
      setPendingLayoutSwitchId(null);
    } else if (pendingParentSwitchId !== null) {
      const targetParentId =
        pendingParentSwitchId === CLEAR_PARENT_SENTINEL
          ? null
          : pendingParentSwitchId;
      setState((prev) =>
        setSelectedParentLocation(prev, targetParentId, locations),
      );
      updateUrl(state.mode, targetParentId, null);
      setPendingParentSwitchId(null);
    }
  }, [
    pendingLayoutSwitchId,
    pendingParentSwitchId,
    layouts,
    locations,
    state.mode,
    state.selectedParentLocationId,
    updateUrl,
  ]);

  // Saving drafts (Create or Update)
  const handleSaveDraft = async (data: {
    code: string;
    name: string;
    description: string;
    changeDescription?: string;
  }) => {
    if (!state.selectedParentLocationId) {
      throw new Error(
        "A parent physical container location must be selected before saving.",
      );
    }

    setIsSaving(true);
    setNotification(null);

    const apiMappings = formatWorkspaceMappingsForApi(
      state.mappings,
      state.generatedResult,
    );

    try {
      if (!state.loadedLayoutId) {
        // Create new draft layout
        const payload: CreateSpatialLayoutPayload = {
          parentLocationId: state.selectedParentLocationId,
          code: data.code,
          name: data.name,
          description: data.description || undefined,
          templateType: state.config.templateType,
          config: state.config as unknown as Record<string, unknown>,
          mappings: apiMappings,
        };

        const created = await spatialLayoutsApi.create(payload);
        setState((prev) => loadLayoutIntoWorkspace(prev, created, locations));
        updateUrl(state.mode, state.selectedParentLocationId, created.id);
        setNotification({
          type: "success",
          message: `Layout draft "${created.name}" created successfully.`,
        });
        if (state.selectedParentLocationId) {
          await fetchLayouts(state.selectedParentLocationId, created.id);
        }
      } else {
        // Update existing draft layout
        const payload: UpdateSpatialLayoutPayload = {
          expectedRevision: state.loadedRevision ?? 1,
          name: data.name,
          description: data.description || undefined,
          templateType: state.config.templateType,
          config: state.config as unknown as Record<string, unknown>,
          mappings: apiMappings,
          changeDescription: data.changeDescription,
        };

        const updated = await spatialLayoutsApi.update(
          state.loadedLayoutId,
          payload,
        );
        setState((prev) => loadLayoutIntoWorkspace(prev, updated, locations));
        updateUrl(state.mode, state.selectedParentLocationId, updated.id);
        setNotification({
          type: "success",
          message: `Layout draft updated (Revision ${updated.revision}).`,
        });
        if (state.selectedParentLocationId) {
          await fetchLayouts(state.selectedParentLocationId, updated.id);
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 409) {
        const details = err.details as Record<string, unknown> | undefined;
        if (details?.error === "REVISION_CONFLICT") {
          setConflictInfo({
            type: "REVISION_CONFLICT",
            currentRevision: (details.currentRevision as number) ?? 1,
            expectedRevision: (details.expectedRevision as number) ?? 1,
            updatedBy: (details.updatedBy as string) ?? null,
            updatedAt: (details.updatedAt as string) ?? null,
          });
          return;
        }
      }
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Publishing layout
  const handlePublishConfirm = async (overwriteManualNodes = false) => {
    if (!state.loadedLayoutId) return;

    setIsPublishing(true);
    setNotification(null);

    try {
      const published = await spatialLayoutsApi.publish(state.loadedLayoutId, {
        expectedRevision: state.loadedRevision ?? 1,
        overwriteManualSpatialNodes: overwriteManualNodes,
        changeDescription: "Published via Inventory Builder",
      });

      setState((prev) => loadLayoutIntoWorkspace(prev, published, locations));
      setIsPublishConfirmOpen(false);
      setConflictInfo(null);
      setNotification({
        type: "success",
        message: `Layout "${published.name}" published successfully! 3D spatial nodes are synchronized.`,
      });
      if (state.selectedParentLocationId) {
        await fetchLayouts(state.selectedParentLocationId, published.id);
      }
    } catch (err: unknown) {
      if (
        err instanceof ApiError &&
        (err.statusCode === 409 || err.statusCode === 422)
      ) {
        const details = err.details as Record<string, unknown> | undefined;
        if (details?.error === "INACTIVE_LAYOUT_PARENT") {
          // Publication-only gate: the draft, mappings, unsaved edits, and
          // revision state are untouched — surface a distinct, actionable
          // dialog instead of the generic warning banner.
          setConflictInfo({
            type: "INACTIVE_LAYOUT_PARENT",
            parentLocationId: (details.parentLocationId as string) ?? "",
          });
          setIsPublishConfirmOpen(false);
          return;
        }
        if (details?.error === "PUBLISHED_LAYOUT_ALREADY_EXISTS") {
          setConflictInfo({
            type: "PUBLISHED_LAYOUT_ALREADY_EXISTS",
            parentLocationId: (details.parentLocationId as string) ?? "",
            existingLayoutId: (details.existingLayoutId as string) ?? "",
            existingLayoutCode: (details.existingLayoutCode as string) ?? "",
          });
          setIsPublishConfirmOpen(false);
          return;
        }
        if (details?.error === "SPATIAL_NODE_OWNERSHIP_CONFLICT") {
          setConflictInfo({
            type: "SPATIAL_NODE_OWNERSHIP_CONFLICT",
            conflictingNodes:
              (details.conflictingNodes as Array<{
                nodeId: string;
                locationId: string;
                existingSource: string;
                existingOwnerId: string | null;
              }>) ?? [],
          });
          setIsPublishConfirmOpen(false);
          return;
        }
        if (details?.error === "REVISION_CONFLICT") {
          setConflictInfo({
            type: "REVISION_CONFLICT",
            currentRevision: (details.currentRevision as number) ?? 1,
            expectedRevision: (details.expectedRevision as number) ?? 1,
            updatedBy: (details.updatedBy as string) ?? null,
            updatedAt: (details.updatedAt as string) ?? null,
          });
          setIsPublishConfirmOpen(false);
          return;
        }
      }
      setNotification({
        type: "warning",
        message:
          err instanceof Error ? err.message : "Failed to publish layout.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Archiving layout
  const handleArchiveConfirm = async () => {
    if (!state.loadedLayoutId) return;

    setIsArchiving(true);
    setNotification(null);

    try {
      const archived = await spatialLayoutsApi.archive(state.loadedLayoutId, {
        expectedRevision: state.loadedRevision ?? 1,
        changeDescription: "Archived via Inventory Builder",
      });

      setState((prev) => loadLayoutIntoWorkspace(prev, archived, locations));
      setIsArchiveConfirmOpen(false);
      setNotification({
        type: "info",
        message: `Layout "${archived.name}" archived. Spatial nodes have been cleaned up.`,
      });
      if (state.selectedParentLocationId) {
        await fetchLayouts(state.selectedParentLocationId, archived.id);
      }
    } catch (err) {
      setNotification({
        type: "warning",
        message:
          err instanceof Error ? err.message : "Failed to archive layout.",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  // Deleting un-published draft layout
  const handleDeleteDraftConfirm = async () => {
    if (!state.loadedLayoutId) return;

    setIsDeleting(true);
    setNotification(null);

    try {
      await spatialLayoutsApi.delete(state.loadedLayoutId);
      setIsDeleteConfirmOpen(false);
      setNotification({
        type: "info",
        message: `Draft layout deleted successfully.`,
      });
      const parentId = state.selectedParentLocationId;
      setState((prev) => resetWorkspaceToDraft(prev));
      if (parentId) {
        await fetchLayouts(parentId, null);
      }
    } catch (err) {
      setNotification({
        type: "warning",
        message:
          err instanceof Error ? err.message : "Failed to delete draft layout.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Conflict resolution actions
  const handleReloadServer = async () => {
    if (!state.loadedLayoutId) return;
    setIsResolvingConflict(true);
    try {
      const fresh = await spatialLayoutsApi.getById(state.loadedLayoutId);
      setState((prev) => loadLayoutIntoWorkspace(prev, fresh, locations));
      setNotification({
        type: "info",
        message: `Reloaded server revision ${fresh.revision}.`,
      });
      // Refresh the layout switcher so its revision/status labels match the loaded layout
      if (state.selectedParentLocationId) {
        await fetchLayouts(state.selectedParentLocationId, fresh.id);
      }
    } finally {
      setIsResolvingConflict(false);
    }
  };

  const handleForceOverwrite = async (serverRevision: number) => {
    if (!state.loadedLayoutId) return;
    setIsResolvingConflict(true);
    try {
      const apiMappings = formatWorkspaceMappingsForApi(
        state.mappings,
        state.generatedResult,
      );
      const payload: UpdateSpatialLayoutPayload = {
        expectedRevision: serverRevision,
        name: state.loadedLayoutName ?? "Updated Layout",
        description: state.loadedLayoutDescription ?? undefined,
        templateType: state.config.templateType,
        config: state.config as unknown as Record<string, unknown>,
        mappings: apiMappings,
        changeDescription: "Resolved revision conflict via force overwrite",
      };

      const updated = await spatialLayoutsApi.update(
        state.loadedLayoutId,
        payload,
      );
      setState((prev) => loadLayoutIntoWorkspace(prev, updated, locations));
      setNotification({
        type: "success",
        message: `Changes committed on top of revision ${updated.revision}.`,
      });
      if (state.selectedParentLocationId) {
        await fetchLayouts(state.selectedParentLocationId, updated.id);
      }
    } finally {
      setIsResolvingConflict(false);
    }
  };

  // Handlers for state updates
  const handleConfigChange = React.useCallback(
    (newConfig: ParametricStorageConfig) => {
      setState((prev) => updateParametricConfig(prev, newConfig));
    },
    [],
  );

  // Protect draft mappings: confirm before changing template if mappings exist
  const handleSelectTemplate = React.useCallback(
    (templateType: ParametricTemplateType) => {
      if (templateType === state.config.templateType) return;
      if (state.mappings.size > 0) {
        setPendingTemplateType(templateType);
      } else {
        setState((prev) => setTemplateType(prev, templateType));
      }
    },
    [state.config.templateType, state.mappings.size],
  );

  const handleCommitBaseline = React.useCallback(() => {
    setState((prev) => commitAsBaseline(prev));
  }, []);

  const handleSelectSlot = React.useCallback((slotId: string) => {
    setState((prev) => selectCompartment(prev, slotId));
  }, []);

  const handleSelectContainer = React.useCallback(() => {
    setState((prev) => selectContainer(prev));
  }, []);

  const handleMapToLocation = React.useCallback(
    (slotId: string, loc: LocationDto) => {
      setState((prev) => mapSlotToLocation(prev, slotId, loc, locations));
    },
    [locations],
  );

  const handleUnmap = React.useCallback((slotId: string) => {
    setState((prev) => unmapSlot(prev, slotId));
  }, []);

  const handleAcknowledgeStale = React.useCallback((slotId: string) => {
    setState((prev) => acknowledgeStaleMapping(prev, slotId));
  }, []);

  const handleModeChange = React.useCallback(
    (newMode: BuilderWorkspaceMode) => {
      setState((prev) => switchWorkspaceMode(prev, newMode));
      updateUrl(newMode, state.selectedParentLocationId);
    },
    [state.selectedParentLocationId, updateUrl],
  );

  const handleViewModeChange = React.useCallback(
    (viewMode: PreviewViewMode) => {
      setState((prev) => ({ ...prev, viewMode }));
    },
    [],
  );

  const handleSelectParentLocation = React.useCallback(
    (parentId: string | null) => {
      if (parentId === state.selectedParentLocationId) return;

      if (isDirty) {
        setPendingParentSwitchId(
          parentId === null ? CLEAR_PARENT_SENTINEL : parentId,
        );
        setIsUnsavedConfirmOpen(true);
        return;
      }

      setState((prev) => setSelectedParentLocation(prev, parentId, locations));
      updateUrl(state.mode, parentId);
    },
    [isDirty, state.selectedParentLocationId, state.mode, locations, updateUrl],
  );

  const handleClearParentLocation = React.useCallback(() => {
    handleSelectParentLocation(null);
  }, [handleSelectParentLocation]);

  const handleUnlinkIncompatible = React.useCallback(() => {
    setState((prev) => unmapIncompatibleHierarchySlots(prev, locations));
  }, [locations]);

  // Count of mappings with hierarchy mismatch relative to selected parent
  const incompatibleMappings = React.useMemo(() => {
    const list: SlotMappingRecord[] = [];
    for (const record of state.mappings.values()) {
      if (
        record.isStale &&
        (record.staleReason?.startsWith("Hierarchy mismatch") ||
          record.staleReason?.startsWith("No parent container") ||
          record.staleReason?.startsWith(PARENT_CONFLICT_STALE_PREFIX))
      ) {
        list.push(record);
      }
    }
    return list;
  }, [state.mappings]);

  // Selected compartment object from generated result
  const selectedCompartment = React.useMemo(() => {
    if (!state.generatedResult || !state.selectedSlotId) return null;
    return (
      state.generatedResult.compartments.find(
        (c) => c.slotId === state.selectedSlotId,
      ) ?? null
    );
  }, [state.generatedResult, state.selectedSlotId]);

  const selectedMapping = state.selectedSlotId
    ? state.mappings.get(state.selectedSlotId)
    : undefined;

  // Single authoritative parent-first gate shared by the 2D and 3D previews.
  const childInteractionEnabled = isChildInteractionEnabled(state);

  // Identity of the top-level container's assigned Ananya location, if any.
  const containerIdentity = React.useMemo(() => {
    if (!state.selectedParentLocationId) return null;
    const parent = locations.find(
      (loc) => loc.id === state.selectedParentLocationId,
    );
    if (!parent) return null;
    return {
      code: parent.code,
      name: parent.name,
      kind: parent.kind,
      isActive: parent.isActive,
    };
  }, [locations, state.selectedParentLocationId]);

  const totalSlots = state.generatedResult?.totalCompartments ?? 0;
  const mappedCount = state.mappings.size;

  return (
    <div className={cn("space-y-4", className)}>
      {/* 1. Header & Duplex Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/inventory/locations/spatial">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>Inventory Builder</span>
                {state.loadedLayoutCode ? (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-md font-normal bg-muted border border-border text-foreground">
                    {state.loadedLayoutCode}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-primary/10 text-primary border border-primary/20">
                    Unsaved Layout
                  </span>
                )}
                {state.loadedStatus && (
                  <StatusBadge status={state.loadedStatus} />
                )}
                {isDirty && (
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    • Unsaved Edits
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Parametric storage configuration and physical spatial location
                mapping.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar: Persistence Actions & View Modes */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Persistence Actions */}
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-muted border border-border">
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={isSaving || !state.selectedParentLocationId}
              className="h-7 text-xs px-2.5 font-medium"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              {state.loadedLayoutId ? "Save Draft" : "Save as Draft"}
            </Button>

            {state.loadedLayoutId && state.loadedStatus !== "ARCHIVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPublishConfirmOpen(true)}
                disabled={isPublishing || isSaving}
                className="h-7 text-xs px-2.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium"
              >
                {isPublishing ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <UploadCloud className="size-3.5 mr-1.5" />
                )}
                Publish
              </Button>
            )}

            {state.loadedStatus === "PUBLISHED" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsArchiveConfirmOpen(true)}
                disabled={isArchiving || isSaving}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                {isArchiving ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Archive className="size-3.5 mr-1" />
                )}
                Archive
              </Button>
            )}

            {state.loadedStatus === "DRAFT" && state.loadedLayoutId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isDeleting || isSaving}
                className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
                title="Delete un-published draft"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}

            {state.loadedLayoutId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsHistoryDialogOpen(true)}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                title="View revision audit timeline"
              >
                <History className="size-3.5 mr-1" />
                History
              </Button>
            )}
          </div>

          {/* Duplex Mode Switcher */}
          <div className="flex items-center p-1 rounded-lg bg-muted border border-border">
            <button
              type="button"
              onClick={() => handleModeChange("build")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                state.mode === "build"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sliders className="size-3.5" />
              <span>1. Build</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("map")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                state.mode === "map"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MapPin className="size-3.5" />
              <span>2. Map</span>
            </button>
          </div>

          {/* 2D vs 3D View Switcher */}
          <div className="flex items-center p-1 rounded-lg bg-muted border border-border">
            <button
              type="button"
              onClick={() => handleViewModeChange("2d")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1",
                state.viewMode === "2d"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Grid className="size-3.5" />
              <span>2D Grid</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("3d")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1",
                state.viewMode === "3d"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Box className="size-3.5" />
              <span>3D View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={cn(
            "p-3 rounded-lg border text-xs flex items-center justify-between",
            notification.type === "success" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
            notification.type === "info" &&
              "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300",
            notification.type === "warning" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
          )}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{notification.message}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotification(null)}
            className="h-6 text-[11px] px-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Warning/Error Banners */}
      {locationsError && (
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 flex items-center justify-between text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{locationsError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLocations}
            className="h-7 text-xs border-destructive/30 hover:bg-destructive/20"
          >
            <RefreshCw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {layoutsError && (
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 flex items-center justify-between text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{layoutsError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              state.selectedParentLocationId &&
              fetchLayouts(state.selectedParentLocationId)
            }
            className="h-7 text-xs border-destructive/30 hover:bg-destructive/20"
          >
            <RefreshCw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {invalidParentWarning && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{invalidParentWarning}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInvalidParentWarning(null)}
            className="h-6 text-[11px] hover:bg-amber-500/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Hierarchy Mismatch Warning Banner */}
      {incompatibleMappings.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Hierarchy Mismatch: {incompatibleMappings.length} mapped{" "}
              {incompatibleMappings.length === 1 ? "slot does" : "slots do"} not
              belong to the selected parent container hierarchy.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlinkIncompatible}
            className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/20 font-medium"
          >
            Unlink Incompatible Slots
          </Button>
        </div>
      )}

      {/* 2. Layout & Container Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Layout Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium">Layout:</span>
            {loadingLayouts ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" /> Loading layouts...
              </span>
            ) : layouts.length > 0 ? (
              <div className="w-64 max-w-sm shrink-0">
                <Select
                  value={state.loadedLayoutId ?? "NEW"}
                  onValueChange={handleSelectLayout}
                >
                  <SelectTrigger
                    className="w-full h-8 text-xs bg-card truncate"
                    title="Select spatial layout"
                  >
                    <SelectValue
                      placeholder="Select layout..."
                      className="truncate"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW">+ New Layout Draft</SelectItem>
                    {layouts.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code}) • {l.status} (Rev {l.revision})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <span className="text-muted-foreground italic text-xs">
                No layouts persisted yet for this container.
              </span>
            )}

            {state.loadedLayoutId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectLayout("NEW")}
                className="h-8 text-xs px-2"
                title="Start a new layout draft"
              >
                <Plus className="size-3 mr-1" />
                New Draft
              </Button>
            )}
          </div>
        </div>

        {/* Status / Topology Stats */}
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <button
            type="button"
            onClick={handleSelectContainer}
            aria-pressed={state.selectedContainer}
            data-testid="header-container-chip"
            title={
              containerIdentity
                ? `Top-level container: ${containerIdentity.name} (${containerIdentity.code})`
                : "No Ananya location assigned to the top-level container"
            }
            className={cn(
              "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border transition-colors cursor-pointer",
              state.selectedContainer
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            <Box className="size-3" />
            <span>Container:</span>
            <strong className="font-mono text-foreground">
              {containerIdentity ? containerIdentity.code : "Unassigned"}
            </strong>
          </button>
          <span>
            Slots:{" "}
            <strong className="text-foreground font-mono">{totalSlots}</strong>
          </span>
          <span>
            Mapped:{" "}
            <strong className="text-foreground font-mono">
              {mappedCount} / {totalSlots}
            </strong>
          </span>
          {state.loadedRevision !== null && (
            <span>
              Revision:{" "}
              <strong className="text-foreground font-mono">
                {state.loadedRevision}
              </strong>
            </span>
          )}
          {state.generatedResult && (
            <span className="hidden md:inline">
              Outer:{" "}
              <span className="font-mono text-foreground">
                {state.generatedResult.outerDimensions.widthMm} ×{" "}
                {state.generatedResult.outerDimensions.heightMm} ×{" "}
                {state.generatedResult.outerDimensions.depthMm} mm
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 3. Main Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[640px]">
        {/* Left Column: Configuration or Location Mapping Panel */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          {state.mode === "build" ? (
            <>
              <ParametricConfigPanel
                config={state.config}
                validationErrors={state.validationErrors}
                onChangeConfig={handleConfigChange}
                onSelectTemplate={handleSelectTemplate}
                onResetBaseline={handleCommitBaseline}
              />
              <ParametricDiffPanel
                diff={state.diff}
                onCommitBaseline={handleCommitBaseline}
              />
            </>
          ) : (
            <LocationMappingPanel
              locations={locations}
              mappings={state.mappings}
              selectedParentId={state.selectedParentLocationId}
              onSelectParentId={handleSelectParentLocation}
              onMapToSlot={handleMapToLocation}
              availableSlots={
                state.generatedResult?.compartments.map((c) => ({
                  slotId: c.slotId,
                  code: c.code,
                })) ?? []
              }
            />
          )}
        </div>

        {/* Right Column: Interactive Preview (2D/3D) and Compartment Inspector */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
          {/* Top: 2D or 3D Spatial Canvas */}
          <div className="flex-1 min-h-[420px]">
            {state.viewMode === "2d" ? (
              <ParametricPreview2D
                config={state.config}
                compartments={state.generatedResult?.compartments ?? []}
                diff={state.diff}
                mappings={state.mappings}
                selectedSlotId={state.selectedSlotId}
                onSelectSlot={handleSelectSlot}
                isContainerSelected={state.selectedContainer}
                onSelectContainer={handleSelectContainer}
                childInteractionEnabled={childInteractionEnabled}
                containerIdentity={containerIdentity}
                className="h-full"
              />
            ) : (
              <ParametricPreview3D
                config={state.config}
                compartments={state.generatedResult?.compartments ?? []}
                mappings={state.mappings}
                selectedSlotId={state.selectedSlotId}
                onSelectSlot={handleSelectSlot}
                isContainerSelected={state.selectedContainer}
                onSelectContainer={handleSelectContainer}
                childInteractionEnabled={childInteractionEnabled}
                containerIdentity={containerIdentity}
                onSwitchTo2D={() => handleViewModeChange("2d")}
                className="h-full"
              />
            )}
          </div>

          {/* Bottom: Compartment Inspector & Location Mapper */}
          {state.selectedContainer && state.generatedResult ? (
            <ContainerInspector
              templateType={state.config.templateType}
              outerDimensions={state.generatedResult.outerDimensions}
              totalCompartments={totalSlots}
              locations={locations}
              selectedParentId={state.selectedParentLocationId}
              mappings={state.mappings}
              onSelectParentId={handleSelectParentLocation}
              onClearParent={handleClearParentLocation}
            />
          ) : (
            <CompartmentInspector
              compartment={selectedCompartment}
              mapping={selectedMapping}
              mappings={state.mappings}
              availableLocations={locations}
              selectedParentId={state.selectedParentLocationId}
              onMapToLocation={handleMapToLocation}
              onUnmap={handleUnmap}
              onAcknowledgeStale={handleAcknowledgeStale}
            />
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* Dialog Modals */}
      {/* ========================================== */}

      {/* Save Draft Dialog */}
      <LayoutSaveDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        isNew={!state.loadedLayoutId}
        defaultCode={state.loadedLayoutCode ?? ""}
        defaultName={state.loadedLayoutName ?? ""}
        defaultDescription={state.loadedLayoutDescription ?? ""}
        isSaving={isSaving}
        onSave={handleSaveDraft}
      />

      {/* Publish Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isPublishConfirmOpen}
        title="Publish Spatial Layout"
        description={`Publishing "${state.loadedLayoutName || state.loadedLayoutCode}" will synchronize 3D spatial node records for ${state.mappings.size} mapped locations. Any existing published layout for this container will cause a conflict.`}
        confirmText="Publish Layout"
        cancelText="Cancel"
        variant="default"
        loading={isPublishing}
        onConfirm={() => handlePublishConfirm(false)}
        onCancel={() => setIsPublishConfirmOpen(false)}
      />

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isArchiveConfirmOpen}
        title="Archive Spatial Layout"
        description={`Archiving will decommission "${state.loadedLayoutName || state.loadedLayoutCode}" and unbind builder-managed 3D spatial nodes. This layout cannot be modified after archiving.`}
        confirmText="Archive Layout"
        cancelText="Keep Published"
        variant="destructive"
        loading={isArchiving}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setIsArchiveConfirmOpen(false)}
      />

      {/* Delete Draft Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Draft Layout"
        description={`Are you sure you want to permanently delete draft layout "${state.loadedLayoutName || state.loadedLayoutCode}"? This cannot be undone.`}
        confirmText="Delete Draft"
        cancelText="Cancel"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDeleteDraftConfirm}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      {/* Conflict Resolution Dialog (HTTP 409) */}
      <LayoutConflictDialog
        isOpen={conflictInfo !== null}
        onClose={() => setConflictInfo(null)}
        conflict={conflictInfo}
        isResolving={isResolvingConflict}
        onReloadServer={handleReloadServer}
        onForceOverwrite={handleForceOverwrite}
        onConfirmOwnershipOverwrite={() => handlePublishConfirm(true)}
        onSwitchToConflictingLayout={(conflictingId) => {
          handleSelectLayout(conflictingId);
        }}
      />

      {/* Revision History Timeline Dialog */}
      <LayoutRevisionHistoryDialog
        isOpen={isHistoryDialogOpen}
        onClose={() => setIsHistoryDialogOpen(false)}
        layoutId={state.loadedLayoutId}
        layoutCode={state.loadedLayoutCode}
      />

      {/* Unsaved Changes Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isUnsavedConfirmOpen}
        title="Discard Unsaved Changes?"
        description="You have unsaved changes in your workspace. Discarding will revert to the last saved revision."
        confirmText="Discard & Switch"
        cancelText="Keep Editing"
        variant="destructive"
        onConfirm={handleConfirmDiscardAndSwitch}
        onCancel={() => {
          setIsUnsavedConfirmOpen(false);
          setPendingLayoutSwitchId(null);
          setPendingParentSwitchId(null);
        }}
      />

      {/* Destructive Template Change Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingTemplateType !== null}
        title="Change Storage Template"
        description={`Changing template to ${pendingTemplateType} will reset the compartment layout. You currently have ${state.mappings.size} active draft location ${state.mappings.size === 1 ? "mapping" : "mappings"} that will be cleared. Are you sure you want to proceed?`}
        confirmText="Change Template"
        cancelText="Keep Current"
        variant="destructive"
        onConfirm={() => {
          if (pendingTemplateType) {
            setState((prev) => setTemplateType(prev, pendingTemplateType));
            setPendingTemplateType(null);
          }
        }}
        onCancel={() => setPendingTemplateType(null)}
      />
    </div>
  );
}
