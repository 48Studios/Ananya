import type {
  LocationOperationalViewChildDto,
  SpatialAnchorDto,
  SpatialModelDto,
  SpatialNodeDto,
} from "../api/spatial-api";
import type { CellStockSummary } from "./spatial-inventory-mapper";

/**
 * Standard unit scale: 1 world unit = 1000 millimeters (1 meter).
 * Working in meters ensures realistic camera clipping planes (near: 0.01m, far: 100m)
 * and standard Three.js lighting attenuation.
 */
export const MM_TO_METERS = 0.001;

export function mmToMeters(mm: number): number {
  return (mm || 0) * MM_TO_METERS;
}

export function metersToMm(meters: number): number {
  return (meters || 0) / MM_TO_METERS;
}

export function degToRad(degrees: number): number {
  return ((degrees || 0) * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return ((radians || 0) * 180) / Math.PI;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: Vector3D;
  max: Vector3D;
  center: Vector3D;
  size: Vector3D;
}

export interface SceneChildLayout {
  locationId: string;
  locationCode: string;
  locationName: string;
  kind: string;
  isMapped: boolean;
  hasStock: boolean;
  totalQuantity: number;
  // Local position relative to parent model (in meters)
  position: Vector3D;
  // Local rotation in radians
  rotation: Vector3D;
  // Dimensions in meters
  dimensions: Vector3D;
  anchorCode?: string;
  modelCode?: string;
  format?: string;
  rawChild: LocationOperationalViewChildDto;
}

export type SpatialVisualizationMode = "standard" | "provenance" | "occupancy";

export type SemanticVisualState =
  | "selected"
  | "locate-target"
  | "has-stock"
  | "empty-mapped"
  | "unmapped"
  | "disabled"
  // Provenance-specific states
  | "stock-direct"
  | "stock-descendant"
  | "stock-mixed"
  // Occupancy-specific states
  | "occupancy-empty"
  | "occupancy-low"
  | "occupancy-moderate"
  | "occupancy-high"
  | "occupancy-over"
  | "occupancy-unspecified";

/**
 * Resolves the effective 3D dimensions of an object in meters.
 * Priority:
 * 1. Object's own SpatialModel dimensions
 * 2. Assigned SpatialAnchor's bounding dimensions
 * 3. Sensible defaults based on location kind
 */
export function resolveObjectDimensions(
  model: SpatialModelDto | null | undefined,
  anchor: SpatialAnchorDto | null | undefined,
  kind?: string,
): Vector3D {
  if (model?.widthMm && model?.heightMm && model?.depthMm) {
    return {
      x: mmToMeters(model.widthMm),
      y: mmToMeters(model.heightMm),
      z: mmToMeters(model.depthMm),
    };
  }

  if (
    anchor?.boundingWidthMm &&
    anchor?.boundingHeightMm &&
    anchor?.boundingDepthMm
  ) {
    return {
      x: mmToMeters(anchor.boundingWidthMm),
      y: mmToMeters(anchor.boundingHeightMm),
      z: mmToMeters(anchor.boundingDepthMm),
    };
  }

  // Fallbacks by kind (in mm)
  switch (kind?.toLowerCase()) {
    case "drawer":
      return { x: mmToMeters(180), y: mmToMeters(70), z: mmToMeters(350) };
    case "bin":
      return { x: mmToMeters(80), y: mmToMeters(60), z: mmToMeters(120) };
    case "shelf":
      return { x: mmToMeters(950), y: mmToMeters(300), z: mmToMeters(350) };
    case "cabinet":
      return { x: mmToMeters(600), y: mmToMeters(900), z: mmToMeters(400) };
    default:
      return { x: mmToMeters(100), y: mmToMeters(100), z: mmToMeters(100) };
  }
}

/**
 * Resolves the 3D local position of a child node relative to its parent model in meters.
 *
 * Anchor coordinates are interpreted consistently relative to their parent model:
 * - Corner-based origin (standard CAD/warehouse authoring where X in [0, width]):
 *   Shifted horizontally by -width / 2 so children sit inside the centered parent frame [-W/2, +W/2].
 * - Center-based origin (where X is authored around 0 or has negative coordinates):
 *   Preserved directly without shifting.
 * - Y coordinates remain grounded on the floor/bottom [0, height].
 * - Z coordinates in [0, depth] are centered relative to parent depth if positive.
 */
export function resolveChildPosition(
  node: SpatialNodeDto | null | undefined,
  anchor: SpatialAnchorDto | null | undefined,
  parentDimensions?: Vector3D | null,
): Vector3D {
  let rawX = 0;
  let rawY = 0;
  let rawZ = 0;

  if (anchor) {
    rawX += anchor.localPositionX;
    rawY += anchor.localPositionY;
    rawZ += anchor.localPositionZ;
  }

  if (node) {
    rawX += node.positionX;
    rawY += node.positionY;
    rawZ += node.positionZ;
  }

  let x = mmToMeters(rawX);
  const y = mmToMeters(rawY);
  let z = mmToMeters(rawZ);

  // If parent dimensions are available, check whether coordinates were authored
  // using corner-based origin [0, W] or centered origin [-W/2, +W/2].
  const isExplicitlyCentered =
    anchor?.metadata &&
    typeof anchor.metadata === "object" &&
    (anchor.metadata as Record<string, unknown>).origin === "center";

  if (parentDimensions && parentDimensions.x > 0 && !isExplicitlyCentered) {
    // If coordinate is positive and within the parent's width, it is corner-based:
    // convert from [0, W] to centered parent frame [-W/2, +W/2]
    if (rawX >= 0 && x <= parentDimensions.x) {
      x -= parentDimensions.x / 2;
    }
  }

  if (parentDimensions && parentDimensions.z > 0 && !isExplicitlyCentered) {
    if (rawZ >= 0 && z <= parentDimensions.z) {
      z -= parentDimensions.z / 2;
    }
  }

  return { x, y, z };
}

/**
 * Resolves rotation angles in radians.
 */
export function resolveChildRotation(
  node: SpatialNodeDto | null | undefined,
  anchor: SpatialAnchorDto | null | undefined,
): Vector3D {
  let rx = 0;
  let ry = 0;
  let rz = 0;

  if (anchor) {
    rx += degToRad(anchor.localRotationX);
    ry += degToRad(anchor.localRotationY);
    rz += degToRad(anchor.localRotationZ);
  }

  if (node) {
    rx += degToRad(node.rotationX);
    ry += degToRad(node.rotationY);
    rz += degToRad(node.rotationZ);
  }

  return { x: rx, y: ry, z: rz };
}

/**
 * Categorizes and positions children of a parent location for 3D visualization.
 *
 * Mapped children (assigned to an anchor or carrying valid spatial positions)
 * receive exact scene transforms.
 *
 * Unmapped children are segregated cleanly and reported without inventing false coordinates.
 */
export function layoutChildrenFor3D(
  children: LocationOperationalViewChildDto[],
  parentModel: SpatialModelDto | null,
  stockMap: Map<string, CellStockSummary>,
  parentDimensions?: Vector3D | null,
): {
  mapped: SceneChildLayout[];
  unmapped: LocationOperationalViewChildDto[];
} {
  const effectiveParentDims: Vector3D | null =
    parentDimensions ||
    (parentModel?.widthMm && parentModel?.heightMm && parentModel?.depthMm
      ? {
          x: mmToMeters(parentModel.widthMm),
          y: mmToMeters(parentModel.heightMm),
          z: mmToMeters(parentModel.depthMm),
        }
      : null);

  const mapped: SceneChildLayout[] = [];
  const unmapped: LocationOperationalViewChildDto[] = [];

  for (const child of children) {
    const isMapped = Boolean(child.node && (child.anchor || child.model));
    const stock = stockMap.get(child.location.id);
    const hasStock = Boolean(stock && stock.hasStock);
    const totalQuantity = stock?.totalQuantity || 0;

    if (isMapped) {
      const position = resolveChildPosition(
        child.node,
        child.anchor,
        effectiveParentDims,
      );
      const rotation = resolveChildRotation(child.node, child.anchor);
      const dimensions = resolveObjectDimensions(
        child.model,
        child.anchor,
        child.location.kind,
      );

      mapped.push({
        locationId: child.location.id,
        locationCode: child.location.code,
        locationName: child.location.name,
        kind: child.location.kind,
        isMapped: true,
        hasStock,
        totalQuantity,
        position,
        rotation,
        dimensions,
        anchorCode: child.anchor?.code,
        modelCode: child.model?.code,
        format: child.model?.format,
        rawChild: child,
      });
    } else {
      unmapped.push(child);
    }
  }

  return { mapped, unmapped };
}

/**
 * Resolves which direct child compartment corresponds to a locate target,
 * accounting for deep hierarchy cases (e.g. Locate target is a nested bin inside a drawer).
 */
export function resolveTargetChildLocationId(
  focusLocationId: string | undefined,
  focusComponentId: string | undefined,
  children: LocationOperationalViewChildDto[],
  descendantLocations: Array<{ id: string; parentId: string | null }>,
  stockMap?: Map<string, CellStockSummary> | null,
): string | null {
  if (focusLocationId) {
    // 1. Direct match on immediate child
    if (children.some((c) => c.location.id === focusLocationId)) {
      return focusLocationId;
    }

    // 2. Trace up descendant tree to find containing direct child
    const childIdSet = new Set(children.map((c) => c.location.id));
    const parentMap = new Map<string, string | null>();
    for (const desc of descendantLocations) {
      parentMap.set(desc.id, desc.parentId);
    }
    for (const c of children) {
      parentMap.set(c.location.id, c.location.parentId);
    }

    let curr: string | null = focusLocationId;
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      if (childIdSet.has(curr)) {
        return curr;
      }
      curr = parentMap.get(curr) || null;
    }
  }

  // 3. Fallback: resolve from component stock map
  if (focusComponentId && stockMap) {
    for (const [childId, summary] of stockMap.entries()) {
      const hasComponent = summary.components.some(
        (comp) => comp.componentId === focusComponentId,
      );
      if (hasComponent) {
        return childId;
      }
    }
  }

  return null;
}

/**
 * Calculates the bounding box enclosing a set of 3D objects or parent model dimensions.
 */
export function computeSceneBoundingBox(
  parentDimensions: Vector3D,
  children: SceneChildLayout[],
): BoundingBox3D {
  let minX = -parentDimensions.x / 2;
  let maxX = parentDimensions.x / 2;
  let minY = 0;
  let maxY = parentDimensions.y;
  let minZ = -parentDimensions.z / 2;
  let maxZ = parentDimensions.z / 2;

  for (const child of children) {
    const halfX = child.dimensions.x / 2;
    const halfY = child.dimensions.y / 2;
    const halfZ = child.dimensions.z / 2;

    const childMinX = child.position.x - halfX;
    const childMaxX = child.position.x + halfX;
    const childMinY = child.position.y - halfY;
    const childMaxY = child.position.y + halfY;
    const childMinZ = child.position.z - halfZ;
    const childMaxZ = child.position.z + halfZ;

    if (childMinX < minX) minX = childMinX;
    if (childMaxX > maxX) maxX = childMaxX;
    if (childMinY < minY) minY = childMinY;
    if (childMaxY > maxY) maxY = childMaxY;
    if (childMinZ < minZ) minZ = childMinZ;
    if (childMaxZ > maxZ) maxZ = childMaxZ;
  }

  const size = {
    x: Math.max(0.1, maxX - minX),
    y: Math.max(0.1, maxY - minY),
    z: Math.max(0.1, maxZ - minZ),
  };

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center,
    size,
  };
}

export type CameraOrientationPreset = "isometric" | "front" | "top";

/**
 * Computes optimal camera position and target to frame a bounding box from canonical viewpoints.
 */
export function calculateCameraOrientationPreset(
  bounds: BoundingBox3D,
  preset: CameraOrientationPreset = "isometric",
  fovDegrees = 45,
): { position: Vector3D; target: Vector3D; distance: number } {
  const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  const fovRad = (fovDegrees * Math.PI) / 180;
  // Calculate distance needed to fit the bounding sphere in the camera frustum
  const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.6;
  const center = bounds.center;

  let pos: Vector3D;
  if (preset === "front") {
    pos = {
      x: center.x,
      y: center.y,
      z: center.z + distance * 0.95,
    };
  } else if (preset === "top") {
    pos = {
      x: center.x,
      y: center.y + distance * 1.05,
      z: center.z + 0.001,
    };
  } else {
    // Elevate camera at a natural 30-degree isometric viewing angle with 45-degree azimuth
    const angleY = (30 * Math.PI) / 180;
    const angleX = (45 * Math.PI) / 180;
    pos = {
      x: center.x + distance * Math.cos(angleY) * Math.sin(angleX),
      y: center.y + distance * Math.sin(angleY),
      z: center.z + distance * Math.cos(angleY) * Math.cos(angleX),
    };
  }

  return {
    position: pos,
    target: { ...center },
    distance,
  };
}

/**
 * Computes optimal camera position and target to frame a bounding box.
 */
export function calculateCameraFit(
  bounds: BoundingBox3D,
  fovDegrees = 45,
): { position: Vector3D; target: Vector3D; distance: number } {
  return calculateCameraOrientationPreset(bounds, "isometric", fovDegrees);
}

/**
 * Determines the visual state for an entity in the 3D scene.
 */
export function getSemanticVisualState(
  locationId: string,
  options: {
    selectedLocationId?: string | null;
    highlightedLocationId?: string | null;
    hasStock: boolean;
    isMapped: boolean;
    isActive?: boolean;
    /**
     * Workflow-level gate (e.g. parent-first): renders the compartment in the
     * disabled palette without implying the underlying location is inactive.
     */
    isInteractionDisabled?: boolean;
    mode?: SpatialVisualizationMode;
    stockSummary?: CellStockSummary | null;
  },
): SemanticVisualState {
  if (options.isInteractionDisabled) return "disabled";
  if (options.isActive === false) return "disabled";
  if (locationId === options.highlightedLocationId) return "locate-target";
  if (locationId === options.selectedLocationId) return "selected";
  if (!options.isMapped) return "unmapped";

  const mode = options.mode || "standard";
  const summary = options.stockSummary;

  if (mode === "provenance") {
    if (!options.hasStock || !summary || summary.provenanceStatus === "empty") {
      return "empty-mapped";
    }
    switch (summary.provenanceStatus) {
      case "direct-only":
        return "stock-direct";
      case "descendant-only":
        return "stock-descendant";
      case "mixed":
        return "stock-mixed";
      default:
        return "has-stock";
    }
  }

  if (mode === "occupancy") {
    if (!options.hasStock || !summary || summary.occupancyLevel === "empty") {
      return "occupancy-empty";
    }
    switch (summary.occupancyLevel) {
      case "low":
        return "occupancy-low";
      case "moderate":
        return "occupancy-moderate";
      case "high":
        return "occupancy-high";
      case "over-capacity":
        return "occupancy-over";
      case "unspecified":
        return "occupancy-unspecified";
      default:
        return "occupancy-low";
    }
  }

  // Standard mode
  if (options.hasStock) return "has-stock";
  return "empty-mapped";
}

/**
 * Returns accessible text badge content to print directly on the 3D compartment face plate.
 * Prevents relying purely on color for status or occupancy.
 */
export function getCompartmentBadgeText(
  mode: SpatialVisualizationMode,
  state: SemanticVisualState,
  stockSummary?: CellStockSummary | null,
): string | null {
  if (state === "unmapped" || state === "disabled") {
    return null;
  }

  if (mode === "provenance") {
    if (state === "stock-direct") {
      const count = stockSummary?.directComponentCount || 0;
      return `DIR: ${count} ${count === 1 ? "comp" : "comps"}`;
    }
    if (state === "stock-descendant") {
      const count = stockSummary?.descendantComponentCount || 0;
      return `SUB: ${count} ${count === 1 ? "comp" : "comps"}`;
    }
    if (state === "stock-mixed") {
      const d = stockSummary?.directComponentCount || 0;
      const s = stockSummary?.descendantComponentCount || 0;
      return `DIR ${d} | SUB ${s}`;
    }
    if (state === "empty-mapped") {
      return "EMPTY";
    }
  }

  if (mode === "occupancy") {
    if (state === "occupancy-unspecified") {
      return "PRESENCE (CAP N/A)";
    }
    if (state === "occupancy-empty") {
      return "EMPTY (0%)";
    }
    if (
      stockSummary &&
      stockSummary.fillRatio !== null &&
      stockSummary.fillRatio !== undefined
    ) {
      const pct = Math.round(stockSummary.fillRatio * 100);
      return `OCC: ${pct}%`;
    }
    return "EMPTY";
  }

  // Standard mode
  if (state === "has-stock") {
    const totalComps = stockSummary?.components.length || 0;
    return `${totalComps} ${totalComps === 1 ? "comp" : "comps"}`;
  }

  return null;
}
