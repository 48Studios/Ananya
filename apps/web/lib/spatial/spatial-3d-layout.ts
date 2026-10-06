import type {
  LocationOperationalViewChildDto,
  SpatialAnchorDto,
  SpatialModelDto,
  SpatialNodeDto,
} from "../api/spatial-api";
import {
  isSpatialSpaceKind,
  type ParametricStorageConfig,
} from "@ananya/inventory";
import type { CellStockSummary } from "./spatial-inventory-mapper";
import {
  resolveSpatialModel,
  resolveTemplateSpatialModel,
  resolveLocationModelInstance,
  type SpatialModelStructure,
} from "./spatial-model-library";

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

/**
 * Converts a parametric lower-left-back corner-frame point into the centered
 * local frame used by procedural model geometry.
 *
 * Parametric coordinates describe slot centers from the container corner:
 * [0, W] x [0, H] x [0, D]. Procedural model geometry is centered on its
 * local origin, so all three axes use the same conversion.
 */
export function cornerOriginToCenteredPosition(
  positionMm: { x: number; y: number; z: number },
  dimensionsMm: { widthMm: number; heightMm: number; depthMm: number },
): Vector3D {
  return {
    x: mmToMeters(positionMm.x - dimensionsMm.widthMm / 2),
    y: mmToMeters(positionMm.y - dimensionsMm.heightMm / 2),
    z: mmToMeters(positionMm.z - dimensionsMm.depthMm / 2),
  };
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
  if (model) {
    if (
      !model.widthMm ||
      !model.heightMm ||
      !model.depthMm ||
      ![model.widthMm, model.heightMm, model.depthMm].every(
        (dimension) => Number.isFinite(dimension) && dimension > 0,
      )
    ) {
      return { x: 0, y: 0, z: 0 };
    }
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

  const definition = resolveSpatialModel(kind);
  if (definition) {
    return {
      x: mmToMeters(definition.dimensionsMm.widthMm),
      y: mmToMeters(definition.dimensionsMm.heightMm),
      z: mmToMeters(definition.dimensionsMm.depthMm),
    };
  }
  return { x: mmToMeters(100), y: mmToMeters(100), z: mmToMeters(100) };
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
 * - Manual/anchor-authored Y coordinates remain grounded on the floor/bottom
 *   [0, height]. Builder-owned node coordinates use the parametric corner
 *   frame and are centered on Y with the same conversion as X/Z.
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
  const nodeMetadata =
    node?.metadata && typeof node.metadata === "object"
      ? (node.metadata as Record<string, unknown>)
      : null;
  const isBuilderOwnedNode = nodeMetadata?.source === "inventory_builder";

  let x = mmToMeters(rawX);
  const y = mmToMeters(rawY);
  const centeredY =
    isBuilderOwnedNode && !anchor && parentDimensions
      ? y - parentDimensions.y / 2
      : y;

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

  return { x, y: centeredY, z };
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
  slotDimensionsMm?: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  } | null,
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
      ordered.reduce(
        (widest, child) => Math.max(widest, child.dimensions.x),
        0,
      ) + gapMeters;
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
 * Where a viewed parent's physical body comes from, most authoritative first:
 * an explicit model, a published parametric layout, an explicit kind rule, or
 * nothing at all (the location is only a scene context for its children).
 */
export type ParentGeometrySource = "model" | "layout" | "kind" | "overview";

/**
 * Structure a parent body is drawn with; `none` means no parent mesh.
 *
 * `"drawer"` is a sliding body (walls plus a closed front face); `"tray"` is the
 * same shell with an open front, because a grid of compartments must stay
 * visible and clickable. `"warehouse"` is scene context rather than inventory
 * geometry: a cutaway shell (floor, back wall, partial side walls, pitched
 * roof) whose front stays fully open so the contents read as equipment standing
 * inside a space.
 */
export type ParentStructureShape = SpatialModelStructure;
export type { SpatialModelDefinition } from "./spatial-model-library";

/**
 * Kinds whose physical form is an explicit domain rule: they own a body even
 * without an authored model or layout.
 *
 * This mirrors the only two kind-level facts the domain states — the kinds the
 * spatial rules treat as compartment-level containers (`cabinet`, `drawer`,
 * `shelf`, `bin`, `tray`, …) and `INCOMPATIBLE_COMPARTMENT_KINDS`, the kinds
 * that are spaces rather than containers. Space kinds (warehouse, room,
 * building, facility, zone) are deliberately absent: they are scenes that
 * contain mapped children, not enclosures, unless a model or a published layout
 * gives them geometry.
 */
/**
 * Space kinds that own no carcass: they are scenes that contain storage
 * equipment. The viewer draws their cutaway shell instead of a compartment
 * body, so a warehouse never reads as a giant cabinet.
 */
export const WAREHOUSE_SHELL_KINDS: ReadonlySet<string> = new Set([
  "warehouse",
  "facility",
  "building",
]);

/** Kind tokens whose physical form is an open-top tray. */
const TRAY_SHAPED_TOKENS: ReadonlySet<string> = new Set([
  "bin",
  "tray",
  "slot",
  "tube",
  "compartment",
]);

/** Kind tokens whose physical form is a sliding drawer body. */
const DRAWER_SHAPED_TOKENS: ReadonlySet<string> = new Set(["drawer"]);

/** Kind tokens whose physical form is an open rack/shelf frame. */
const RACK_SHAPED_TOKENS: ReadonlySet<string> = new Set([
  "rack",
  "shelf",
  "tier",
  "crate",
]);

/**
 * Shape implied by a location kind alone (no authored model/layout).
 *
 * This is the *generated/parametric* tier of the representation priority: it
 * describes the physical form the domain states for a kind, and it is shared by
 * every renderer — a location rendered directly and the same location rendered
 * as a child of another scene resolve to the same shape.
 */
export function resolveKindStructureShape(kind?: string): ParentStructureShape {
  const normalized = (kind ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  // A warehouse is a space, so its procedural body is the cutaway shell rather
  // than a compartment carcass. An explicit model still wins (see
  // `resolveSpatialRepresentation`).
  if (WAREHOUSE_SHELL_KINDS.has(normalized)) return "warehouse";
  // The domain's own rule: these kinds are spaces, never compartment-level
  // containers, so they must not acquire a container-shaped body.
  if (!normalized || isSpatialSpaceKind(normalized)) {
    return "none";
  }
  // Canonical first: the model resolver owns kind normalization (including
  // separators such as "/"), so pass the raw value rather than this function's
  // local token form. Token heuristics below only apply to unknown kinds.
  const definition = resolveSpatialModel(kind);
  if (definition) return definition.structure;
  // Kinds are compound names (`dry_cabinet`, `reel_slot`, `open_bin_wall`), so
  // match whole tokens rather than substrings: "cabinet" must never match "bin".
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const hasToken = (set: ReadonlySet<string>): boolean =>
    tokens.some((token) => set.has(token));

  // Open-top containers read as trays; their lids are never implied.
  if (hasToken(TRAY_SHAPED_TOKENS)) return "tray";
  if (hasToken(DRAWER_SHAPED_TOKENS)) return "drawer";
  if (hasToken(RACK_SHAPED_TOKENS)) return "rack";
  if (tokens.includes("cabinet") || tokens.includes("cupboard")) {
    return "enclosure";
  }
  // An unrecognized kind is not evidence of a physical container: render the
  // location as the scene context for its children instead of inventing a body.
  return "none";
}

export interface ParentGeometryOwnership {
  source: ParentGeometrySource;
  /** Body shape to render; `none` means the parent must not become a mesh. */
  structure: ParentStructureShape;
  /** Authored structure parameters (mm) when a layout defines them. */
  wallThicknessMm: number | null;
  postWidthMm: number | null;
  beamHeightMm: number | null;
  shelfLevels: number | null;
  reelRows: number | null;
  reelSlotSpacingMm: number | null;
  gridRows: number | null;
  gridColumns: number | null;
  gridDividerThicknessMm: number | null;
}

/**
 * Where a location's visible representation comes from, most authoritative
 * first. Every renderer resolves through these tiers; screens must never invent
 * their own priority:
 *
 * 1. `model`    — an explicit 3D spatial model (imported asset or configured model)
 * 2. `layout`   — published Inventory Builder geometry
 * 3. `node`     — authored spatial node/anchor geometry (anchor envelope, node scale)
 * 4. `kind`     — generated/parametric shape implied by the location kind
 * 5. `fallback` — no authoritative geometry: the generic labelled compartment
 */
export type SpatialRepresentationSource =
  "model" | "layout" | "node" | "kind" | "fallback";

export interface SpatialRepresentation {
  locationId: string;
  source: SpatialRepresentationSource;
  /** Body shape the location is drawn with, in every scene. */
  structure: ParentStructureShape;
  /** Canonical dimensions in meters, from the same tier as `source`. */
  dimensions: Vector3D;
  /**
   * Canonical model reference, when the location owns an explicit model. The
   * asset (when present) must be instantiated wherever the location is drawn.
   */
  model: {
    code: string;
    format: string;
    assetUri: string | null;
  } | null;
  /** Location-scoped canonical model instance resolved from the persisted model row. */
  modelInstance?: ReturnType<typeof resolveLocationModelInstance>;
  /** Authored structure parameters (mm) when a layout defines them. */
  wallThicknessMm: number | null;
  postWidthMm: number | null;
  beamHeightMm: number | null;
  shelfLevels: number | null;
  reelRows: number | null;
  reelSlotSpacingMm: number | null;
  gridRows: number | null;
  gridColumns: number | null;
  gridDividerThicknessMm: number | null;
  /** Why this tier won — development/debug observability only. */
  reason: string;
}

export interface SpatialRepresentationInput {
  location?: { id?: string; code?: string; kind?: string } | null;
  model?: SpatialModelDto | null;
  anchor?: SpatialAnchorDto | null;
  node?: SpatialNodeDto | null;
  mapping?: {
    publishedLayout?: {
      templateType?: string | null;
      config?: ParametricStorageConfig | null;
      containerDimensionsMm?: {
        widthMm: number;
        heightMm: number;
        depthMm: number;
      } | null;
    } | null;
  } | null;
  /**
   * Authoring surfaces (the Inventory Builder preview) render the container the
   * authored layout describes, including for space kinds, because there the
   * layout itself is what is being edited.
   */
  authoredLayoutBody?: boolean;
}

function readModelAsset(model: SpatialModelDto | null | undefined): {
  code: string;
  format: string;
  assetUri: string | null;
} | null {
  if (!model) return null;
  const assetUri = model.assetUri || model.assetReference || null;
  const format = (model.format || "").toUpperCase();
  const isAsset = Boolean(assetUri) && (format === "GLB" || format === "GLTF");
  return {
    code: model.code,
    format: isAsset ? format : model.format || "PROCEDURAL",
    assetUri: isAsset ? assetUri : null,
  };
}

/**
 * Resolves the canonical visual representation of a location.
 *
 * The result depends only on the location's own authoritative data — never on
 * the scene it is being drawn into. A parent scene composes this representation
 * and applies its own world transform; it never reinterprets the geometry.
 */
export function resolveSpatialRepresentation(
  input: SpatialRepresentationInput,
): SpatialRepresentation {
  const kind = input.location?.kind;
  const kindShape = resolveKindStructureShape(kind);
  const locationId = input.location?.id ?? "";
  const published = input.mapping?.publishedLayout ?? null;
  const config = (published?.config ?? null) as Record<string, unknown> | null;
  const readMm = (key: string): number | null => {
    const value = config ? Number(config[key]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const authored = {
    wallThicknessMm: readMm("wallThicknessMm"),
    postWidthMm: readMm("uprightWidthMm") ?? readMm("uprightPostWidthMm"),
    beamHeightMm: readMm("crossbarHeightMm") ?? readMm("beamHeightMm"),
    shelfLevels: readMm("levels"),
    reelRows: readMm("rows"),
    reelSlotSpacingMm: readMm("slotSpacingMm"),
    gridRows: readMm("rows"),
    gridColumns: readMm("columns"),
    gridDividerThicknessMm: readMm("dividerThicknessMm"),
  };

  // 1. An explicit model is the location's own geometry everywhere. A warehouse
  // model is the warehouse's own body: the cutaway shell may not replace it.
  if (input.model) {
    const structure =
      kindShape === "none" || kindShape === "warehouse"
        ? "enclosure"
        : kindShape;
    return {
      locationId,
      source: "model",
      structure,
      dimensions: resolveObjectDimensions(input.model, input.anchor, kind),
      model: readModelAsset(input.model),
      modelInstance: resolveLocationModelInstance({
        locationId,
        kind: kind ?? "",
        model: input.model,
      }),
      wallThicknessMm: authored.wallThicknessMm,
      postWidthMm: authored.postWidthMm,
      beamHeightMm: authored.beamHeightMm,
      shelfLevels: authored.shelfLevels,
      reelRows: authored.reelRows,
      reelSlotSpacingMm: authored.reelSlotSpacingMm,
      gridRows: authored.gridRows,
      gridColumns: authored.gridColumns,
      gridDividerThicknessMm: authored.gridDividerThicknessMm,
      reason: `explicit model ${input.model.code}`,
    };
  }

  // 2. A warehouse is a space: its own body is the cutaway shell, and a
  // published layout for a space is a bay plan for its contents. An authoring
  // surface keeps the authored container body instead.
  if (kindShape === "warehouse" && !input.authoredLayoutBody) {
    return {
      locationId,
      source: "kind",
      structure: "warehouse",
      dimensions: resolveObjectDimensions(null, null, kind),
      model: null,
      wallThicknessMm: null,
      postWidthMm: null,
      beamHeightMm: null,
      shelfLevels: null,
      reelRows: null,
      reelSlotSpacingMm: null,
      gridRows: null,
      gridColumns: null,
      gridDividerThicknessMm: null,
      reason: "space kind: cutaway scene context",
    };
  }

  // 3. Published Inventory Builder geometry is the container's own body.
  if (published) {
    const template = (published.templateType ?? "").toUpperCase();
    const templateModel = resolveTemplateSpatialModel(template, kind);
    const layoutDimensions = published.containerDimensionsMm;
    const dimensions =
      layoutDimensions &&
      layoutDimensions.widthMm > 0 &&
      layoutDimensions.heightMm > 0 &&
      layoutDimensions.depthMm > 0
        ? {
            x: mmToMeters(layoutDimensions.widthMm),
            y: mmToMeters(layoutDimensions.heightMm),
            z: mmToMeters(layoutDimensions.depthMm),
          }
        : resolveObjectDimensions(null, input.anchor, kind);
    return {
      locationId,
      source: "layout",
      structure: templateModel?.structure ?? kindShape,
      dimensions,
      model: null,
      wallThicknessMm: authored.wallThicknessMm,
      postWidthMm: authored.postWidthMm,
      beamHeightMm: authored.beamHeightMm,
      shelfLevels: authored.shelfLevels,
      reelRows: authored.reelRows,
      reelSlotSpacingMm: authored.reelSlotSpacingMm,
      gridRows: authored.gridRows,
      gridColumns: authored.gridColumns,
      gridDividerThicknessMm: authored.gridDividerThicknessMm,
      reason: `published layout ${published.templateType ?? "unknown template"}`,
    };
  }

  // 4. Authored node/anchor geometry: the anchor's envelope is the object's
  // authored size even when no model or layout exists.
  if (
    input.anchor?.boundingWidthMm &&
    input.anchor?.boundingHeightMm &&
    input.anchor?.boundingDepthMm
  ) {
    return {
      locationId,
      source: "node",
      structure: kindShape,
      dimensions: resolveObjectDimensions(null, input.anchor, kind),
      model: null,
      wallThicknessMm: null,
      postWidthMm: null,
      beamHeightMm: null,
      shelfLevels: null,
      reelRows: null,
      reelSlotSpacingMm: null,
      gridRows: null,
      gridColumns: null,
      gridDividerThicknessMm: null,
      reason: `authored anchor envelope ${input.anchor.code}`,
    };
  }

  // 5. Generated/parametric geometry implied by the kind.
  if (kindShape !== "none") {
    return {
      locationId,
      source: "kind",
      structure: kindShape,
      dimensions: resolveObjectDimensions(null, null, kind),
      model: null,
      wallThicknessMm: null,
      postWidthMm: null,
      beamHeightMm: null,
      shelfLevels: null,
      reelRows: null,
      reelSlotSpacingMm: null,
      gridRows: null,
      gridColumns: null,
      gridDividerThicknessMm: null,
      reason: `generated ${kindShape} shape for kind ${kind ?? "unknown"}`,
    };
  }

  // 6. No authoritative representation: an explicit, observable fallback.
  return {
    locationId,
    source: "fallback",
    structure: "none",
    dimensions: resolveObjectDimensions(null, null, kind),
    model: null,
    wallThicknessMm: null,
    postWidthMm: null,
    beamHeightMm: null,
    shelfLevels: null,
    reelRows: null,
    reelSlotSpacingMm: null,
    gridRows: null,
    gridColumns: null,
    gridDividerThicknessMm: null,
    reason: `no model, layout, anchor or kind shape for kind ${kind ?? "unknown"}`,
  };
}

/**
 * Canonical representation of a viewed location (the parent of the current
 * scene): the same resolution a child instance uses, so a direct view and an
 * in-scene instance can never disagree.
 */
export function resolveParentSpatialRepresentation(parent: {
  location?: { id?: string; code?: string; kind?: string } | null;
  model?: SpatialModelDto | null;
  mapping?: {
    publishedLayout?: {
      templateType?: string | null;
      config?: ParametricStorageConfig | null;
      containerDimensionsMm?: {
        widthMm: number;
        heightMm: number;
        depthMm: number;
      } | null;
    } | null;
  } | null;
}): SpatialRepresentation {
  return resolveSpatialRepresentation({
    location: parent.location,
    model: parent.model,
    mapping: parent.mapping,
  });
}

/** Canonical representation of a location drawn as a child of another scene. */
export function resolveChildSpatialRepresentation(
  child: LocationOperationalViewChildDto,
): SpatialRepresentation {
  return resolveSpatialRepresentation({
    location: child.location,
    model: child.model,
    anchor: child.anchor,
    node: child.node,
    mapping: child.mapping,
  });
}

export interface ParentGeometryOwnership {
  source: ParentGeometrySource;
  /** Body shape to render; `none` means the parent must not become a mesh. */
  structure: ParentStructureShape;
  /** Authored structure parameters (mm) when a layout defines them. */
  wallThicknessMm: number | null;
  postWidthMm: number | null;
  beamHeightMm: number | null;
  shelfLevels: number | null;
}

/**
 * Decides whether (and how) a viewed parent owns visible physical geometry.
 *
 * A thin adapter over `resolveSpatialRepresentation` so the parent path and the
 * child path can never disagree: the parent camera, the scene bounds and the
 * body mesh all read the same resolved representation, and so does the same
 * location rendered inside another scene.
 *
 * `authoredLayoutBody` marks an authoring surface (the Inventory Builder
 * preview): there the authored layout *is* the container being edited, so its
 * structure and its authored elevations are rendered instead of the space
 * overview the operational viewer shows for the same location.
 */
export function resolveParentGeometryOwnership(
  parent: {
    location?: { id?: string; code?: string; kind?: string } | null;
    model?: SpatialModelDto | null;
    mapping?: {
      publishedLayout?: {
        templateType?: string | null;
        config?: ParametricStorageConfig | null;
        containerDimensionsMm?: {
          widthMm: number;
          heightMm: number;
          depthMm: number;
        } | null;
      } | null;
    } | null;
  },
  options: { authoredLayoutBody?: boolean } = {},
): ParentGeometryOwnership {
  const representation = resolveSpatialRepresentation({
    location: parent.location,
    model: parent.model,
    mapping: parent.mapping,
    authoredLayoutBody: options.authoredLayoutBody,
  });

  const source: ParentGeometrySource =
    representation.source === "model"
      ? "model"
      : representation.source === "layout"
        ? "layout"
        : representation.source === "kind" &&
            representation.structure !== "warehouse"
          ? "kind"
          : "overview";

  return {
    source,
    structure: representation.structure,
    wallThicknessMm: representation.wallThicknessMm,
    postWidthMm: representation.postWidthMm,
    beamHeightMm: representation.beamHeightMm,
    shelfLevels: representation.shelfLevels,
    reelRows: representation.reelRows,
    reelSlotSpacingMm: representation.reelSlotSpacingMm,
    gridRows: representation.gridRows,
    gridColumns: representation.gridColumns,
    gridDividerThicknessMm: representation.gridDividerThicknessMm,
  };
}

/** Minimum cutaway shell footprint, so a lone warehouse still reads as a space. */
export const WAREHOUSE_SHELL_MIN_DIMENSIONS: Vector3D = {
  x: 1.2,
  y: 1,
  z: 0.6,
};

/**
 * Elevation of the warehouse floor plane in the scene frame, in meters.
 *
 * Vertical axis: +Y (Three.js Y-up, the same axis the persisted spatial node
 * positions and the container frames use). The warehouse scene owns this
 * reference — it is deliberately not derived from any child, camera or
 * bounding-box centre — and it is a rendering concern: a warehouse whose own
 * model or published geometry states a floor elevation keeps that instead
 * (this constant only drives the fallback cutaway shell).
 */
/** The canonical Three.js/world ground plane for standalone spatial scenes. */
export const SPATIAL_GROUND_PLANE_Y_METERS = 0;

export const WAREHOUSE_FLOOR_ELEVATION_METERS = SPATIAL_GROUND_PLANE_Y_METERS;

/**
 * Vertical clearance kept between a grounded object and the floor, so the
 * shared floor plane never z-fights with the object's bottom face.
 */
export const WAREHOUSE_GROUNDING_CLEARANCE_METERS = 0.001;

/**
 * Operational child anchors use a floor-origin Y frame, while procedural
 * parent bodies are authored around their centred model origin. Move only the
 * procedural parent body into that child frame; child placement and persisted
 * coordinates remain untouched. Builder previews deliberately keep their
 * existing assembly frame.
 */
export function resolveOperationalParentBodyOffset(
  parentDimensions: Vector3D,
  options: {
    isAuthoringLayout: boolean;
    rendersWarehouseShell: boolean;
  },
): Vector3D {
  if (options.isAuthoringLayout || options.rendersWarehouseShell) {
    return { x: 0, y: 0, z: 0 };
  }

  return { x: 0, y: parentDimensions.y / 2, z: 0 };
}

/**
 * Builder roots are generated from a corner-origin parametric layout and need
 * one render-time lift so their centered physical model rests on world ground.
 * Persisted Location Details nodes already carry authoritative placement and
 * must never be normalized by this policy.
 */
export function shouldGroundRootAssembly(
  isBuilderRoot: boolean,
  rendersWarehouseShell: boolean,
): boolean {
  return isBuilderRoot && !rendersWarehouseShell;
}

/**
 * Rise of the shell's pitched roof for a shell of the given width, in meters.
 * Shared by the shell geometry and the scene bounds so the roof is always
 * framed by the camera fit.
 */
export function resolveWarehouseRoofRise(widthMeters: number): number {
  return Math.max(0.18, Math.min(0.7, widthMeters * 0.12));
}

/**
 * Upper bound of a box's axis-aligned footprint once rotated, so the shell that
 * wraps it can never clip a rotated object. Exact for the axis-aligned case and
 * a conservative bound otherwise.
 */
function resolveRotatedExtents(child: SceneChildLayout): Vector3D {
  const { x: w, y: h, z: d } = child.dimensions;
  const rx = Math.abs(Math.cos(child.rotation.x));
  const rxs = Math.abs(Math.sin(child.rotation.x));
  const ry = Math.abs(Math.cos(child.rotation.y));
  const rys = Math.abs(Math.sin(child.rotation.y));
  const rz = Math.abs(Math.cos(child.rotation.z));
  const rzs = Math.abs(Math.sin(child.rotation.z));

  return {
    x: w * ry * rz + d * rys * rz + h * rxs,
    y: h * rx * rz + d * rxs + w * rzs,
    z: d * ry * rx + w * rys * rx + h * rxs,
  };
}

/** Minimum horizontal clearance kept between neighbours in a grid row (m). */
export const WAREHOUSE_GRID_GAP_METERS = 0.45;

/** Aisle left between floor grid rows (m). Purely visual, not a vehicle clearance. */
export const WAREHOUSE_AISLE_GAP_METERS = 0.9;

/** Floor margin kept between the grid and the shell walls (m). */
export const WAREHOUSE_GRID_MARGIN_METERS = 0.6;

/** Headroom kept above the tallest floor-standing object, as a ratio. */
export const WAREHOUSE_EAVES_HEADROOM_RATIO = 1.25;

/** Lowest eaves height, so a small warehouse still reads as a building (m). */
export const WAREHOUSE_MIN_EAVES_METERS = 2.2;

/**
 * Placement of a warehouse's floor-standing contents, in the scene frame.
 *
 * `generated` is false when the authored node coordinates already form a valid
 * floor arrangement (every object standing on the warehouse floor with no
 * horizontal overlap): that is an intentional arrangement and it is preserved
 * verbatim. Otherwise the contents are arranged on a deterministic floor grid.
 */
export interface WarehouseFloorPlan {
  children: SceneChildLayout[];
  /** Horizontal extents of the placement, centred on the scene origin (m). */
  width: number;
  depth: number;
  columns: number;
  rows: number;
  generated: boolean;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Rounded to sub-millimetre precision so ordering and spacing stay stable. */
function footprintOf(child: SceneChildLayout): {
  widthMeters: number;
  depthMeters: number;
  heightMeters: number;
} {
  const extents = resolveRotatedExtents(child);
  return {
    widthMeters: round(extents.x, 6),
    depthMeters: round(extents.z, 6),
    heightMeters: round(extents.y, 6),
  };
}

/**
 * Whether the child's coordinates were written by a parent layout plan rather
 * than placed by hand: either the child carries an authored slot envelope, or
 * its spatial node was written by the Inventory Builder (`source` metadata).
 * Plan-written placements are bay plans, not a deliberate warehouse floor
 * arrangement, so they are arranged rather than preserved verbatim.
 */
function hasPlanGeneratedPlacement(child: SceneChildLayout): boolean {
  if (child.rawChild?.slotDimensionsMm) return true;
  const metadata = child.rawChild?.node?.metadata as
    { source?: unknown } | null | undefined;
  return metadata?.source === "inventory_builder";
}

/**
 * Horizontal positions already represent a deliberate floor arrangement: they
 * were authored rather than generated by a plan, every object already stands on
 * the warehouse floor, and nothing overlaps.
 */
function isAuthoredFloorArrangement(children: SceneChildLayout[]): boolean {
  if (children.length < 2) return true;
  if (children.some(hasPlanGeneratedPlacement)) return false;
  for (const child of children) {
    const bottom = child.position.y - child.dimensions.y / 2;
    if (bottom > WAREHOUSE_FLOOR_ELEVATION_METERS + 0.02) return false;
  }
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      const a = children[i]!;
      const b = children[j]!;
      const aExtents = footprintOf(a);
      const bExtents = footprintOf(b);
      const overlapsX =
        Math.abs(a.position.x - b.position.x) <
        (aExtents.widthMeters + bExtents.widthMeters) / 2;
      const overlapsZ =
        Math.abs(a.position.z - b.position.z) <
        (aExtents.depthMeters + bExtents.depthMeters) / 2;
      if (overlapsX && overlapsZ) return false;
    }
  }
  return true;
}

/** Deterministic placement order: location code, then location id. */
function warehousePlacementOrder(
  children: SceneChildLayout[],
): SceneChildLayout[] {
  return [...children].sort(
    (a, b) =>
      a.locationCode.localeCompare(b.locationCode) ||
      a.locationId.localeCompare(b.locationId),
  );
}

/**
 * Composes the floor-standing children of a warehouse overview.
 *
 * Nothing is contained by a warehouse floor, so slot containment does not apply:
 * each object renders at its canonical representation dimensions (its model,
 * layout or authored envelope), exactly as it does when viewed directly. A
 * contained parent (cabinet, rack, tray) keeps its authored slot containment —
 * that is a placement policy of the container, not a change of representation.
 */
export function resolveFloorStandingChildren(
  children: SceneChildLayout[],
): SceneChildLayout[] {
  return children.map((child) => {
    const canonical = resolveChildSpatialRepresentation(
      child.rawChild,
    ).dimensions;
    if (canonical.x <= 0 || canonical.y <= 0 || canonical.z <= 0) return child;
    const unchanged =
      canonical.x === child.dimensions.x &&
      canonical.y === child.dimensions.y &&
      canonical.z === child.dimensions.z;
    if (unchanged) return child;
    return { ...child, dimensions: { ...canonical } };
  });
}

/**
 * Adaptive column count: a roughly square grid, never fewer than three columns
 * while there is something to fill them, so a growing warehouse reads as rows
 * and aisles instead of one long line or one tall column.
 */
function resolveColumnCount(count: number): number {
  if (count <= 1) return count;
  return Math.min(count, Math.max(3, Math.ceil(Math.sqrt(count))));
}

/**
 * Arranges warehouse contents into a floor grid of rows and aisles.
 *
 * Cell sizes come from each object's own rotated footprint (dimensions after
 * scale and rotation) plus `WAREHOUSE_GRID_GAP_METERS`, and rows are separated
 * by `WAREHOUSE_AISLE_GAP_METERS`. The column count adapts to the number of
 * contents (and therefore to their widths), so the floor grows as rows and
 * aisles instead of a single line. Only horizontal scene placement changes: the
 * authored elevation is kept (the renderer grounds every object on the floor),
 * and rotation, scale, dimensions and the persisted records are untouched.
 */
export function arrangeWarehouseFloorGrid(
  children: SceneChildLayout[],
): WarehouseFloorPlan {
  if (children.length === 0) {
    return {
      children,
      width: 0,
      depth: 0,
      columns: 0,
      rows: 0,
      generated: false,
    };
  }

  const ordered = warehousePlacementOrder(children).map((child) => {
    const footprint = footprintOf(child);
    return { child, ...footprint };
  });

  const layoutFor = (
    columns: number,
  ): {
    positions: Map<string, Vector3D>;
    width: number;
    depth: number;
    rows: number;
  } => {
    const rows: Array<{
      depth: number;
      width: number;
      entries: Array<{ child: SceneChildLayout; widthMeters: number }>;
    }> = [];
    for (let start = 0; start < ordered.length; start += columns) {
      const row = ordered.slice(start, start + columns);
      rows.push({
        depth: row.reduce(
          (deepest, entry) => Math.max(deepest, entry.depthMeters),
          0,
        ),
        width:
          row.reduce((sum, entry) => sum + entry.widthMeters, 0) +
          WAREHOUSE_GRID_GAP_METERS * (row.length - 1),
        entries: row,
      });
    }

    const width = rows.reduce((widest, row) => Math.max(widest, row.width), 0);
    const depth =
      rows.reduce((total, row) => total + row.depth, 0) +
      WAREHOUSE_AISLE_GAP_METERS * Math.max(0, rows.length - 1);

    // Rows run left to right across the floor and the whole grid is centred, so
    // the aisles read as deliberate lanes between the storage runs.
    const positions = new Map<string, Vector3D>();
    let cursorZ = -depth / 2;
    for (const row of rows) {
      let cursorX = -row.width / 2;
      for (const entry of row.entries) {
        positions.set(entry.child.locationId, {
          x: round(cursorX + entry.widthMeters / 2, 6),
          y: entry.child.position.y,
          z: round(cursorZ + row.depth / 2, 6),
        });
        cursorX += entry.widthMeters + WAREHOUSE_GRID_GAP_METERS;
      }
      cursorZ += row.depth + WAREHOUSE_AISLE_GAP_METERS;
    }

    return { positions, width, depth, rows: rows.length };
  };

  const columns = resolveColumnCount(ordered.length);
  const chosen = layoutFor(columns);

  const placed = children.map((child) => {
    const position = chosen.positions.get(child.locationId);
    if (!position) return child;
    return {
      ...child,
      position: { ...child.position, x: position.x, z: position.z },
    };
  });

  return {
    children: placed,
    width: chosen.width,
    depth: chosen.depth,
    columns,
    rows: chosen.rows,
    generated: true,
  };
}

/**
 * Resolves the floor placement of a warehouse's contents: the authored
 * arrangement when it already describes floor-standing equipment placed by
 * hand, otherwise a deterministic generated floor grid. Render-time only —
 * nothing is persisted.
 */
export function resolveWarehouseFloorPlan(
  children: SceneChildLayout[],
): WarehouseFloorPlan {
  if (children.length === 0) {
    return {
      children,
      width: 0,
      depth: 0,
      columns: 0,
      rows: 0,
      generated: false,
    };
  }

  if (isAuthoredFloorArrangement(children)) {
    const extents = measureFloorExtents(children);
    return {
      children,
      width: extents.width,
      depth: extents.depth,
      columns: children.length,
      rows: 1,
      generated: false,
    };
  }

  return arrangeWarehouseFloorGrid(children);
}

/** Horizontal extents of a set of children, in meters. */
function measureFloorExtents(children: SceneChildLayout[]): {
  width: number;
  depth: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const child of children) {
    const extents = footprintOf(child);
    minX = Math.min(minX, child.position.x - extents.widthMeters / 2);
    maxX = Math.max(maxX, child.position.x + extents.widthMeters / 2);
    minZ = Math.min(minZ, child.position.z - extents.depthMeters / 2);
    maxZ = Math.max(maxZ, child.position.z + extents.depthMeters / 2);
  }
  return {
    width: Number.isFinite(minX) ? maxX - minX : 0,
    depth: Number.isFinite(minZ) ? maxZ - minZ : 0,
  };
}

/**
 * Resolves the cutaway shell that visualizes a warehouse/root location.
 *
 * The returned box is the shell's outer envelope (width, total height including
 * the pitched roof, depth). It is derived from the floor placement — the
 * required grid width and depth, the aisle space already inside it, and the
 * floor margins — so the warehouse grows with its contents and stays
 * rectangular instead of becoming a single long line or an extremely tall box.
 * It is scene context: callers size the shell, never the persisted child
 * coordinates.
 *
 * The eaves keep headroom above the tallest object standing on the floor, and
 * the authored frame's height stays a floor on that headroom. Contents are
 * measured by their own rotated extents, because every floor-standing object
 * rests on the shell floor: the authored elevation of a child never raises the
 * roof.
 */
export function resolveWarehouseShellDimensions(
  frame: Vector3D | null | undefined,
  plan: WarehouseFloorPlan,
): Vector3D {
  const tallestContent = plan.children.reduce(
    (tallest, child) => Math.max(tallest, footprintOf(child).heightMeters),
    0,
  );

  const width = Math.max(
    plan.width + 2 * WAREHOUSE_GRID_MARGIN_METERS,
    WAREHOUSE_SHELL_MIN_DIMENSIONS.x,
  );
  const depth = Math.max(
    plan.depth + 2 * WAREHOUSE_GRID_MARGIN_METERS,
    WAREHOUSE_SHELL_MIN_DIMENSIONS.z,
  );
  const eaves = Math.max(
    frame?.y ?? 0,
    tallestContent * WAREHOUSE_EAVES_HEADROOM_RATIO,
    WAREHOUSE_MIN_EAVES_METERS,
    WAREHOUSE_SHELL_MIN_DIMENSIONS.y,
  );

  return { x: width, y: eaves + resolveWarehouseRoofRise(width), z: depth };
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
      const modelDimensions = resolveObjectDimensions(
        child.model,
        child.anchor,
        child.location.kind,
      );
      // Configured model dimensions are authoritative. A slot that is too small
      // is an invalid layout to surface through validation, not permission for
      // a renderer to shrink a location's canonical model.
      const dimensions = child.model
        ? modelDimensions
        : fitDimensionsToSlot(
            modelDimensions,
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
 * Calculates the mathematical bounding box used for camera fitting, centering,
 * zoom and grid sizing.
 *
 * This box is a scene concern, never geometry: passing `null` for the parent
 * frame means the inspected location owns no physical enclosure (a warehouse
 * overview), so the bounds are the union of the visible children instead of an
 * invented container. Callers must never turn the result into a mesh — the
 * parent body is decided by `resolveParentGeometryOwnership`.
 */
export function computeSceneBoundingBox(
  parentDimensions: Vector3D | null | undefined,
  children: SceneChildLayout[],
): BoundingBox3D {
  const hasParentFrame = Boolean(
    parentDimensions &&
    parentDimensions.x > 0 &&
    parentDimensions.y > 0 &&
    parentDimensions.z > 0,
  );

  let minX = hasParentFrame
    ? -parentDimensions!.x / 2
    : Number.POSITIVE_INFINITY;
  let maxX = hasParentFrame
    ? parentDimensions!.x / 2
    : Number.NEGATIVE_INFINITY;
  let minY = hasParentFrame ? 0 : Number.POSITIVE_INFINITY;
  let maxY = hasParentFrame ? parentDimensions!.y : Number.NEGATIVE_INFINITY;
  let minZ = hasParentFrame
    ? -parentDimensions!.z / 2
    : Number.POSITIVE_INFINITY;
  let maxZ = hasParentFrame
    ? parentDimensions!.z / 2
    : Number.NEGATIVE_INFINITY;

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

  // A scene with neither a parent frame nor a placed child still needs a
  // finite stage so camera fitting can never receive NaN/Infinity.
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = -0.5;
    maxX = 0.5;
  }
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    minZ = -0.5;
    maxZ = 0.5;
  }
  if (!Number.isFinite(minY)) {
    minY = 0;
  }
  if (!Number.isFinite(maxY) || maxY <= minY) {
    maxY = minY + 1;
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
