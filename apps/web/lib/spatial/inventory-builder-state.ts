import {
  createDefaultGridPartsTrayConfig,
  createDefaultOpenBinMatrixConfig,
  createDefaultPalletRackConfig,
  createDefaultSmdCabinetConfig,
  diffParametricCompartments,
  generateStorageCompartments,
  validateParametricConfig,
  type Dimensions3D,
  type GeneratedCompartment,
  type GeneratedStorageResult,
  type ParametricCompartmentDiff,
  type ParametricStorageConfig,
  type ParametricTemplateType,
  type SpatialLayoutWithMappings,
  type SpatialLayoutStatus,
} from "@ananya/inventory";
import type { LocationDto } from "../api/locations-api";
import type { SceneChildLayout, Vector3D } from "./spatial-3d-layout";
import { mmToMeters } from "./spatial-3d-layout";

export type BuilderWorkspaceMode = "build" | "map";

export type PreviewViewMode = "2d" | "3d";

/**
 * Synthetic interaction key for the preview's top-level container (carcass).
 * The container is NOT a compartment mapping: its Ananya location is the
 * layout's `parentLocationId`, so it never appears in `spatial_layout_mappings`.
 */
export const BUILDER_CARCASS_LOCATION_ID = "builder-carcass";

/** Stale reason prefix for a compartment mapping that conflicts with the container assignment. */
export const PARENT_CONFLICT_STALE_PREFIX = "Parent conflict";

/**
 * Single authoritative parent-first gate for the whole workspace.
 *
 * Child (drawer/compartment) selection and mapping are only possible once the
 * top-level container has an assigned Ananya location. Both the 2D and 3D
 * previews derive their enabled/disabled state from this one condition, so the
 * views cannot drift apart.
 */
export function isChildInteractionEnabled(state: {
  selectedParentLocationId: string | null;
}): boolean {
  return state.selectedParentLocationId !== null;
}

/**
 * Selection normalisation for the parent-first workflow: without an assigned
 * container the container itself is the active target, never a child slot.
 */
function resolveParentFirstSelection(
  selectedParentLocationId: string | null,
  fallbackSlotId: string | null,
  selectedContainer: boolean,
): { selectedContainer: boolean; selectedSlotId: string | null } {
  if (!selectedParentLocationId) {
    return { selectedContainer: true, selectedSlotId: null };
  }
  if (selectedContainer) {
    return { selectedContainer: true, selectedSlotId: null };
  }
  return { selectedContainer: false, selectedSlotId: fallbackSlotId };
}

export const INCOMPATIBLE_COMPARTMENT_KINDS = new Set([
  "warehouse",
  "room",
  "building",
  "facility",
  "zone",
]);

export interface SlotMappingRecord {
  slotId: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationKind: string;
  mappedAt: string;
  isStale?: boolean;
  staleReason?: string;
  acknowledgedChangeSignature?: string;
}

export interface BuilderWorkspaceState {
  mode: BuilderWorkspaceMode;
  viewMode: PreviewViewMode;
  config: ParametricStorageConfig;
  baselineCompartments: GeneratedCompartment[];
  generatedResult: GeneratedStorageResult | null;
  validationErrors: string[];
  diff: ParametricCompartmentDiff | null;
  mappings: Map<string, SlotMappingRecord>;
  selectedSlotId: string | null;
  /**
   * True when the top-level container (not an individual compartment) is the
   * active preview selection. Mutually exclusive with `selectedSlotId`.
   */
  selectedContainer: boolean;
  selectedParentLocationId: string | null;

  // Phase 3.3 Persistence Properties
  loadedLayoutId: string | null;
  loadedLayoutCode: string | null;
  loadedLayoutName: string | null;
  loadedLayoutDescription: string | null;
  loadedRevision: number | null;
  loadedStatus: SpatialLayoutStatus | null;
}

/**
 * Computes a deterministic configuration signature for a slot's physical meaning and topology.
 * Binds acknowledgment to the exact reviewed configuration rather than a transient boolean.
 */
export function computeSlotMeaningSignature(
  compartment: GeneratedCompartment,
  reason: string,
): string {
  return `${compartment.slotId}:${compartment.code}:${compartment.logicalIndex.row}:${compartment.logicalIndex.col}:${compartment.kind}:${(compartment.metadata?.templateType as string) ?? ""}:${reason}`;
}

/**
 * Recursively retrieves all descendant location IDs under a given parent location.
 * Uses a cycle-safe breadth-first traversal over parentId relations.
 * Note: Does NOT include the parent location itself.
 */
export function getDescendantLocationIds(
  locations: LocationDto[],
  rootParentId: string | null | undefined,
): Set<string> {
  if (!rootParentId || !locations || locations.length === 0) {
    return new Set<string>();
  }

  const childrenMap = new Map<string, string[]>();
  for (const loc of locations) {
    if (loc.parentId) {
      const list = childrenMap.get(loc.parentId) || [];
      list.push(loc.id);
      childrenMap.set(loc.parentId, list);
    }
  }

  const descendantIds = new Set<string>();
  const queue = [...(childrenMap.get(rootParentId) || [])];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (!descendantIds.has(currentId)) {
      descendantIds.add(currentId);
      const grandChildren = childrenMap.get(currentId);
      if (grandChildren) {
        for (const gcId of grandChildren) {
          if (!descendantIds.has(gcId)) {
            queue.push(gcId);
          }
        }
      }
    }
  }

  return descendantIds;
}

/**
 * Creates the initial workspace state with default SMD Drawer Cabinet configuration.
 * Automatically generates the initial baseline for diffing.
 */
export function createInitialBuilderState(
  initialMode: BuilderWorkspaceMode = "build",
  initialParentLocationId: string | null = null,
): BuilderWorkspaceState {
  const defaultConfig = createDefaultSmdCabinetConfig();
  const initialResult = generateStorageCompartments(defaultConfig);

  const initialDiff = diffParametricCompartments(
    initialResult.compartments,
    initialResult.compartments,
  );

  return {
    mode: initialMode,
    viewMode: "2d",
    config: defaultConfig,
    baselineCompartments: initialResult.compartments,
    generatedResult: initialResult,
    validationErrors: [],
    diff: initialDiff,
    mappings: new Map(),
    // Parent-first: without an assigned container, the outer container is the
    // active target and child compartments stay non-interactive.
    selectedContainer: initialParentLocationId === null,
    selectedSlotId: initialParentLocationId
      ? (initialResult.compartments[0]?.slotId ?? null)
      : null,
    selectedParentLocationId: initialParentLocationId,
    loadedLayoutId: null,
    loadedLayoutCode: null,
    loadedLayoutName: null,
    loadedLayoutDescription: null,
    loadedRevision: null,
    loadedStatus: null,
  };
}

/**
 * Updates the parametric configuration, runs pure domain validation and generation,
 * and computes the geometric diff against baseline compartments.
 *
 * Safety Invariant: Does NOT mutate persistent databases or API records.
 */
export function updateParametricConfig(
  state: BuilderWorkspaceState,
  newConfig: ParametricStorageConfig,
): BuilderWorkspaceState {
  const validation = validateParametricConfig(newConfig);

  if (!validation.isValid) {
    return {
      ...state,
      config: newConfig,
      validationErrors: validation.errors,
      // Retain previous generatedResult and diff when invalid to avoid blank screens
    };
  }

  const generatedResult = generateStorageCompartments(newConfig);
  const diff = diffParametricCompartments(
    state.baselineCompartments,
    generatedResult.compartments,
  );

  // Preserve mappings for slots that still exist in the new result
  const validSlotIds = new Set(
    generatedResult.compartments.map((c) => c.slotId),
  );
  const meaningChangedMap = new Map(
    diff.meaningChangedSlots.map((m) => [m.current.slotId, m.reason]),
  );

  const newMappings = new Map<string, SlotMappingRecord>();
  for (const [slotId, record] of state.mappings.entries()) {
    if (validSlotIds.has(slotId)) {
      const comp = generatedResult.compartments.find(
        (c) => c.slotId === slotId,
      )!;
      const staleReason = meaningChangedMap.get(slotId);

      if (staleReason) {
        // Physical meaning or topological ordering changed
        const currentSig = computeSlotMeaningSignature(comp, staleReason);

        if (record.acknowledgedChangeSignature === currentSig) {
          // This exact physical change was already acknowledged by the operator!
          // Dimension-only edits or subsequent edits with matching meaning do NOT re-trigger stale flag.
          newMappings.set(slotId, {
            ...record,
            isStale: false,
            staleReason: undefined,
          });
        } else {
          // Unacknowledged change OR new meaning change occurred -> invalidate prior acknowledgment
          newMappings.set(slotId, {
            ...record,
            isStale: true,
            staleReason,
            acknowledgedChangeSignature: undefined,
          });
        }
      } else {
        // No parametric meaning change relative to baseline
        // Preserve hierarchy mismatch / parent conflict warnings if active; otherwise mark non-stale
        if (
          record.staleReason?.startsWith("Hierarchy mismatch") ||
          record.staleReason?.startsWith("No parent container") ||
          record.staleReason?.startsWith(PARENT_CONFLICT_STALE_PREFIX)
        ) {
          newMappings.set(slotId, record);
        } else {
          newMappings.set(slotId, {
            ...record,
            isStale: false,
            staleReason: undefined,
            acknowledgedChangeSignature: undefined,
          });
        }
      }
    }
  }

  // Preserve the container selection, or the selected compartment when still
  // valid; otherwise fall back to the first compartment. Without an assigned
  // container the parent-first gate keeps the container selected.
  const isSelectedValid =
    state.selectedSlotId !== null && validSlotIds.has(state.selectedSlotId);
  const fallbackSlotId = isSelectedValid
    ? state.selectedSlotId
    : (generatedResult.compartments[0]?.slotId ?? null);
  const selection = resolveParentFirstSelection(
    state.selectedParentLocationId,
    fallbackSlotId,
    state.selectedContainer,
  );

  return {
    ...state,
    config: newConfig,
    generatedResult,
    validationErrors: [],
    diff,
    mappings: newMappings,
    selectedSlotId: selection.selectedSlotId,
    selectedContainer: selection.selectedContainer,
  };
}

/**
 * Switches the active template type and resets the configuration to the chosen template defaults.
 */
export function setTemplateType(
  state: BuilderWorkspaceState,
  templateType: ParametricTemplateType,
): BuilderWorkspaceState {
  let newConfig: ParametricStorageConfig;
  switch (templateType) {
    case "SMD_DRAWER_CABINET":
      newConfig = createDefaultSmdCabinetConfig();
      break;
    case "OPEN_BIN_MATRIX":
      newConfig = createDefaultOpenBinMatrixConfig();
      break;
    case "PALLET_RACK":
      newConfig = createDefaultPalletRackConfig();
      break;
    case "GRID_PARTS_TRAY":
      newConfig = createDefaultGridPartsTrayConfig();
      break;
  }

  return updateParametricConfig(state, newConfig);
}

/**
 * Commits the current generated compartments as the new baseline for diffing.
 * Useful when an operator approves a design step and wants subsequent edits
 * compared against this approved point.
 */
export function commitAsBaseline(
  state: BuilderWorkspaceState,
): BuilderWorkspaceState {
  if (!state.generatedResult) return state;

  const baselineCompartments = state.generatedResult.compartments;
  const diff = diffParametricCompartments(
    baselineCompartments,
    state.generatedResult.compartments,
  );

  return {
    ...state,
    baselineCompartments,
    diff,
  };
}

/**
 * Updates the selected parent container location.
 * Validates existing mappings against the new parent's descendant hierarchy:
 * - Compatible descendant mappings are preserved.
 * - Incompatible or unrelated hierarchy mappings are explicitly flagged as stale with a hierarchy mismatch warning.
 */
export function setSelectedParentLocation(
  state: BuilderWorkspaceState,
  newParentId: string | null,
  locations: LocationDto[],
): BuilderWorkspaceState {
  if (state.selectedParentLocationId === newParentId) {
    return state;
  }

  const newMappings = new Map<string, SlotMappingRecord>();
  const validDescendantIds = newParentId
    ? getDescendantLocationIds(locations, newParentId)
    : new Set<string>();

  for (const [slotId, record] of state.mappings.entries()) {
    if (!newParentId) {
      // Empty parent selection: hierarchy cannot be verified
      newMappings.set(slotId, {
        ...record,
        isStale: true,
        staleReason:
          "No parent container selected; mapping hierarchy unverified",
      });
    } else if (record.locationId === newParentId) {
      // The container itself can never also be a compartment slot. The API
      // rejects this pairing (ParentCannotBeSlotError), so surface it as an
      // explicit parent conflict for resolution instead of a generic mismatch.
      const parentObj = locations.find((l) => l.id === newParentId);
      const parentLabel = parentObj
        ? `"${parentObj.name}" (${parentObj.code})`
        : `'${newParentId}'`;

      newMappings.set(slotId, {
        ...record,
        isStale: true,
        staleReason: `${PARENT_CONFLICT_STALE_PREFIX}: location ${parentLabel} is assigned as the top-level container and cannot also be a compartment slot.`,
      });
    } else if (validDescendantIds.has(record.locationId)) {
      // Retain or restore compatible mapping
      if (
        record.staleReason?.startsWith("Hierarchy mismatch") ||
        record.staleReason?.startsWith("No parent container")
      ) {
        newMappings.set(slotId, {
          ...record,
          isStale: false,
          staleReason: undefined,
        });
      } else {
        newMappings.set(slotId, record);
      }
    } else {
      // Incompatible cross-hierarchy mapping: explicitly flag for resolution
      const parentObj = locations.find((l) => l.id === newParentId);
      const parentLabel = parentObj
        ? `"${parentObj.name}" (${parentObj.code}) [${newParentId}]`
        : `'${newParentId}'`;

      newMappings.set(slotId, {
        ...record,
        isStale: true,
        staleReason: `Hierarchy mismatch: location "${record.locationName}" (${record.locationCode}) does not belong to selected parent container ${parentLabel}`,
      });
    }
  }

  // Parent-first: without a container the container itself becomes the active
  // target, and child selection is cleared (interaction is gated downstream).
  const selection =
    newParentId === null
      ? { selectedContainer: true, selectedSlotId: null }
      : {
          selectedContainer: state.selectedContainer,
          selectedSlotId: state.selectedSlotId,
        };

  return {
    ...state,
    selectedParentLocationId: newParentId,
    mappings: newMappings,
    selectedContainer: selection.selectedContainer,
    selectedSlotId: selection.selectedSlotId,
  };
}

/**
 * Removes all mappings whose locations do not belong to the selected parent container's descendant hierarchy.
 */
export function unmapIncompatibleHierarchySlots(
  state: BuilderWorkspaceState,
  locations: LocationDto[],
): BuilderWorkspaceState {
  if (!state.selectedParentLocationId) {
    return {
      ...state,
      mappings: new Map(),
    };
  }

  const validDescendantIds = getDescendantLocationIds(
    locations,
    state.selectedParentLocationId,
  );
  const newMappings = new Map<string, SlotMappingRecord>();

  for (const [slotId, record] of state.mappings.entries()) {
    if (validDescendantIds.has(record.locationId)) {
      newMappings.set(slotId, record);
    }
  }

  return {
    ...state,
    mappings: newMappings,
  };
}

/**
 * Associates an in-memory draft mapping between a generated slot and an existing Ananya location.
 * Pure client-side state operation. Does not trigger network or database mutations.
 *
 * Enforces:
 * 1. 1:1 bijection between physical locations and generated slots.
 * 2. Selected parent container itself cannot be mapped as an individual slot.
 * 3. Incompatible structural container kinds (warehouse, room, etc.) cannot be mapped.
 * 4. Locations from unrelated parent hierarchies are rejected when locations list is provided.
 */
export function mapSlotToLocation(
  state: BuilderWorkspaceState,
  slotId: string,
  location: LocationDto,
  locations?: LocationDto[],
): BuilderWorkspaceState {
  // Parent-first gate: no compartment mapping is possible until the top-level
  // container location is assigned.
  if (!isChildInteractionEnabled(state)) {
    return state;
  }

  // Reject mapping the selected parent itself
  if (
    state.selectedParentLocationId &&
    location.id === state.selectedParentLocationId
  ) {
    return state;
  }

  // Reject macro structural kinds (warehouse, room, building, facility, zone)
  const kind = (location.kind || "").toLowerCase().trim();
  if (INCOMPATIBLE_COMPARTMENT_KINDS.has(kind)) {
    return state;
  }

  // Prevent mapping locations belonging to unrelated parent hierarchies
  if (locations && state.selectedParentLocationId) {
    const descendantIds = getDescendantLocationIds(
      locations,
      state.selectedParentLocationId,
    );
    if (!descendantIds.has(location.id)) {
      return state;
    }
  }

  const newMappings = new Map(state.mappings);

  // Enforce 1:1 mapping: if this physical location is already mapped to another slot,
  // explicitly unmap it from that slot to prevent duplicate assignments
  for (const [existingSlotId, record] of newMappings.entries()) {
    if (record.locationId === location.id && existingSlotId !== slotId) {
      newMappings.delete(existingSlotId);
    }
  }

  newMappings.set(slotId, {
    slotId,
    locationId: location.id,
    locationCode: location.code,
    locationName: location.name,
    locationKind: location.kind,
    mappedAt: new Date().toISOString(),
    isStale: false,
  });

  return {
    ...state,
    mappings: newMappings,
  };
}

/**
 * Acknowledges and approves a stale mapping whose physical meaning or geometry changed.
 * Binds acknowledgment to the current physical meaning signature so dimension-only edits
 * do not re-trigger stale warnings.
 */
export function acknowledgeStaleMapping(
  state: BuilderWorkspaceState,
  slotId: string,
): BuilderWorkspaceState {
  const existing = state.mappings.get(slotId);
  if (!existing) return state;

  const comp = state.generatedResult?.compartments.find(
    (c) => c.slotId === slotId,
  );
  const sig =
    comp && existing.staleReason
      ? computeSlotMeaningSignature(comp, existing.staleReason)
      : undefined;

  const newMappings = new Map(state.mappings);
  newMappings.set(slotId, {
    ...existing,
    isStale: false,
    staleReason: undefined,
    acknowledgedChangeSignature: sig,
  });

  return {
    ...state,
    mappings: newMappings,
  };
}

/**
 * Removes the in-memory draft mapping association for a given slot.
 */
export function unmapSlot(
  state: BuilderWorkspaceState,
  slotId: string,
): BuilderWorkspaceState {
  const newMappings = new Map(state.mappings);
  newMappings.delete(slotId);

  return {
    ...state,
    mappings: newMappings,
  };
}

/**
 * Switches between "build" (Build New Storage) and "map" (Map Existing Locations) modes.
 */
export function switchWorkspaceMode(
  state: BuilderWorkspaceState,
  newMode: BuilderWorkspaceMode,
): BuilderWorkspaceState {
  return {
    ...state,
    mode: newMode,
  };
}

/**
 * Selects the top-level container (carcass) in the preview.
 * Container selection is distinct from compartment selection: the parent
 * location assignment lives on `parentLocationId`, never in slot mappings.
 */
export function selectContainer(
  state: BuilderWorkspaceState,
): BuilderWorkspaceState {
  if (state.selectedContainer && state.selectedSlotId === null) {
    return state;
  }
  return {
    ...state,
    selectedContainer: true,
    selectedSlotId: null,
  };
}

/**
 * Selects an individual compartment in the preview, clearing any container selection.
 */
export function selectCompartment(
  state: BuilderWorkspaceState,
  slotId: string,
): BuilderWorkspaceState {
  // Parent-first gate: child compartments are not selectable until the
  // top-level container has an assigned Ananya location.
  if (!isChildInteractionEnabled(state)) {
    return state;
  }
  if (state.selectedSlotId === slotId && !state.selectedContainer) {
    return state;
  }
  return {
    ...state,
    selectedSlotId: slotId,
    selectedContainer: false,
  };
}

/**
 * Parses URL search parameters into builder mode and parent location ID.
 */
export function parseBuilderUrlParams(
  searchParams: { get: (key: string) => string | null } | URLSearchParams,
): {
  mode: BuilderWorkspaceMode;
  locationId: string | null;
  layoutId: string | null;
} {
  const modeParam = searchParams.get("mode");
  const mode: BuilderWorkspaceMode = modeParam === "map" ? "map" : "build";
  const locationId = searchParams.get("location") || null;
  const layoutId = searchParams.get("layout") || null;
  return { mode, locationId, layoutId };
}

/**
 * Builds updated URL search parameters preserving any unrelated query parameters.
 */
export function buildBuilderUrlSearchParams(
  currentSearchParams: { toString: () => string } | URLSearchParams | string,
  state: Pick<BuilderWorkspaceState, "mode" | "selectedParentLocationId"> & {
    loadedLayoutId?: string | null;
  },
): URLSearchParams {
  const currentStr =
    typeof currentSearchParams === "string"
      ? currentSearchParams
      : currentSearchParams.toString();
  const params = new URLSearchParams(currentStr);

  if (state.mode === "map") {
    params.set("mode", "map");
  } else {
    params.delete("mode");
  }

  if (state.selectedParentLocationId) {
    params.set("location", state.selectedParentLocationId);
  } else {
    params.delete("location");
  }

  if (state.loadedLayoutId) {
    params.set("layout", state.loadedLayoutId);
  } else {
    params.delete("layout");
  }

  return params;
}

/**
 * Synchronizes workspace state from URL search params without continually overwriting state.
 * Returns updated state and whether a state change occurred.
 */
export function syncStateFromUrl(
  state: BuilderWorkspaceState,
  searchParams: { get: (key: string) => string | null } | URLSearchParams,
  locations?: LocationDto[],
): { state: BuilderWorkspaceState; changed: boolean } {
  const { mode, locationId } = parseBuilderUrlParams(searchParams);
  let changed = false;
  let nextState = state;

  if (state.mode !== mode) {
    nextState = switchWorkspaceMode(nextState, mode);
    changed = true;
  }

  if (state.selectedParentLocationId !== locationId) {
    if (locations && locations.length > 0) {
      nextState = setSelectedParentLocation(nextState, locationId, locations);
    } else {
      // Locations are not loaded yet: apply the parent-first selection rule so
      // the preview cannot keep a child selected without a container.
      const selection = resolveParentFirstSelection(
        locationId,
        nextState.selectedSlotId,
        nextState.selectedContainer,
      );
      nextState = {
        ...nextState,
        selectedParentLocationId: locationId,
        selectedContainer: selection.selectedContainer,
        selectedSlotId: selection.selectedSlotId,
      };
    }
    changed = true;
  }

  return { state: nextState, changed };
}

/**
 * Converts domain GeneratedCompartment list and draft mapping state
 * to Three.js SceneChildLayout objects for the 3D viewport.
 */
export function convertGeneratedToSceneLayout(
  compartments: GeneratedCompartment[],
  mappings: Map<string, SlotMappingRecord>,
  containerDimensions?: Dimensions3D,
): SceneChildLayout[] {
  // Resolve parent container width and depth (in mm) for coordinate centering
  const containerW =
    containerDimensions?.widthMm ??
    (compartments.length > 0
      ? Math.max(
          ...compartments.map((c) => c.position.x + c.dimensions.widthMm / 2),
        )
      : 0);

  const containerD =
    containerDimensions?.depthMm ??
    (compartments.length > 0
      ? Math.max(
          ...compartments.map((c) => c.position.z + c.dimensions.depthMm / 2),
        )
      : 0);

  return compartments.map((comp) => {
    const mapping = mappings.get(comp.slotId);
    const isMapped = Boolean(mapping && !mapping.isStale);

    // Transform corner-origin coordinates [0, W] x [0, H] x [0, D]
    // into parent carcass frame [-W/2, W/2] x [0, H] x [-D/2, D/2]
    const isCenterOrigin =
      (comp.metadata as Record<string, unknown> | undefined)?.origin ===
      "center";
    const sceneXMm = isCenterOrigin
      ? comp.position.x
      : comp.position.x - containerW / 2;
    const sceneYMm = comp.position.y;
    const sceneZMm = isCenterOrigin
      ? comp.position.z
      : comp.position.z - containerD / 2;

    // Position in meters (Three.js coordinates)
    const position: Vector3D = {
      x: mmToMeters(sceneXMm),
      y: mmToMeters(sceneYMm),
      z: mmToMeters(sceneZMm),
    };

    // Dimensions in meters
    const dimensions: Vector3D = {
      x: mmToMeters(comp.dimensions.widthMm),
      y: mmToMeters(comp.dimensions.heightMm),
      z: mmToMeters(comp.dimensions.depthMm),
    };

    const rotation: Vector3D = { x: 0, y: 0, z: 0 };

    return {
      locationId: comp.slotId, // Use slotId as unique interactive key
      locationCode: comp.code,
      locationName: mapping
        ? `${comp.name} → ${mapping.locationName}`
        : comp.name,
      kind: comp.kind,
      isMapped,
      hasStock: false,
      totalQuantity: 0,
      position,
      rotation,
      dimensions,
      anchorCode: comp.code,
      modelCode: comp.metadata.templateType as string,
      rawChild: {
        location: {
          id: mapping?.locationId ?? comp.slotId,
          code: mapping?.locationCode ?? comp.code,
          name: mapping?.locationName ?? comp.name,
          kind: mapping?.locationKind ?? comp.kind,
          parentId: null,
          isActive: true,
          metadata: {
            isDraftSlot: !isMapped,
            isStaleMapping: Boolean(mapping?.isStale),
            staleReason: mapping?.staleReason,
            templateType: comp.metadata.templateType,
            clearDimensions: comp.clearDimensions,
          },
        },
        node: null,
        model: null,
        anchor: null,
      },
    };
  });
}

/**
 * Loads an existing persisted layout and its mappings into the workspace.
 */
export function loadLayoutIntoWorkspace(
  state: BuilderWorkspaceState,
  layout: SpatialLayoutWithMappings,
  locations: LocationDto[],
): BuilderWorkspaceState {
  const config = layout.config;
  const validation = validateParametricConfig(config);
  const generatedResult = validation.isValid
    ? generateStorageCompartments(config)
    : null;
  const baselineCompartments = generatedResult?.compartments ?? [];

  const locMap = new Map(locations.map((loc) => [loc.id, loc]));
  const mappings = new Map<string, SlotMappingRecord>();

  for (const item of layout.mappings) {
    const loc = locMap.get(item.locationId);
    mappings.set(item.slotId, {
      slotId: item.slotId,
      locationId: item.locationId,
      locationCode: loc?.code ?? item.slotCode,
      locationName: loc?.name ?? item.slotCode,
      locationKind: loc?.kind ?? "drawer",
      mappedAt: item.mappedAt
        ? new Date(item.mappedAt).toISOString()
        : new Date().toISOString(),
      isStale: item.isStale ?? false,
      staleReason: item.staleReason ?? undefined,
      acknowledgedChangeSignature:
        item.acknowledgedChangeSignature ?? undefined,
    });
  }

  const initialDiff = generatedResult
    ? diffParametricCompartments(
        baselineCompartments,
        generatedResult.compartments,
      )
    : null;

  return {
    ...state,
    config,
    baselineCompartments,
    generatedResult,
    validationErrors: validation.errors,
    diff: initialDiff,
    mappings,
    selectedSlotId: generatedResult?.compartments[0]?.slotId ?? null,
    selectedContainer: false,
    selectedParentLocationId: layout.parentLocationId,
    loadedLayoutId: layout.id,
    loadedLayoutCode: layout.code,
    loadedLayoutName: layout.name,
    loadedLayoutDescription: layout.description ?? null,
    loadedRevision: layout.revision,
    loadedStatus: layout.status,
  };
}

/**
 * Resets the workspace to an empty new draft.
 */
export function resetWorkspaceToDraft(
  state: BuilderWorkspaceState,
  parentLocationId?: string | null,
): BuilderWorkspaceState {
  const nextParentLocationId =
    parentLocationId !== undefined
      ? parentLocationId
      : state.selectedParentLocationId;
  const defaultConfig = createDefaultSmdCabinetConfig();
  const initialResult = generateStorageCompartments(defaultConfig);
  const initialDiff = diffParametricCompartments(
    initialResult.compartments,
    initialResult.compartments,
  );

  return {
    ...state,
    config: defaultConfig,
    baselineCompartments: initialResult.compartments,
    generatedResult: initialResult,
    validationErrors: [],
    diff: initialDiff,
    mappings: new Map(),
    selectedSlotId: nextParentLocationId
      ? (initialResult.compartments[0]?.slotId ?? null)
      : null,
    selectedContainer: nextParentLocationId === null,
    selectedParentLocationId: nextParentLocationId,
    loadedLayoutId: null,
    loadedLayoutCode: null,
    loadedLayoutName: null,
    loadedLayoutDescription: null,
    loadedRevision: null,
    loadedStatus: null,
  };
}

/**
 * Formats in-memory slot mappings for the spatial layout persistence API.
 */
export function formatWorkspaceMappingsForApi(
  mappings: Map<string, SlotMappingRecord>,
  generated: GeneratedStorageResult | null,
) {
  const compMap = new Map(
    generated?.compartments.map((c) => [c.slotId, c]) ?? [],
  );
  const result = [];

  for (const m of mappings.values()) {
    const comp = compMap.get(m.slotId);
    result.push({
      slotId: m.slotId,
      slotCode: comp?.code ?? m.slotId,
      locationId: m.locationId,
      logicalRow: comp?.logicalIndex.row ?? 0,
      logicalCol: comp?.logicalIndex.col ?? 0,
      isStale: m.isStale ?? false,
      staleReason: m.staleReason ?? null,
      acknowledgedChangeSignature: m.acknowledgedChangeSignature ?? null,
    });
  }

  return result;
}

/**
 * Computes whether the workspace has unsaved changes compared to the loaded server layout.
 */
export function computeIsWorkspaceDirty(
  state: BuilderWorkspaceState,
  loadedLayout: SpatialLayoutWithMappings | null,
): boolean {
  if (!loadedLayout) {
    return state.mappings.size > 0 || (state.diff?.hasChanges ?? false);
  }

  // Compare config
  if (JSON.stringify(state.config) !== JSON.stringify(loadedLayout.config)) {
    return true;
  }

  // Compare mappings count
  if (state.mappings.size !== loadedLayout.mappings.length) {
    return true;
  }

  // Compare each mapping
  for (const item of loadedLayout.mappings) {
    const current = state.mappings.get(item.slotId);
    if (!current || current.locationId !== item.locationId) {
      return true;
    }
    if ((current.isStale ?? false) !== (item.isStale ?? false)) {
      return true;
    }
  }

  return false;
}
