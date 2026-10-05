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
  // Local scale multiplier applied by the renderer (1 = authored dimensions)
  scale: Vector3D;
  // Dimensions in meters
  dimensions: Vector3D;
  anchorCode?: string;
  modelCode?: string;
  format?: string;
  /**
   * True when the child carries no authored placement (no anchor and no node
   * coordinates) and was therefore fanned out into a readable row by
   * `layoutChildrenFor3D` instead of being stacked on its siblings.
   */
  isAutoArranged?: boolean;
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
 * Resolves whether an anchor's Z is authored in the container's corner frame
 * ([0, depth], where 0 is the back plane) or on the mid-depth elevation plane
 * (0 = centre) used by the anchor editor's default.
 *
 * Both conventions exist in persisted data (`validateAnchorBounds` deliberately
 * accepts each), so the anchor's own slot envelope decides: a positive Z whose
 * envelope fits the corner frame is corner-authored, while Z = 0 (the elevation
 * default), a negative Z, or an envelope that only fits the centred frame is
 * mid-depth. The choice only affects rendering; the persisted value never
 * changes.
 */
export function isCornerAuthoredAnchorZ(
  anchor: {
    localPositionZ: number;
    boundingDepthMm?: number | null;
    metadata?: Record<string, unknown> | null;
  },
  parentDepthMeters: number,
): boolean {
  const metadata = anchor.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).origin === "center"
  ) {
    return false;
  }
  if (!(parentDepthMeters > 0)) return false;

  const depthMm = metersToMm(parentDepthMeters);
  const z = Number(anchor.localPositionZ ?? 0);
  const halfExtent = Math.max(0, Number(anchor.boundingDepthMm ?? 0)) / 2;
  const zMin = z - halfExtent;
  const zMax = z + halfExtent;

  const fitsCorner = zMin >= -1 && zMax <= depthMm + 1;
  const fitsCentre = zMin >= -depthMm / 2 - 1 && zMax <= depthMm / 2 + 1;

  // A positive Z inside the corner range is corner-authored, including the
  // ambiguous case where the envelope also fits the centred frame.
  if (fitsCorner && (z > 0 || !fitsCentre)) return true;
  // A malformed envelope that fits neither frame keeps the legacy corner read.
  if (!fitsCorner && !fitsCentre) return true;
  return false;
}

/**
 * Resolves the 3D local position of a child node relative to its parent model in meters.
 *
 * Coordinates are interpreted per source:
 * - Anchor X/Y are corner-based ([0, W], [0, H]) and shift into the centred
 *   parent frame; an explicit `metadata.origin === "center"` skips the shift.
 * - Anchor Z is either corner-based ([0, depth], see
 *   `isCornerAuthoredAnchorZ`) or sits on the mid-depth elevation plane used by
 *   the anchor editor's default (Z = 0 = centre), so it only shifts when the
 *   anchor is corner-authored. Shifting every Z in [0, depth] pushed
 *   elevation-authored children half a container out of their parent.
 * - Builder-published node coordinates are corner-authored slot centres in all
 *   axes (the storage engine emits `origin: "corner"`), and refine an anchor
 *   placement as an offset when both are present.
 * - Y coordinates remain grounded on the floor/bottom [0, height].
 */
export function resolveChildPosition(
  node: SpatialNodeDto | null | undefined,
  anchor: SpatialAnchorDto | null | undefined,
  parentDimensions?: Vector3D | null,
): Vector3D {
  const frameWidth = parentDimensions?.x ?? 0;
  const frameDepth = parentDimensions?.z ?? 0;

  const isExplicitlyCentered = Boolean(
    anchor?.metadata &&
      typeof anchor.metadata === "object" &&
      (anchor.metadata as Record<string, unknown>).origin === "center",
  );

  const rawX = (anchor?.localPositionX ?? 0) + (node?.positionX ?? 0);
  const rawY = (anchor?.localPositionY ?? 0) + (node?.positionY ?? 0);

  let x = mmToMeters(rawX);
  const y = mmToMeters(rawY);

  // Corner-based X and builder node Z shift into the centred parent frame.
  if (frameWidth > 0 && !isExplicitlyCentered && rawX >= 0 && x <= frameWidth) {
    x -= frameWidth / 2;
  }

  let z = 0;
  if (anchor) {
    z += mmToMeters(anchor.localPositionZ);
    if (frameDepth > 0 && isCornerAuthoredAnchorZ(anchor, frameDepth)) {
      z -= frameDepth / 2;
    }
  }
  if (node) {
    z += mmToMeters(node.positionZ);
    // A node riding on an anchor refines the anchor placement and is applied
    // as an offset in the anchor's frame; a node alone is a corner-authored
    // slot centre and shifts like one.
    if (
      !anchor &&
      frameDepth > 0 &&
      !isExplicitlyCentered &&
      node.positionZ >= 0 &&
      mmToMeters(node.positionZ) <= frameDepth
    ) {
      z -= frameDepth / 2;
    }
  }

  return { x, y, z };
}

/**
 * Shrinks an object uniformly so a mapped compartment can never render outside
 * the slot envelope it was authored into.
 *
 * The authored node scale is preserved as-is and the containment factor is
 * folded into the rendered dimensions, so:
 * - objects that already fit keep their exact model dimensions (the common
 *   case: drawers, bins, cabinets),
 * - objects larger than their slot (e.g. a full rack mapped into one bay) are
 *   scaled down uniformly — never up — to fit,
 * - payloads without an authored envelope keep their model dimensions.
 */
export function fitDimensionsToSlot(
  dimensions: Vector3D,
  scale: Vector3D,
  slotDimensionsMm?:
    | { widthMm: number; heightMm: number; depthMm: number }
    | null,
): Vector3D {
  if (!slotDimensionsMm) return dimensions;

  const slot = {
    x: mmToMeters(slotDimensionsMm.widthMm),
    y: mmToMeters(slotDimensionsMm.heightMm),
    z: mmToMeters(slotDimensionsMm.depthMm),
  };
  if (!(slot.x > 0 && slot.y > 0 && slot.z > 0)) return dimensions;

  const rendered = {
    x: dimensions.x * scale.x,
    y: dimensions.y * scale.y,
    z: dimensions.z * scale.z,
  };
  if (!(rendered.x > 0 && rendered.y > 0 && rendered.z > 0)) return dimensions;

  const factor = Math.min(
    1,
    slot.x / rendered.x,
    slot.y / rendered.y,
    slot.z / rendered.z,
  );
  if (!Number.isFinite(factor) || factor >= 1) return dimensions;

  return {
    x: dimensions.x * factor,
    y: dimensions.y * factor,
    z: dimensions.z * factor,
  };
}

/**
 * Resolves the authored slot envelope of a mapped child: the parent layout's
 * slot geometry when the API provides it, otherwise the anchor's bounding box
 * (the slot envelope authoring writes for anchor-mapped children).
 */
export function resolveChildSlotEnvelope(
  child: LocationOperationalViewChildDto,
): { widthMm: number; heightMm: number; depthMm: number } | null {
  if (
    child.slotDimensionsMm &&
    child.slotDimensionsMm.widthMm > 0 &&
    child.slotDimensionsMm.heightMm > 0 &&
    child.slotDimensionsMm.depthMm > 0
  ) {
    return child.slotDimensionsMm;
  }

  const anchor = child.anchor;
  if (
    anchor?.boundingWidthMm &&
    anchor?.boundingHeightMm &&
    anchor?.boundingDepthMm
  ) {
    return {
      widthMm: anchor.boundingWidthMm,
      heightMm: anchor.boundingHeightMm,
      depthMm: anchor.boundingDepthMm,
    };
  }

  return null;
}

/**
 * Resolves the local scale multiplier persisted on a spatial node. A missing,
 * non-finite, or non-positive scale is treated as 1 so a malformed row can
 * never collapse a compartment to nothing.
 */
export function resolveChildScale(
  node: SpatialNodeDto | null | undefined,
): Vector3D {
  const sanitize = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  };

  return {
    x: sanitize(node?.scaleX),
    y: sanitize(node?.scaleY),
    z: sanitize(node?.scaleZ),
  };
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
 * Horizontal gap kept between auto-arranged compartments (meters).
 */
export const AUTO_ARRANGE_GAP_METERS = 0.05;

/**
 * Fans out mapped children whose resolved transforms are identical in all three
 * axes — typically children mapped to a container without authored anchors or
 * node coordinates. Rendering them as-is stacks every sibling on the same point,
 * which reads as one broken model.
 *
 * The arrangement is deterministic (children are ordered by location code), keeps
 * the shared anchor point as the row centre and spaces the compartments by the
 * widest sibling. Children carrying distinct authored positions — including
 * siblings stacked vertically — are never moved.
 */
export function arrangeCollidingChildren(
  children: SceneChildLayout[],
  gapMeters: number = AUTO_ARRANGE_GAP_METERS,
): SceneChildLayout[] {
  const groups = new Map<string, SceneChildLayout[]>();
  for (const child of children) {
    const key = [
      child.position.x.toFixed(6),
      child.position.y.toFixed(6),
      child.position.z.toFixed(6),
    ].join("|");
    const list = groups.get(key);
    if (list) {
      list.push(child);
    } else {
      groups.set(key, [child]);
    }
  }

  const resolvedX = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) =>
      a.locationCode.localeCompare(b.locationCode),
    );
    const slotMeters =
      ordered.reduce((widest, child) => Math.max(widest, child.dimensions.x), 0) +
      gapMeters;
    const centreX = group[0]!.position.x;
    const startX = centreX - (slotMeters * (ordered.length - 1)) / 2;
    ordered.forEach((child, index) => {
      resolvedX.set(child.locationId, startX + slotMeters * index);
    });
  }

  if (resolvedX.size === 0) return children;

  return children.map((child) => {
    const x = resolvedX.get(child.locationId);
    if (x === undefined) return child;
    return {
      ...child,
      position: { ...child.position, x },
      isAutoArranged: true,
    };
  });
}

/**
 * Resolves the physical container frame that child node coordinates were
 * authored in, in meters.
 *
 * A published layout is the frame the builder wrote child coordinates in, so it
 * takes precedence over the container's own 3D model. Without a published
 * layout, the model's configured dimensions are the authored frame; without
 * either, coordinates cannot be re-centred and are used as-is.
 */
export function resolveAuthoredContainerDimensions(
  mapping:
    | {
        publishedLayout?: {
          containerDimensionsMm: {
            widthMm: number;
            heightMm: number;
            depthMm: number;
          } | null;
        } | null;
      }
    | null
    | undefined,
  model: SpatialModelDto | null | undefined,
): Vector3D | null {
  const layoutDimensions = mapping?.publishedLayout?.containerDimensionsMm;
  if (
    layoutDimensions &&
    layoutDimensions.widthMm > 0 &&
    layoutDimensions.heightMm > 0 &&
    layoutDimensions.depthMm > 0
  ) {
    return {
      x: mmToMeters(layoutDimensions.widthMm),
      y: mmToMeters(layoutDimensions.heightMm),
      z: mmToMeters(layoutDimensions.depthMm),
    };
  }

  if (model?.widthMm && model?.heightMm && model?.depthMm) {
    return {
      x: mmToMeters(model.widthMm),
      y: mmToMeters(model.heightMm),
      z: mmToMeters(model.depthMm),
    };
  }

  return null;
}

/**
 * Resolves the container frame to render the carcass at: the authored frame
 * when known, otherwise the model, otherwise the kind's fallback dimensions.
 */
export function resolveContainerFrameDimensions(
  mapping:
    | {
        publishedLayout?: {
          containerDimensionsMm: {
            widthMm: number;
            heightMm: number;
            depthMm: number;
          } | null;
        } | null;
      }
    | null
    | undefined,
  model: SpatialModelDto | null | undefined,
  kind?: string,
): Vector3D {
  return (
    resolveAuthoredContainerDimensions(mapping, model) ??
    resolveObjectDimensions(model, null, kind)
  );
}

/**
 * Categorizes and positions children of a parent location for 3D visualization.
 *
 * A child is mapped when it has a spatial node — the authoritative definition
 * shared with the API and the 2D views. A mapped child carries exact scene
 * transforms (anchor + node, or node coordinates alone for builder-published
 * mappings).
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
    const isMapped = child.node !== null;
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
      const scale = resolveChildScale(child.node);
      const dimensions = fitDimensionsToSlot(
        resolveObjectDimensions(
          child.model,
          child.anchor,
          child.location.kind,
        ),
        scale,
        resolveChildSlotEnvelope(child),
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
        scale,
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

  return { mapped: arrangeCollidingChildren(mapped), unmapped };
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
