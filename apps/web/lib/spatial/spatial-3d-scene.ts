import * as THREE from "three";
import {
  mmToMeters,
  metersToMm,
  degToRad,
  isCornerAuthoredAnchorZ,
  resolveChildSpatialRepresentation,
  resolveKindStructureShape,
  resolveWarehouseRoofRise,
  type SpatialRepresentationSource,
  WAREHOUSE_FLOOR_ELEVATION_METERS,
  WAREHOUSE_GROUNDING_CLEARANCE_METERS,
  type ParentStructureShape,
  type SceneChildLayout,
  type SemanticVisualState,
  type Vector3D,
} from "./spatial-3d-layout";
import type { LocationOperationalViewDto } from "../api/spatial-api";
import { computeOpenTrayGeometry } from "./drawer-opening";
import type { DraftAnchor } from "./spatial-anchor-authoring";

export type LocationOperationalViewParent =
  LocationOperationalViewDto["parent"];

export interface MeshUserData {
  locationId: string;
  locationCode: string;
  locationName: string;
  kind: string;
  hasStock: boolean;
  isMapped: boolean;
  isParent?: boolean;
  /**
   * Representation tier this instance was composed from — development/debug
   * observability, so an unexpected downgrade to `fallback` is visible instead
   * of silent.
   */
  representationSource?: SpatialRepresentationSource;
  /** Why that tier won (debug only). */
  representationReason?: string;
}

/**
 * Color palette conforming to DESIGN.md
 * - Primary accent: Dodger Blue (#1E90FF)
 * - Locate target: Emerald (#10B981)
 * - Occupied stock: Sky (#0284C7)
 * - Empty / Translucent: Slate (#94A3B8)
 * - Carcass / Frame: Slate (#334155 / #475569)
 * - Ground Grid: Muted Border (#E2E8F0 / #334155)
 */
export const SPATIAL_3D_PALETTE = {
  selected: {
    base: "#1E90FF",
    emissive: "#1E90FF",
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.1,
  },
  locateTarget: {
    base: "#10B981",
    emissive: "#10B981",
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.1,
  },
  hasStock: {
    base: "#0284C7",
    emissive: "#0369A1",
    emissiveIntensity: 0.08,
    roughness: 0.45,
    metalness: 0.05,
  },
  stockDirect: {
    base: "#0284C7",
    emissive: "#0369A1",
    emissiveIntensity: 0.1,
    roughness: 0.45,
    metalness: 0.05,
  },
  stockDescendant: {
    base: "#8B5CF6",
    emissive: "#7C3AED",
    emissiveIntensity: 0.12,
    roughness: 0.45,
    metalness: 0.05,
  },
  stockMixed: {
    base: "#4F46E5",
    emissive: "#4338CA",
    emissiveIntensity: 0.15,
    roughness: 0.45,
    metalness: 0.05,
  },
  occupancyLow: {
    base: "#059669",
    emissive: "#047857",
    emissiveIntensity: 0.08,
    roughness: 0.45,
    metalness: 0.05,
  },
  occupancyModerate: {
    base: "#D97706",
    emissive: "#B45309",
    emissiveIntensity: 0.1,
    roughness: 0.45,
    metalness: 0.05,
  },
  occupancyHigh: {
    base: "#EA580C",
    emissive: "#C2410C",
    emissiveIntensity: 0.12,
    roughness: 0.45,
    metalness: 0.05,
  },
  occupancyOver: {
    base: "#E11D48",
    emissive: "#BE123C",
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.05,
  },
  occupancyUnspecified: {
    base: "#0D9488",
    emissive: "#0F766E",
    emissiveIntensity: 0.1,
    roughness: 0.45,
    metalness: 0.05,
  },
  emptyMapped: {
    base: "#CBD5E1",
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: 0.6,
    metalness: 0.0,
    opacity: 0.82,
    transparent: true,
  },
  unmapped: {
    base: "#F59E0B",
    emissive: "#D97706",
    emissiveIntensity: 0.2,
    roughness: 0.5,
    metalness: 0.0,
  },
  disabled: {
    base: "#64748B",
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: 0.8,
    metalness: 0.0,
  },
  carcass: {
    base: "#334155",
    roughness: 0.5,
    metalness: 0.2,
  },
  carcassInterior: {
    base: "#1E293B",
    roughness: 0.7,
    metalness: 0.1,
  },
  handle: {
    base: "#0F172A",
    roughness: 0.2,
    metalness: 0.8,
  },
  edgeLines: "#1E293B",
  selectedEdgeLines: "#0284C7",
  targetEdgeLines: "#059669",
  /** Container emphasis while the parent-first assignment is still pending. */
  attentionEdgeLines: "#F59E0B",
};

/**
 * Creates dynamic text canvas textures for compartment front plates (codes like "A01", "DRAWER-02").
 * Supports rendering secondary badge text directly on the compartment for accessibility, plus a
 * transient text-based "OPEN" indicator so the extended state never relies on color alone.
 */
export function createCompartmentLabelTexture(
  code: string,
  state: SemanticVisualState,
  badgeText?: string | null,
  isOpen?: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    // Background fill & accents conforming to state
    let bgColor = "#1E293B";
    let textColor = "#F8FAFC";
    let accentBarColor = "#64748B";

    if (state === "selected") {
      bgColor = "#1E90FF";
      textColor = "#FFFFFF";
      accentBarColor = "#FFFFFF";
    } else if (state === "locate-target") {
      bgColor = "#10B981";
      textColor = "#FFFFFF";
      accentBarColor = "#FFFFFF";
    } else if (state === "has-stock" || state === "stock-direct") {
      bgColor = "#0369A1";
      textColor = "#F0F9FF";
      accentBarColor = "#38BDF8";
    } else if (state === "stock-descendant") {
      bgColor = "#6D28D9";
      textColor = "#F5F3FF";
      accentBarColor = "#C4B5FD";
    } else if (state === "stock-mixed") {
      bgColor = "#4338CA";
      textColor = "#EEF2FF";
      accentBarColor = "#A5B4FC";
    } else if (state === "occupancy-low") {
      bgColor = "#047857";
      textColor = "#ECFDF5";
      accentBarColor = "#34D399";
    } else if (state === "occupancy-moderate") {
      bgColor = "#B45309";
      textColor = "#FFFBEB";
      accentBarColor = "#FBBF24";
    } else if (state === "occupancy-high") {
      bgColor = "#C2410C";
      textColor = "#FFF7ED";
      accentBarColor = "#FB923C";
    } else if (state === "occupancy-over") {
      bgColor = "#BE123C";
      textColor = "#FFF1F2";
      accentBarColor = "#FDA4AF";
    } else if (state === "occupancy-unspecified") {
      bgColor = "#0F766E";
      textColor = "#F0FDFA";
      accentBarColor = "#2DD4BF";
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Left accent pill
    ctx.fillStyle = accentBarColor;
    ctx.fillRect(0, 0, 10, canvas.height);

    // Border line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // Transient open-drawer indicator, drawn as text so the state is legible
    // without relying on color alone. Content below shifts down to make room.
    const yShift = isOpen ? 14 : 0;
    if (isOpen) {
      ctx.fillStyle = textColor;
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OPEN", canvas.width / 2 + 5, 14);
      ctx.strokeStyle = accentBarColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 28, 26);
      ctx.lineTo(canvas.width / 2 + 38, 26);
      ctx.stroke();
    }

    if (badgeText) {
      // Primary compartment code (top/middle)
      ctx.fillStyle = textColor;
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(code, canvas.width / 2 + 5, 46 + yShift);

      // Bottom accessible badge pill
      ctx.font = "bold 16px sans-serif";
      const textMetrics = ctx.measureText(badgeText);
      const pillW = Math.min(canvas.width - 32, textMetrics.width + 18);
      const pillH = 26;
      const pillX = canvas.width / 2 + 5 - pillW / 2;
      const pillY = 82 + yShift;

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      ctx.fill();

      ctx.strokeStyle = accentBarColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(badgeText, canvas.width / 2 + 5, pillY + pillH / 2 + 1);
    } else {
      // Standard centered code
      ctx.fillStyle = textColor;
      ctx.font = "bold 44px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(code, canvas.width / 2 + 5, canvas.height / 2 + yShift);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Creates material matching the semantic visual state.
 */
export function createSemanticMaterial(
  state: SemanticVisualState,
  texture?: THREE.Texture | null,
): THREE.MeshStandardMaterial {
  let config: {
    base: string;
    emissive?: string;
    emissiveIntensity?: number;
    roughness: number;
    metalness: number;
    opacity?: number;
    transparent?: boolean;
  };

  switch (state) {
    case "selected":
      config = SPATIAL_3D_PALETTE.selected;
      break;
    case "locate-target":
      config = SPATIAL_3D_PALETTE.locateTarget;
      break;
    case "has-stock":
      config = SPATIAL_3D_PALETTE.hasStock;
      break;
    case "stock-direct":
      config = SPATIAL_3D_PALETTE.stockDirect;
      break;
    case "stock-descendant":
      config = SPATIAL_3D_PALETTE.stockDescendant;
      break;
    case "stock-mixed":
      config = SPATIAL_3D_PALETTE.stockMixed;
      break;
    case "occupancy-low":
      config = SPATIAL_3D_PALETTE.occupancyLow;
      break;
    case "occupancy-moderate":
      config = SPATIAL_3D_PALETTE.occupancyModerate;
      break;
    case "occupancy-high":
      config = SPATIAL_3D_PALETTE.occupancyHigh;
      break;
    case "occupancy-over":
      config = SPATIAL_3D_PALETTE.occupancyOver;
      break;
    case "occupancy-unspecified":
      config = SPATIAL_3D_PALETTE.occupancyUnspecified;
      break;
    case "occupancy-empty":
    case "empty-mapped":
      config = SPATIAL_3D_PALETTE.emptyMapped;
      break;
    case "unmapped":
      config = SPATIAL_3D_PALETTE.unmapped;
      break;
    case "disabled":
      config = SPATIAL_3D_PALETTE.disabled;
      break;
    default:
      config = SPATIAL_3D_PALETTE.emptyMapped;
  }

  const hasOpacity = "opacity" in config;
  const opacityVal = hasOpacity ? (config as { opacity: number }).opacity : 1.0;

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.base),
    emissive: new THREE.Color(config.emissive || "#000000"),
    emissiveIntensity: config.emissiveIntensity || 0,
    roughness: config.roughness,
    metalness: config.metalness,
    transparent: Boolean("transparent" in config && config.transparent),
    opacity: opacityVal,
    map: texture || null,
  });
}

/**
 * Options shared by compartment mesh factories.
 */
export interface CompartmentMeshOptions {
  /**
   * Builds a hollow, open-top tray body in place of the closed slab body so the
   * compartment can slide out and reveal an interior. Off by default so static
   * viewers keep their existing compact geometry.
   */
  openable?: boolean;
  /** Renders the transient text "OPEN" indicator on the front plate label. */
  isOpen?: boolean;
}

/**
 * Builds the hollow open-top tray body used by openable compartments.
 * Keeps the outer envelope of the closed body it replaces so compartment
 * dimensions, rail alignment, and front-plate placement are preserved.
 */
function createOpenTrayBody(
  dim: Vector3D,
  state: SemanticVisualState,
  faceThickness: number,
  userData: MeshUserData,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "compartment-tray-body";

  const tray = computeOpenTrayGeometry(dim, faceThickness);
  const mat = createSemanticMaterial(state);

  for (const part of tray.parts) {
    const geo = new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = part.name;
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.userData = userData;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * Procedural Drawer Mesh:
 * A front face plate with alphanumeric label & pull handle, and a sliding body tray.
 * When `openable` is set the tray body is hollow and open at the top so opening the
 * drawer reveals a real interior without inventing stored contents.
 */
export function createDrawerMesh(
  dim: Vector3D,
  userData: MeshUserData,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const { openable = false, isOpen = false } = options;
  const group = new THREE.Group();
  group.name = `drawer-${userData.locationCode}`;

  const faceThickness = Math.min(0.015, dim.z * 0.1);
  const bodyDepth = Math.max(0.02, dim.z - faceThickness);

  // Front face plate
  const faceGeo = new THREE.BoxGeometry(
    dim.x * 0.96,
    dim.y * 0.94,
    faceThickness,
  );
  const labelTexture = createCompartmentLabelTexture(
    userData.locationCode,
    state,
    badgeText,
    isOpen,
  );
  const faceMat = createSemanticMaterial(state, labelTexture);
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  // Position front face at front edge of bounding box (+z)
  faceMesh.position.set(0, 0, dim.z / 2 - faceThickness / 2);
  faceMesh.userData = userData;
  faceMesh.castShadow = true;
  faceMesh.receiveShadow = true;
  group.add(faceMesh);

  // Handle pull
  const handleWidth = Math.min(0.08, dim.x * 0.4);
  const handleHeight = Math.min(0.012, dim.y * 0.18);
  const handleDepth = 0.01;
  const handleGeo = new THREE.BoxGeometry(
    handleWidth,
    handleHeight,
    handleDepth,
  );
  const handleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SPATIAL_3D_PALETTE.handle.base),
    roughness: SPATIAL_3D_PALETTE.handle.roughness,
    metalness: SPATIAL_3D_PALETTE.handle.metalness,
  });
  const handleMesh = new THREE.Mesh(handleGeo, handleMat);
  handleMesh.position.set(0, 0, dim.z / 2 - handleDepth / 2);
  handleMesh.userData = userData;
  group.add(handleMesh);

  // Body (sliding tray behind face)
  if (openable) {
    group.add(createOpenTrayBody(dim, state, faceThickness, userData));
  } else {
    const bodyGeo = new THREE.BoxGeometry(
      dim.x * 0.92,
      dim.y * 0.88,
      bodyDepth,
    );
    const bodyMat = createSemanticMaterial(state);
    bodyMat.opacity = Math.min(bodyMat.opacity, 0.7);
    bodyMat.transparent = true;
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0, -faceThickness / 2);
    bodyMesh.userData = userData;
    group.add(bodyMesh);
  }

  // Edge outline for crisp appearance
  const edges = new THREE.EdgesGeometry(faceGeo);
  const edgeColor =
    state === "selected"
      ? SPATIAL_3D_PALETTE.selectedEdgeLines
      : state === "locate-target"
        ? SPATIAL_3D_PALETTE.targetEdgeLines
        : SPATIAL_3D_PALETTE.edgeLines;
  const lineMat = new THREE.LineBasicMaterial({
    color: edgeColor,
    linewidth: 1,
  });
  const edgeLines = new THREE.LineSegments(edges, lineMat);
  edgeLines.position.copy(faceMesh.position);
  group.add(edgeLines);

  // Local point that always sits on the front-facing interactive surface of the
  // compartment; used to project hit-test and automated 3D verification points.
  group.userData.probePoint = { x: 0, y: 0, z: dim.z / 2 };

  return group;
}

/**
 * Procedural Bin Mesh:
 * An open-top compartment container with front lip.
 */
export function createBinMesh(
  dim: Vector3D,
  userData: MeshUserData,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const { isOpen = false } = options;
  const group = new THREE.Group();
  group.name = `bin-${userData.locationCode}`;

  const wallThickness = Math.min(0.006, dim.x * 0.05);

  // Base
  const baseGeo = new THREE.BoxGeometry(dim.x, wallThickness, dim.z);
  const mat = createSemanticMaterial(state);
  const baseMesh = new THREE.Mesh(baseGeo, mat);
  baseMesh.position.set(0, -dim.y / 2 + wallThickness / 2, 0);
  baseMesh.userData = userData;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Back wall
  const backGeo = new THREE.BoxGeometry(
    dim.x,
    dim.y - wallThickness,
    wallThickness,
  );
  const backMesh = new THREE.Mesh(backGeo, mat);
  backMesh.position.set(0, wallThickness / 2, -dim.z / 2 + wallThickness / 2);
  backMesh.userData = userData;
  group.add(backMesh);

  // Left wall
  const leftGeo = new THREE.BoxGeometry(
    wallThickness,
    dim.y - wallThickness,
    dim.z - wallThickness,
  );
  const leftMesh = new THREE.Mesh(leftGeo, mat);
  leftMesh.position.set(-dim.x / 2 + wallThickness / 2, wallThickness / 2, 0);
  leftMesh.userData = userData;
  group.add(leftMesh);

  // Right wall
  const rightMesh = new THREE.Mesh(leftGeo, mat);
  rightMesh.position.set(dim.x / 2 - wallThickness / 2, wallThickness / 2, 0);
  rightMesh.userData = userData;
  group.add(rightMesh);

  // Front lip (half-height for open parts scoop)
  const frontHeight = (dim.y - wallThickness) * 0.55;
  const frontGeo = new THREE.BoxGeometry(dim.x, frontHeight, wallThickness);
  const labelTexture = createCompartmentLabelTexture(
    userData.locationCode,
    state,
    badgeText,
    isOpen,
  );
  const frontMat = createSemanticMaterial(state, labelTexture);
  const frontMesh = new THREE.Mesh(frontGeo, frontMat);
  frontMesh.position.set(
    0,
    -dim.y / 2 + wallThickness + frontHeight / 2,
    dim.z / 2 - wallThickness / 2,
  );
  frontMesh.userData = userData;
  group.add(frontMesh);

  // Front lip centre (label plate) doubles as the interaction probe point.
  group.userData.probePoint = {
    x: 0,
    y: -dim.y / 2 + wallThickness + frontHeight / 2,
    z: dim.z / 2 - wallThickness / 2,
  };

  return group;
}

/**
 * Procedural Shelf / Tier Mesh:
 * A horizontal shelf tier or flat deck.
 */
export function createShelfDeckMesh(
  dim: Vector3D,
  userData: MeshUserData,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const { isOpen = false } = options;
  const group = new THREE.Group();
  group.name = `shelf-${userData.locationCode}`;

  const deckThickness = Math.min(0.02, dim.y * 0.15);
  const deckGeo = new THREE.BoxGeometry(dim.x, deckThickness, dim.z);
  const labelTexture = createCompartmentLabelTexture(
    userData.locationCode,
    state,
    badgeText,
    isOpen,
  );
  const mat = createSemanticMaterial(state, labelTexture);
  const deckMesh = new THREE.Mesh(deckGeo, mat);
  deckMesh.position.set(0, -dim.y / 2 + deckThickness / 2, 0);
  deckMesh.userData = userData;
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  const edges = new THREE.EdgesGeometry(deckGeo);
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color:
        state === "selected"
          ? SPATIAL_3D_PALETTE.selectedEdgeLines
          : SPATIAL_3D_PALETTE.edgeLines,
    }),
  );
  edgeLines.position.copy(deckMesh.position);
  group.add(edgeLines);

  // Deck top surface centre: the visible, clickable face of an open shelf tier.
  group.userData.probePoint = {
    x: 0,
    y: -dim.y / 2 + deckThickness + 0.001,
    z: 0,
  };

  return group;
}

/**
 * Procedural Generic Box (fallback for other compartments):
 */
export function createGenericBoxMesh(
  dim: Vector3D,
  userData: MeshUserData,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const { isOpen = false } = options;
  const group = new THREE.Group();
  group.name = `box-${userData.locationCode}`;

  const geo = new THREE.BoxGeometry(dim.x * 0.98, dim.y * 0.98, dim.z * 0.98);
  const labelTexture = createCompartmentLabelTexture(
    userData.locationCode,
    state,
    badgeText,
    isOpen,
  );
  const mat = createSemanticMaterial(state, labelTexture);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = userData;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geo);
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color:
        state === "selected"
          ? SPATIAL_3D_PALETTE.selectedEdgeLines
          : SPATIAL_3D_PALETTE.edgeLines,
    }),
  );
  group.add(edgeLines);

  group.userData.probePoint = { x: 0, y: 0, z: dim.z / 2 };

  return group;
}

/**
 * Creates the rendered instance of a child location.
 *
 * The instance is composed from the child's **canonical representation** — the
 * same resolution used when the child is the viewed parent — so a location
 * never changes shape because of the scene it appears in. The parent supplies
 * placement (position/rotation/scale), the semantic material and the label; it
 * never substitutes a proxy box for an authoritative model or body.
 *
 * Only a location with no authoritative representation at all renders the
 * explicit `fallback` compartment vocabulary, and that tier is observable via
 * `userData.representationSource`.
 *
 * `options.openable` swaps a slidable body for a hollow open-top tray so the
 * compartment can slide out and reveal an interior; `options.isOpen` prints the
 * transient OPEN indicator on the label face.
 */
export function createChildCompartmentMesh(
  child: SceneChildLayout,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const representation = resolveChildSpatialRepresentation(child.rawChild);
  const userData: MeshUserData = {
    locationId: child.locationId,
    locationCode: child.locationCode,
    locationName: child.locationName,
    kind: child.kind,
    hasStock: child.hasStock,
    isMapped: child.isMapped,
    isParent: false,
    representationSource: representation.source,
    representationReason: representation.reason,
  };

  const openable = Boolean(options.openable);
  let group: THREE.Group;

  if (
    representation.source !== "fallback" &&
    representation.structure !== "none"
  ) {
    // One geometry pipeline: the child instance is the child's own body.
    const labelTexture = createCompartmentLabelTexture(
      child.locationCode,
      state,
      badgeText,
      Boolean(options.isOpen),
    );
    group = createStructureBodyMesh(
      representation.structure,
      child.dimensions,
      userData,
      {
        wallThicknessMm: representation.wallThicknessMm,
        postWidthMm: representation.postWidthMm,
        beamHeightMm: representation.beamHeightMm,
      },
      {
        body: createSemanticMaterial(state),
        interior: createSemanticMaterial(state),
      },
      { openable, isOpen: options.isOpen, labelTexture },
    );
    if (group.userData.probePoint === undefined) {
      group.userData.probePoint = { x: 0, y: 0, z: child.dimensions.z / 2 };
    }
    return positionChildGroup(group, child);
  }

  // Explicit fallback tier: no model, no authored geometry, no kind shape.
  // Shape selection is canonical/token-safe (`resolveKindStructureShape` never
  // substring-matches), so an unknown kind (`cabinet`, `ic_tube_/_rail`,
  // `tube_holder`, `glass tube`, arbitrary strings) can never be misread as
  // tray/bin/drawer geometry — it resolves to the generic box below.
  const fallbackShape = resolveKindStructureShape(child.kind);
  if (fallbackShape === "enclosure") {
    // A cabinet-shaped fallback is a container, not a compartment body.
    group = createGenericBoxMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else if (fallbackShape === "drawer" || (openable && fallbackShape === "tray")) {
    // An openable tray-shaped fallback slides out as a drawer body.
    group = createDrawerMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else if (fallbackShape === "tray") {
    group = createBinMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else if (fallbackShape === "shelf") {
    group = createShelfDeckMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else {
    group = createGenericBoxMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  }

  // The instance root carries the same identity as its meshes, including the
  // representation tier, so a fallback instance is observable rather than
  // silent.
  group.userData = { ...userData, ...group.userData };

  return positionChildGroup(group, child);
}

/**
 * Applies the scene transform (persisted position, rotation and scale) to a
 * composed child instance. Representation and transform stay separate: the same
 * representation appears in any scene, only its transform differs.
 */
function positionChildGroup(
  group: THREE.Group,
  child: SceneChildLayout,
): THREE.Group {
  group.position.set(child.position.x, child.position.y, child.position.z);
  group.rotation.set(child.rotation.x, child.rotation.y, child.rotation.z);
  group.scale.set(child.scale.x, child.scale.y, child.scale.z);
  return group;
}

/**
 * Creates the outer body for the parent location: a cabinet/rack/tray carcass
 * for a physical container, or the cutaway warehouse shell for a space kind.
 * Bodies are rendered with an open front so the compartments and equipment
 * inside them remain visible.
 */
export interface ParentCarcassOptions {
  isSelected?: boolean;
  needsAttention?: boolean;
  /**
   * Authored body shape, resolved by `resolveParentGeometryOwnership`.
   * `"none"` means the location owns no physical enclosure (a warehouse/root
   * overview) and must not become a mesh.
   */
  structure?: ParentStructureShape;
  /** Authored structure parameters in millimetres, when a layout defines them. */
  wallThicknessMm?: number | null;
  postWidthMm?: number | null;
  beamHeightMm?: number | null;
  shelfLevels?: number | null;
  reelRows?: number | null;
  reelSlotSpacingMm?: number | null;
  gridRows?: number | null;
  gridColumns?: number | null;
  gridDividerThicknessMm?: number | null;
}

/**
 * Builds the cutaway shell that visualizes a warehouse/root location: a floor
 * slab, a back wall, two partial side walls, a pitched roof and a few exposed
 * structural posts and beams, with the front left completely open so the
 * equipment standing inside stays visible and clickable.
 *
 * The shell is scene context, not inventory geometry: its dimensions come from
 * `resolveWarehouseShellDimensions`, its floor top sits on
 * `WAREHOUSE_FLOOR_ELEVATION_METERS` (the warehouse scene's floor reference),
 * and it deliberately has no front wall, doors, windows, lights, furniture or
 * decorative assets. Every mesh still carries the location's `userData`, so
 * callers that opt into parent selection keep their existing behavior.
 */
export function createWarehouseShellMesh(
  dimensions: Vector3D,
  userData: MeshUserData,
  materials?: StructureBodyMaterials,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `warehouse-shell-${userData.locationCode}`;

  const { x: W, y: H, z: D } = dimensions;
  const minSpan = Math.min(W, D);
  const wall = Math.max(0.025, Math.min(0.05, minSpan * 0.04));
  // A thicker slab reads as a poured floor and marks the warehouse boundary.
  const floorThickness = Math.max(0.1, wall * 2.4);
  // The rear third of each side wall is enough to read as an enclosure without
  // fencing the contents off from the front corner view.
  const sideWallDepth = D / 3;
  const eaveOverhang = Math.min(0.15, W * 0.05);
  // `H` is the shell's outer envelope, so the walls stop at the eaves and the
  // pitched roof rises to the envelope's top.
  const roofRise = resolveWarehouseRoofRise(W);
  const eaveHeight = Math.max(H - roofRise, H * 0.5);
  const roofHalfSpan = W / 2 + eaveOverhang;
  const roofSlabLength = Math.hypot(roofHalfSpan, roofRise);
  const roofPitch = Math.atan2(roofRise, roofHalfSpan);
  const roofThickness = Math.max(0.05, wall * 1.6);

  // Exposed structure: corner posts, eave beams and a ridge line. Kept to a
  // handful of members so the storage objects stay the focus.
  const post = Math.max(0.07, wall * 1.8);
  const beam = Math.max(0.05, wall * 1.4);
  const ribWidth = Math.max(0.03, post * 0.6);
  const ribDepth = Math.min(0.03, wall * 0.8);
  const ribSpacing = 0.36;

  const wallMat =
    materials?.body ??
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(SPATIAL_3D_PALETTE.carcass.base),
      roughness: SPATIAL_3D_PALETTE.carcass.roughness,
      metalness: SPATIAL_3D_PALETTE.carcass.metalness,
    });

  // Panel seams and the exposed frame use the darker interior tone, so the
  // structure stays legible against the wall panels without any texture.
  const structureMat =
    materials?.interior ??
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(SPATIAL_3D_PALETTE.carcassInterior.base),
      roughness: SPATIAL_3D_PALETTE.carcassInterior.roughness,
      metalness: SPATIAL_3D_PALETTE.carcassInterior.metalness,
    });

  const floorMat = structureMat;

  const addShellMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vector3D,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position.x, position.y, position.z);
    mesh.userData = userData;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // 1. Floor slab: its top face is the ground plane the contents stand on, so
  // it extends downwards instead of lifting every persisted child coordinate.
  addShellMesh(
    "warehouse-floor",
    new THREE.BoxGeometry(W, floorThickness, D),
    floorMat,
    { x: 0, y: -floorThickness / 2, z: 0 },
  );
  const floorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, floorThickness, D)),
    new THREE.LineBasicMaterial({ color: SPATIAL_3D_PALETTE.edgeLines }),
  );
  floorEdges.name = "warehouse-floor-edge";
  floorEdges.position.set(0, -floorThickness / 2, 0);
  group.add(floorEdges);

  // 2. Back wall with vertical corrugation ribs on its inner face.
  addShellMesh(
    "warehouse-back-wall",
    new THREE.BoxGeometry(W, eaveHeight, wall),
    wallMat,
    { x: 0, y: eaveHeight / 2, z: -D / 2 + wall / 2 },
  );
  const ribMargin = Math.min(0.16, eaveHeight * 0.08);
  const ribGeometry = new THREE.BoxGeometry(
    ribWidth,
    Math.max(0.1, eaveHeight - 2 * ribMargin),
    ribDepth,
  );
  let ribIndex = 0;
  for (
    let x = -W / 2 + ribSpacing;
    x <= W / 2 - ribSpacing / 2;
    x += ribSpacing
  ) {
    addShellMesh(
      `warehouse-back-panel-${ribIndex++}`,
      ribGeometry,
      structureMat,
      { x, y: eaveHeight / 2, z: -D / 2 + wall + ribDepth / 2 },
    );
  }

  // 3. Partial side walls (rear third only) with the same panel treatment.
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    addShellMesh(
      `warehouse-side-wall-${sideName}`,
      new THREE.BoxGeometry(wall, eaveHeight, sideWallDepth),
      wallMat,
      {
        x: side * (W / 2 - wall / 2),
        y: eaveHeight / 2,
        z: -D / 2 + sideWallDepth / 2,
      },
    );
    const sideRibGeometry = new THREE.BoxGeometry(
      ribDepth,
      Math.max(0.1, eaveHeight - 2 * ribMargin),
      ribWidth,
    );
    let sideRibIndex = 0;
    for (
      let z = -D / 2 + ribSpacing;
      z <= -D / 2 + sideWallDepth - ribSpacing / 2;
      z += ribSpacing
    ) {
      addShellMesh(
        `warehouse-side-panel-${sideName}-${sideRibIndex++}`,
        sideRibGeometry,
        structureMat,
        {
          x: side * (W / 2 - wall - ribDepth / 2),
          y: eaveHeight / 2,
          z,
        },
      );
    }
  }

  // 4. Pitched roof: two thick slabs meeting at the ridge, with a modest
  // overhang and a ridge cap closing the apex.
  const roofGeometry = new THREE.BoxGeometry(
    roofSlabLength,
    roofThickness,
    D + 2 * eaveOverhang,
  );
  for (const side of [-1, 1]) {
    const slabMesh = addShellMesh(
      `warehouse-roof-${side < 0 ? "left" : "right"}`,
      roofGeometry,
      wallMat,
      {
        x: (side * roofHalfSpan) / 2,
        y: eaveHeight + roofRise / 2,
        z: 0,
      },
    );
    slabMesh.rotation.z = -side * roofPitch;
  }
  addShellMesh(
    "warehouse-ridge-cap",
    new THREE.BoxGeometry(
      beam * 2.4,
      roofThickness * 1.4,
      D + 2 * eaveOverhang,
    ),
    structureMat,
    { x: 0, y: eaveHeight + roofRise, z: 0 },
  );

  // 5. Exposed structure: four corner posts, eave beams and a ridge beam.
  const postGeometry = new THREE.BoxGeometry(post, eaveHeight, post);
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      addShellMesh(
        `warehouse-post-${sideX < 0 ? "left" : "right"}-${sideZ < 0 ? "rear" : "front"}`,
        postGeometry,
        structureMat,
        {
          x: sideX * (W / 2 - post / 2),
          y: eaveHeight / 2,
          z: sideZ * (D / 2 - post / 2),
        },
      );
    }
  }
  const eaveBeamGeometry = new THREE.BoxGeometry(
    beam,
    beam,
    Math.max(0.1, D - post),
  );
  for (const side of [-1, 1]) {
    addShellMesh(
      `warehouse-eave-beam-${side < 0 ? "left" : "right"}`,
      eaveBeamGeometry,
      structureMat,
      { x: side * (W / 2 - post / 2), y: eaveHeight - beam / 2, z: 0 },
    );
  }
  addShellMesh(
    "warehouse-back-beam",
    new THREE.BoxGeometry(Math.max(0.1, W - 2 * post), beam, beam),
    structureMat,
    { x: 0, y: eaveHeight - beam / 2, z: -D / 2 + post / 2 },
  );
  addShellMesh(
    "warehouse-ridge-beam",
    new THREE.BoxGeometry(beam, beam, Math.max(0.1, D - post)),
    structureMat,
    { x: 0, y: eaveHeight + roofRise - beam, z: 0 },
  );

  return group;
}

/**
 * Grounds one rendered object on the warehouse floor.
 *
 * The correction comes from the object's world-space bounding box *after* its
 * persisted position, rotation and scale are applied as authored — never from a
 * hard-coded offset and never by assuming the object's origin sits at its
 * centre or at its bottom. Objects whose own geometry carries feet or clearance
 * keep that silhouette: only the object's root translation changes.
 *
 * This is a scene composition transform. The persisted spatial node, rotation,
 * scale, model dimensions, mappings and ownership metadata are never touched,
 * and no correction is ever written back to the database.
 *
 * @returns the vertical correction applied, in meters (0 when already grounded).
 */
export function groundObjectOnFloor(
  object: THREE.Object3D,
  floorElevationMeters: number = WAREHOUSE_FLOOR_ELEVATION_METERS,
  clearanceMeters: number = WAREHOUSE_GROUNDING_CLEARANCE_METERS,
): number {
  if (!Number.isFinite(floorElevationMeters)) return 0;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return 0;

  const correction = floorElevationMeters + clearanceMeters - bounds.min.y;
  if (!Number.isFinite(correction)) return 0;
  object.position.y += correction;
  object.updateMatrixWorld(true);
  return correction;
}

/** Materials a structure body is drawn with. */
export interface StructureBodyMaterials {
  /** Outer body material (carcass palette, or the semantic state material). */
  body: THREE.Material;
  /** Interior/backing material, drawn darker than the body. */
  interior: THREE.Material;
}

/** Authored structure parameters in millimetres, when a layout defines them. */
export interface StructureBodyParams {
  wallThicknessMm?: number | null;
  postWidthMm?: number | null;
  beamHeightMm?: number | null;
  shelfLevels?: number | null;
  reelRows?: number | null;
  reelSlotSpacingMm?: number | null;
  gridRows?: number | null;
  gridColumns?: number | null;
  gridDividerThicknessMm?: number | null;
}

export interface StructureBodyOptions {
  /** Hollow, open-top body so a slidable compartment can reveal an interior. */
  openable?: boolean;
  /** Prints the transient OPEN indicator on the label face. */
  isOpen?: boolean;
  /**
   * Label texture for the structure's label face. Parent scenes render bodies
   * without labels (the page chrome names them); child instances carry their
   * code so operators can identify what they are looking at.
   */
  labelTexture?: THREE.Texture | null;
}

/**
 * Creates the body geometry for a resolved representation structure.
 *
 * This is the single geometry pipeline: the same call produces a location's
 * body whether that location is the viewed parent or composed as a child inside
 * another scene. Only the materials differ — a parent body uses the carcass
 * palette, a child instance uses the semantic state material, which is the
 * context/selection difference the representation invariant allows.
 */
export function createStructureBodyMesh(
  structure: ParentStructureShape,
  dimensions: Vector3D,
  userData: MeshUserData,
  params: StructureBodyParams = {},
  materials: StructureBodyMaterials = {
    body: new THREE.MeshStandardMaterial({
      color: new THREE.Color(SPATIAL_3D_PALETTE.carcass.base),
      roughness: SPATIAL_3D_PALETTE.carcass.roughness,
      metalness: SPATIAL_3D_PALETTE.carcass.metalness,
    }),
    interior: new THREE.MeshStandardMaterial({
      color: new THREE.Color(SPATIAL_3D_PALETTE.carcassInterior.base),
      roughness: SPATIAL_3D_PALETTE.carcassInterior.roughness,
      metalness: SPATIAL_3D_PALETTE.carcassInterior.metalness,
    }),
  },
  options: StructureBodyOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `structure-${structure}-${userData.locationCode}`;
  // The instance root carries the same identity as its meshes, so callers and
  // tests can read which representation tier produced it.
  group.userData = { ...userData };

  // A location without a body (a space, an unrepresentable kind) contributes no
  // geometry; the caller decides what, if anything, fallback rendering adds.
  if (structure === "none") return group;

  const bodyMat = materials.body;
  const interiorMat = materials.interior;
  const { x: W, y: H, z: D } = dimensions;
  const minSpan = Math.min(W, D);

  if (structure === "warehouse") {
    group.add(
      createWarehouseShellMesh(dimensions, userData, {
        body: bodyMat,
        interior: interiorMat,
      }),
    );
    return group;
  }

  if (structure === "dry-cabinet") {
    const cabinet = new THREE.Group();
    cabinet.name = `structure-dry-cabinet-${userData.locationCode}`;
    const authoredWall = params.wallThicknessMm;
    const t = Math.min(
      Math.min(W, H, D) * 0.15,
      authoredWall != null && authoredWall > 0
        ? mmToMeters(authoredWall)
        : Math.min(W, H, D) * 0.035,
    );
    const addPanel = (name: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      panel.name = `dry-cabinet-${name}-${userData.locationCode}`;
      panel.position.set(x, y, z);
      panel.userData = userData;
      cabinet.add(panel);
    };
    // A dry-storage carcass: solid rear, insulated side walls and top/base,
    // with a framed, open front so the storage volume remains visible.
    addPanel("left-wall", t, H, D, -W / 2 + t / 2, 0, 0);
    addPanel("right-wall", t, H, D, W / 2 - t / 2, 0, 0);
    addPanel("back-wall", W - 2 * t, H, t, 0, 0, -D / 2 + t / 2);
    addPanel("top", W - 2 * t, t, D - t, 0, H / 2 - t / 2, t / 2);
    addPanel("base", W - 2 * t, t, D - t, 0, -H / 2 + t / 2, t / 2);
    // Front stiles define the opening without adding a door that would obscure contents.
    addPanel("front-left-stile", t, H, t, -W / 2 + t / 2, 0, D / 2 - t / 2);
    addPanel("front-right-stile", t, H, t, W / 2 - t / 2, 0, D / 2 - t / 2);
    addPanel("opening-header", W - 2 * t, t, t, 0, H / 2 - t / 2, D / 2 - t / 2);
    addPanel("opening-sill", W - 2 * t, t, t, 0, -H / 2 + t / 2, D / 2 - t / 2);
    return cabinet;
  }

  if (structure === "matrix-tray" || structure === "compartment") {
    const authoredWall = params.wallThicknessMm != null && params.wallThicknessMm > 0
      ? mmToMeters(params.wallThicknessMm)
      : Math.min(0.018, minSpan * 0.05);
    const t = Math.min(authoredWall, Math.min(W, H, D) * 0.25);
    const addPanel = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = bodyMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.name = `${structure}-${name}-${userData.locationCode}`;
      mesh.position.set(x, y, z);
      mesh.userData = userData;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    // Both are open-top physical compartments. Matrix Tray has an open front;
    // individual Compartment models retain four side walls around their base.
    addPanel("base", W, t, D, 0, -H / 2 + t / 2, 0);
    addPanel("left-wall", t, H - t, D, -W / 2 + t / 2, t / 2, 0);
    addPanel("right-wall", t, H - t, D, W / 2 - t / 2, t / 2, 0);
    if (structure === "matrix-tray") {
      addPanel("back-wall", W - 2 * t, H - t, t, 0, t / 2, -D / 2 + t / 2, interiorMat);
      const rows = Math.max(1, Math.floor(params.gridRows ?? 4));
      const columns = Math.max(1, Math.floor(params.gridColumns ?? 6));
      const divider = Math.min(
        params.gridDividerThicknessMm != null && params.gridDividerThicknessMm > 0
          ? mmToMeters(params.gridDividerThicknessMm)
          : t * 0.65,
        Math.min(W / (columns * 2), D / (rows * 2)),
      );
      const clearW = Math.max(0, W - 2 * t);
      const clearD = Math.max(0, D - t);
      const cellW = Math.max(0, (clearW - (columns - 1) * divider) / columns);
      const cellD = Math.max(0, (clearD - (rows - 1) * divider) / rows);
      for (let col = 1; col < columns; col++) {
        const x = -W / 2 + t + col * cellW + (col - 1) * divider + divider / 2;
        addPanel("column-divider", divider, H - t, clearD, x, t / 2, t / 2, interiorMat);
      }
      for (let row = 1; row < rows; row++) {
        const z = -D / 2 + t + row * cellD + (row - 1) * divider + divider / 2;
        addPanel("row-divider", clearW, H - t, divider, 0, t / 2, z, interiorMat);
      }
    } else {
      addPanel("front-wall", W, H - t, t, 0, t / 2, D / 2 - t / 2, interiorMat);
      addPanel("back-wall", W, H - t, t, 0, t / 2, -D / 2 + t / 2, interiorMat);
    }
    return group;
  }

  if (structure === "tube" || structure === "reel-slot") {
    if (structure === "reel-slot") {
      const supportWidth = Math.min(W * 0.16, Math.max(0.008, W * 0.12));
      const baseHeight = Math.min(H * 0.16, Math.max(0.008, H * 0.12));
      const pegRadius = Math.max(0.003, Math.min(H, D) * 0.045);
      const base = new THREE.Mesh(new THREE.BoxGeometry(W, baseHeight, D), bodyMat);
      base.position.y = -H / 2 + baseHeight / 2;
      base.userData = userData;
      group.add(base);
      for (const x of [-W / 2 + supportWidth / 2, W / 2 - supportWidth / 2]) {
        const cheek = new THREE.Mesh(
          new THREE.BoxGeometry(supportWidth, H, Math.min(D * 0.12, supportWidth)),
          interiorMat,
        );
        cheek.position.set(x, 0, D / 2 - Math.min(D * 0.12, supportWidth) / 2);
        cheek.userData = userData;
        group.add(cheek);
      }
      const axle = new THREE.Mesh(
        new THREE.CylinderGeometry(pegRadius, pegRadius, Math.max(0, W - 2 * supportWidth), 16),
        bodyMat,
      );
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0, D / 2 - pegRadius * 2);
      axle.userData = userData;
      group.add(axle);
      const retainer = new THREE.Mesh(
        new THREE.TorusGeometry(pegRadius * 1.35, Math.max(0.002, pegRadius * 0.18), 8, 16),
        interiorMat,
      );
      retainer.rotation.y = Math.PI / 2;
      retainer.position.set(W / 2 - supportWidth, 0, D / 2 - pegRadius * 2);
      retainer.userData = userData;
      group.add(retainer);
    } else {
      // IC Tube / Rail (the ic_tube_rail model resolves to the "tube" structure):
      // an open-top channel — base plus two side walls running the full depth.
      const thickness = Math.min(W, H, D) * 0.08;
      const addRailPanel = (name: string, w: number, h: number, x: number, y: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, D), bodyMat);
        mesh.name = `tube-${name}-${userData.locationCode}`;
        mesh.position.set(x, y, 0);
        mesh.userData = userData;
        mesh.castShadow = true;
        group.add(mesh);
      };
      addRailPanel("base", W, thickness, 0, -H / 2 + thickness / 2);
      addRailPanel("left-wall", thickness, H - thickness, -W / 2 + thickness / 2, thickness / 2);
      addRailPanel("right-wall", thickness, H - thickness, W / 2 - thickness / 2, thickness / 2);
    }
    group.userData.probePoint = { x: 0, y: 0, z: D / 2 };
    addStructureLabel(group, structure, dimensions, userData, options);
    return group;
  }

if (structure === "reel-rack") {
  const rack = new THREE.Group();
  rack.name = `structure-reel-rack-${userData.locationCode}`;
  rack.userData = { ...userData };
  const postWidth = Math.min(0.04, Math.min(W, D) * 0.09);
  const railHeight = Math.min(0.03, H * 0.04);
  const postGeo = new THREE.BoxGeometry(postWidth, H, postWidth);
  for (const x of [-W / 2 + postWidth / 2, W / 2 - postWidth / 2]) {
    for (const z of [-D / 2 + postWidth / 2, D / 2 - postWidth / 2]) {
      const post = new THREE.Mesh(postGeo, bodyMat);
      post.position.set(x, 0, z);
      post.userData = userData;
      post.castShadow = true;
      rack.add(post);
    }
  }
  const rows = Math.max(1, Math.floor(params.reelRows ?? 3));
  const spacing = mmToMeters(params.reelSlotSpacingMm ?? 12);
  const beam = Math.min(
    params.beamHeightMm != null && params.beamHeightMm > 0
      ? mmToMeters(params.beamHeightMm)
      : railHeight,
    H / (rows + 1),
  );
  const openHeight = Math.max(0, H - (rows + 1) * beam - (rows - 1) * spacing) / rows;
  for (let row = 0; row <= rows; row++) {
    const y = -H / 2 + beam / 2 + row * (openHeight + beam) + Math.max(0, row - 1) * spacing;
    for (const z of [-D / 2 + postWidth / 2, D / 2 - postWidth / 2]) {
      const crossbarMesh = new THREE.Mesh(
        new THREE.BoxGeometry(W - 2 * postWidth, beam, postWidth),
        interiorMat,
      );
      crossbarMesh.position.set(0, y, z);
      crossbarMesh.userData = userData;
      rack.add(crossbarMesh);
    }
  }
  const sideRail = new THREE.BoxGeometry(postWidth, railHeight, D - 2 * postWidth);
  for (const x of [-W / 2 + postWidth / 2, W / 2 - postWidth / 2]) {
    for (const y of [-H / 2 + railHeight / 2, H / 2 - railHeight / 2]) {
      const rail = new THREE.Mesh(sideRail, bodyMat);
      rail.position.set(x, y, 0);
      rail.userData = userData;
      rack.add(rail);
    }
  }
  addStructureLabel(rack, structure, dimensions, userData, options);
  return rack;
}

const authoredWall =
  params.wallThicknessMm != null && params.wallThicknessMm > 0
    ? mmToMeters(params.wallThicknessMm)
    : null;
const authoredPost =
  params.postWidthMm != null && params.postWidthMm > 0
    ? mmToMeters(params.postWidthMm)
    : null;
const authoredBeam =
  params.beamHeightMm != null && params.beamHeightMm > 0
    ? mmToMeters(params.beamHeightMm)
    : null;
// Authored structure thickness wins over the generic proportional default.
const wall = Math.min(
  authoredWall ?? Math.min(0.018, minSpan * 0.05),
  minSpan * 0.25,
);

const addWireFrame = (): void => {
  const frameGeo = new THREE.BoxGeometry(W, H, D);
  const edges = new THREE.EdgesGeometry(frameGeo);
  const lineMat = new THREE.LineBasicMaterial({
    color: SPATIAL_3D_PALETTE.edgeLines,
    linewidth: 1,
  });
  const wireFrame = new THREE.LineSegments(edges, lineMat);
  wireFrame.position.set(0, 0, 0);
  wireFrame.raycast = () => { };
  group.add(wireFrame);
};

// 1. Rack / shelf frame: upright posts and perimeter rails, open on all sides.
if (structure === "rack") {
  const postWidth = Math.min(
    authoredPost ?? Math.min(0.035, minSpan * 0.08),
    minSpan * 0.3,
  );
  const railThickness = Math.min(authoredBeam ?? postWidth * 0.7, H * 0.2);
  const postGeo = new THREE.BoxGeometry(postWidth, H, postWidth);

  const corners = [
    { x: -W / 2 + postWidth / 2, z: -D / 2 + postWidth / 2 },
    { x: W / 2 - postWidth / 2, z: -D / 2 + postWidth / 2 },
    { x: -W / 2 + postWidth / 2, z: D / 2 - postWidth / 2 },
    { x: W / 2 - postWidth / 2, z: D / 2 - postWidth / 2 },
  ];

  for (const pos of corners) {
    const postMesh = new THREE.Mesh(postGeo, bodyMat);
    postMesh.position.set(pos.x, 0, pos.z);
    postMesh.userData = userData;
    postMesh.castShadow = true;
    group.add(postMesh);
  }

  const railXGeo = new THREE.BoxGeometry(W, railThickness, railThickness);
  for (const yPos of [
    -H / 2 + railThickness / 2,
    H / 2 - railThickness / 2,
  ]) {
    for (const zPos of [-D / 2 + postWidth / 2, D / 2 - postWidth / 2]) {
      const rail = new THREE.Mesh(railXGeo, bodyMat);
      rail.position.set(0, yPos, zPos);
      rail.userData = userData;
      group.add(rail);
    }
  }

  const levelCount = Math.max(0, Math.floor(params.shelfLevels ?? 0));
  const levelBeamHeight = Math.min(
    params.beamHeightMm != null && params.beamHeightMm > 0
      ? mmToMeters(params.beamHeightMm)
      : railThickness,
    H / Math.max(2, levelCount + 1),
  );
  const openLevelHeight =
    levelCount > 0
      ? Math.max(0, H - (levelCount + 1) * levelBeamHeight) / levelCount
      : 0;
  for (let level = 0; level < levelCount; level++) {
    // Match the preset's authored beam/opening rhythm so support levels
    // stay registered to the parametric Shelf placements.
    const y =
      -H / 2 +
      levelBeamHeight +
      level * (openLevelHeight + levelBeamHeight) +
      openLevelHeight / 2;
    for (const z of [-D / 2 + postWidth / 2, D / 2 - postWidth / 2]) {
      const beam = new THREE.Mesh(railXGeo, bodyMat);
      beam.position.set(0, y, z);
      beam.userData = userData;
      beam.castShadow = true;
      group.add(beam);
    }
  }

  addWireFrame();
  addStructureLabel(group, structure, dimensions, userData, options);
  return group;
}

// A canonical shelf is a load-bearing deck with a thin physical envelope,
// not an enclosed storage box. Its outer X/Z bounds and declared height are
// preserved exactly; the supports stay inside that envelope.
if (structure === "shelf") {
  const deckThickness = Math.min(H, Math.max(0.008, Math.min(H * 0.35, 0.02)));
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(W, deckThickness, D),
    bodyMat,
  );
  deck.position.y = -H / 2 + deckThickness / 2;
  deck.userData = userData;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const supportThickness = Math.min(deckThickness, Math.min(W, D) * 0.04);
  const supportDepth = Math.min(D, Math.max(supportThickness, D * 0.08));
  for (const x of [-W / 2 + supportThickness / 2, W / 2 - supportThickness / 2]) {
    const support = new THREE.Mesh(
      new THREE.BoxGeometry(supportThickness, deckThickness, supportDepth),
      interiorMat,
    );
    support.position.set(x, -H / 2 + deckThickness / 2, 0);
    support.userData = userData;
    group.add(support);
  }
  addWireFrame();
  addStructureLabel(group, structure, dimensions, userData, options);
  return group;
}

// 2. Open-top tray / slidable drawer body.
if (structure === "tray" || structure === "drawer") {
  const openable = Boolean(options.openable);
  const faceThickness = Math.min(0.015, D * 0.1);

  if (openable) {
    // A slidable body is hollow and open at the top so opening it reveals a
    // real interior without inventing stored contents.
    const tray = computeOpenTrayGeometry(dimensions, faceThickness);
    for (const part of tray.parts) {
      const partMesh = new THREE.Mesh(
        new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z),
        part.name.includes("front") && options.labelTexture
          ? createSemanticMaterialWithMap(bodyMat, options.labelTexture)
          : bodyMat,
      );
      partMesh.name = part.name;
      partMesh.position.set(
        part.position.x,
        part.position.y,
        part.position.z,
      );
      partMesh.userData = userData;
      partMesh.castShadow = true;
      partMesh.receiveShadow = true;
      group.add(partMesh);
    }
    group.userData.probePoint = { x: 0, y: 0, z: D / 2 };
    addStructureLabel(group, structure, dimensions, userData, options, {
      skipWhenApplied: true,
    });
    return group;
  }

  // Closed body: bottom plate, two sides and a back.
  const bottomGeo = new THREE.BoxGeometry(W, wall, D);
  const bottomMesh = new THREE.Mesh(bottomGeo, bodyMat);
  bottomMesh.position.set(0, -H / 2 + wall / 2, 0);
  bottomMesh.userData = userData;
  bottomMesh.receiveShadow = true;
  group.add(bottomMesh);

  const sideGeo = new THREE.BoxGeometry(wall, H - wall, D);
  for (const side of [-1, 1]) {
    const sideMesh = new THREE.Mesh(sideGeo, bodyMat);
    sideMesh.position.set(side * (W / 2 - wall / 2), wall / 2, 0);
    sideMesh.userData = userData;
    group.add(sideMesh);
  }

  const backGeo = new THREE.BoxGeometry(W - 2 * wall, H - wall, wall);
  const backMesh = new THREE.Mesh(backGeo, interiorMat);
  backMesh.position.set(0, wall / 2, -D / 2 + wall / 2);
  backMesh.userData = userData;
  group.add(backMesh);

  if (structure === "drawer") {
    // A sliding drawer closes its front: the front face is its identity.
    const frontGeo = new THREE.BoxGeometry(W, H, wall);
    const frontMesh = new THREE.Mesh(
      frontGeo,
      options.labelTexture
        ? createSemanticMaterialWithMap(bodyMat, options.labelTexture)
        : bodyMat,
    );
    frontMesh.position.set(0, 0, D / 2 - wall / 2);
    frontMesh.userData = userData;
    group.add(frontMesh);
    group.userData.probePoint = { x: 0, y: 0, z: D / 2 };
  } else {
    // A tray keeps its front open so its contents stay visible; its code
    // rides on a half-height front lip.
    const frontHeight = (H - wall) * 0.55;
    const lipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, frontHeight, wall),
      options.labelTexture
        ? createSemanticMaterialWithMap(bodyMat, options.labelTexture)
        : bodyMat,
    );
    lipMesh.position.set(
      0,
      -H / 2 + wall + frontHeight / 2,
      D / 2 - wall / 2,
    );
    lipMesh.userData = userData;
    group.add(lipMesh);
    group.userData.probePoint = {
      x: 0,
      y: -H / 2 + wall + frontHeight / 2,
      z: D / 2 - wall / 2,
    };
  }

  addWireFrame();
  addStructureLabel(group, structure, dimensions, userData, options, {
    skipWhenApplied: true,
  });
  return group;
}

// 3. Cabinet / default enclosure: open front with top, bottom, sides and back.
const topGeo = new THREE.BoxGeometry(W, wall, D);
const topMesh = new THREE.Mesh(topGeo, bodyMat);
topMesh.position.set(0, H / 2 - wall / 2, 0);
topMesh.userData = userData;
group.add(topMesh);

const bottomMesh = new THREE.Mesh(topGeo, bodyMat);
bottomMesh.position.set(0, -H / 2 + wall / 2, 0);
bottomMesh.userData = userData;
bottomMesh.receiveShadow = true;
group.add(bottomMesh);

const sideGeo = new THREE.BoxGeometry(wall, H - 2 * wall, D);
for (const side of [-1, 1]) {
  const sideMesh = new THREE.Mesh(sideGeo, bodyMat);
  sideMesh.position.set(side * (W / 2 - wall / 2), 0, 0);
  sideMesh.userData = userData;
  group.add(sideMesh);
}

const backGeo = new THREE.BoxGeometry(W - 2 * wall, H - 2 * wall, wall);
const backMesh = new THREE.Mesh(backGeo, interiorMat);
backMesh.position.set(0, 0, -D / 2 + wall / 2);
backMesh.userData = userData;
group.add(backMesh);

addWireFrame();
addStructureLabel(group, structure, dimensions, userData, options);

return group;
}

/**
 * Places the compartment's code on the structure's label face: the front plate
 * when the body has one, otherwise a compact nameplate at the top of the open
 * front, so identification never requires closing the opening.
 */
function addStructureLabel(
  group: THREE.Group,
  structure: ParentStructureShape,
  dimensions: Vector3D,
  userData: MeshUserData,
  options: StructureBodyOptions,
  { skipWhenApplied = false }: { skipWhenApplied?: boolean } = {},
): void {
  const texture = options.labelTexture;
  if (!texture || skipWhenApplied) return;

  const { x: W, y: H, z: D } = dimensions;
  // Readable default size, constrained to the model's own front face so a
  // narrow body (e.g. a 60 mm IC rail) never carries an overhanging label.
  const margin = Math.min(0.005, W * 0.05, H * 0.05);
  const availableWidth = Math.max(0, W - 2 * margin);
  const availableHeight = Math.max(0, H - 2 * margin);
  const plateWidth = Math.min(
    availableWidth,
    Math.max(0.12, Math.min(W * 0.7, 0.5)),
  );
  const plateHeight = Math.min(
    availableHeight,
    Math.min(Math.max(0.06, H * 0.12), 0.12),
  );
  const thickness = Math.min(0.01, D * 0.05);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(plateWidth, plateHeight, thickness),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true }),
  );
  plate.name = `structure-${structure}-label`;
  plate.position.set(
    0,
    Math.max(
      -H / 2 + margin + plateHeight / 2,
      H / 2 - plateHeight / 2 - Math.min(0.02, H * 0.04),
    ),
    D / 2 + thickness / 2,
  );
  plate.userData = userData;
  group.add(plate);
}

/** Applies a texture map to a cloned material (semantic colour + structure map). */
function createSemanticMaterialWithMap(
  material: THREE.Material,
  map: THREE.Texture,
): THREE.Material {
  const clone = material.clone();
  const standard = clone as THREE.MeshStandardMaterial;
  standard.map = map;
  standard.transparent = true;
  standard.needsUpdate = true;
  return clone;
}

/**
 * Creates the parent's visible body from the resolved structure: a container
 * carcass (rack frame, open tray, cabinet enclosure or sliding drawer front) or
 * the cutaway warehouse shell for a space kind. Passing `structure: "none"`
 * returns an empty group, so a location without authored geometry never grows
 * an invented body.
 *
 * The geometry comes from `createStructureBodyMesh`, the same pipeline a child
 * instance uses, so a location never changes shape between scenes.
 */
export function createParentCarcassMesh(
  parent: LocationOperationalViewParent,
  dimensions: Vector3D,
  options: ParentCarcassOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `parent-carcass-${parent.location.code}`;

  const kindLower = parent.location.kind?.toLowerCase() || "";
  // Callers normally pass an authored structure; this kind-based default keeps
  // direct callers consistent with the representation rules.
  const structure = options.structure ?? resolveKindStructureShape(kindLower);

  if (structure === "none") return group;

  const userData: MeshUserData = {
    locationId: parent.location.id,
    locationCode: parent.location.code,
    locationName: parent.location.name,
    kind: parent.location.kind,
    hasStock: false,
    isMapped: true,
    isParent: true,
  };

  const carcassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SPATIAL_3D_PALETTE.carcass.base),
    roughness: SPATIAL_3D_PALETTE.carcass.roughness,
    metalness: SPATIAL_3D_PALETTE.carcass.metalness,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SPATIAL_3D_PALETTE.carcassInterior.base),
    roughness: SPATIAL_3D_PALETTE.carcassInterior.roughness,
    metalness: SPATIAL_3D_PALETTE.carcassInterior.metalness,
  });

  group.add(
    createStructureBodyMesh(
      structure,
      dimensions,
      userData,
      {
        wallThicknessMm: options.wallThicknessMm,
        postWidthMm: options.postWidthMm,
        beamHeightMm: options.beamHeightMm,
        shelfLevels: options.shelfLevels,
        reelRows: options.reelRows,
        reelSlotSpacingMm: options.reelSlotSpacingMm,
        gridRows: options.gridRows,
        gridColumns: options.gridColumns,
        gridDividerThicknessMm: options.gridDividerThicknessMm,
      },
      { body: carcassMat, interior: interiorMat },
    ),
  );

  const { x: W, y: H, z: D } = dimensions;

  // Parent-first emphasis: the outer container is the required interaction
  // target until its Ananya location is assigned.
  if (options.needsAttention) {
    const attentionGeo = new THREE.BoxGeometry(W * 1.015, H * 1.015, D * 1.015);
    const attentionEdges = new THREE.EdgesGeometry(attentionGeo);
    const attentionMat = new THREE.LineBasicMaterial({
      color: SPATIAL_3D_PALETTE.attentionEdgeLines,
      transparent: true,
      opacity: 0.95,
    });
    const attentionOutline = new THREE.LineSegments(
      attentionEdges,
      attentionMat,
    );
    attentionOutline.name = "parent-attention-outline";
    attentionOutline.raycast = () => { };
    attentionOutline.userData = { ...userData };
    group.add(attentionOutline);
  }

  // Selected top-level container: highlight the full envelope so container
  // selection is visually distinct from compartment selection.
  if (options.isSelected) {
    const selectionGeo = new THREE.BoxGeometry(W * 1.01, H * 1.01, D * 1.01);
    const selectionEdges = new THREE.EdgesGeometry(selectionGeo);
    const selectionMat = new THREE.LineBasicMaterial({
      color: SPATIAL_3D_PALETTE.selectedEdgeLines,
      transparent: true,
      opacity: 0.95,
    });
    const selectionOutline = new THREE.LineSegments(
      selectionEdges,
      selectionMat,
    );
    selectionOutline.name = "parent-selection-outline";
    selectionOutline.raycast = () => { };
    selectionOutline.userData = { ...userData };
    group.add(selectionOutline);
  }

  return group;
}

/**
 * Helper to traverse up the scene tree from an intersected mesh to find the associated locationId.
 * Only Mesh objects represent interactive surfaces; wireframes, edge outlines, and grid lines
 * are visual styling and never capture selection.
 */
export function findInteractiveUserData(
  obj: THREE.Object3D | null,
): MeshUserData | null {
  if (!obj || !(obj instanceof THREE.Mesh)) return null;
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (curr.userData && curr.userData.locationId) {
      return curr.userData as MeshUserData;
    }
    curr = curr.parent;
  }
  return null;
}

export interface AnchorMarkerUserData {
  isAnchorMarker: true;
  anchorId: string;
  code: string;
  name: string;
  anchorType: string;
  mappedChildLocationId?: string;
  mappedChildCode?: string;
}

/**
 * Traverses up the scene hierarchy to find an AnchorMarkerUserData if intersected.
 */
export function findAnchorMarkerUserData(
  obj: THREE.Object3D | null,
): AnchorMarkerUserData | null {
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (curr.userData && curr.userData.isAnchorMarker) {
      return curr.userData as AnchorMarkerUserData;
    }
    curr = curr.parent;
  }
  return null;
}

/**
 * Resolves an anchor's Three.js scene position in meters, respecting centered vs corner origins.
 */
export function resolveAnchorScenePosition(
  anchor: {
    localPositionX: number;
    localPositionY: number;
    localPositionZ: number;
    boundingDepthMm?: number | null;
    metadata?: Record<string, unknown>;
  },
  parentDimensions?: Vector3D | null,
): Vector3D {
  const rawX = anchor.localPositionX;
  const rawY = anchor.localPositionY;

  let x = mmToMeters(rawX);
  const y = mmToMeters(rawY);
  let z = mmToMeters(anchor.localPositionZ);

  const isExplicitlyCentered =
    anchor.metadata &&
    typeof anchor.metadata === "object" &&
    (anchor.metadata as Record<string, unknown>).origin === "center";

  if (parentDimensions && parentDimensions.x > 0 && !isExplicitlyCentered) {
    if (rawX >= 0 && x <= parentDimensions.x) {
      x -= parentDimensions.x / 2;
    }
  }

  // The marker must land exactly where the mapped child renders, so it follows
  // the same Z convention detection as `resolveChildPosition`.
  if (
    parentDimensions &&
    parentDimensions.z > 0 &&
    !isExplicitlyCentered &&
    isCornerAuthoredAnchorZ(anchor, parentDimensions.z)
  ) {
    z -= parentDimensions.z / 2;
  }

  return { x, y, z };
}

/**
 * Converts a Three.js scene position back to millimeter local coordinates for the anchor.
 */
export function scenePositionToAnchorLocal(
  scenePos: { x: number; y: number; z: number },
  parentDimensions?: Vector3D | null,
  metadata?: Record<string, unknown>,
): { x: number; y: number; z: number } {
  let x = scenePos.x;
  const y = scenePos.y;
  let z = scenePos.z;

  const isExplicitlyCentered =
    metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).origin === "center";

  if (parentDimensions && parentDimensions.x > 0 && !isExplicitlyCentered) {
    x += parentDimensions.x / 2;
  }

  if (parentDimensions && parentDimensions.z > 0 && !isExplicitlyCentered) {
    z += parentDimensions.z / 2;
  }

  return {
    x: Math.round(metersToMm(x)),
    y: Math.round(metersToMm(y)),
    z: Math.round(metersToMm(z)),
  };
}

/**
 * Creates dynamic billboard text sprite for anchor markers.
 */
export function createAnchorLabelSprite(
  code: string,
  isSelected: boolean,
  mappedChildCode?: string,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = isSelected
      ? "rgba(245, 158, 11, 0.95)"
      : "rgba(15, 23, 42, 0.85)";

    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 16);
      ctx.fill();
    } else {
      ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
    }

    ctx.strokeStyle = isSelected ? "#FCD34D" : "rgba(56, 189, 248, 0.6)";
    ctx.lineWidth = 3;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 16);
      ctx.stroke();
    } else {
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    }

    ctx.fillStyle = isSelected ? "#0F172A" : "#F8FAFC";
    ctx.font = "bold 30px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const labelText = mappedChildCode ? `${code} (${mappedChildCode})` : code;
    ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.18, 0.054, 1);
  return sprite;
}

/**
 * Creates a 3D visualization group representing a spatial anchor.
 */
export function createAnchorMarkerGroup(
  anchor: DraftAnchor,
  isSelected: boolean,
  mappedChildCode?: string,
  mappedChildLocationId?: string,
  parentDimensions?: Vector3D | null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `anchor-marker-${anchor.id}`;

  const scenePos = resolveAnchorScenePosition(anchor, parentDimensions);
  group.position.set(scenePos.x, scenePos.y, scenePos.z);
  group.rotation.set(
    degToRad(anchor.localRotationX),
    degToRad(anchor.localRotationY),
    degToRad(anchor.localRotationZ),
  );

  const userData: AnchorMarkerUserData = {
    isAnchorMarker: true,
    anchorId: anchor.id,
    code: anchor.code,
    name: anchor.name,
    anchorType: anchor.anchorType,
    mappedChildLocationId,
    mappedChildCode,
  };
  group.userData = userData;

  const w = mmToMeters(anchor.boundingWidthMm || 150);
  const h = mmToMeters(anchor.boundingHeightMm || 100);
  const d = mmToMeters(anchor.boundingDepthMm || 200);

  // 1. Translucent bounding volume
  const boxGeo = new THREE.BoxGeometry(w, h, d);
  const boxMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0xf59e0b : 0x0284c7,
    transparent: true,
    opacity: isSelected ? 0.32 : 0.14,
    depthWrite: false,
  });
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.userData = userData;
  group.add(boxMesh);

  // 2. Wireframe perimeter
  const edgesGeo = new THREE.EdgesGeometry(boxGeo);
  const lineMat = new THREE.LineBasicMaterial({
    color: isSelected ? 0xfbbf24 : 0x38bdf8,
    linewidth: isSelected ? 2 : 1,
  });
  const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
  wireframe.userData = userData;
  group.add(wireframe);

  // 3. Origin crosshair indicator (pin)
  const sphereGeo = new THREE.SphereGeometry(
    Math.min(0.015, Math.min(w, h, d) * 0.15),
    12,
    12,
  );
  const sphereMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0xf59e0b : 0x0ea5e9,
  });
  const originSphere = new THREE.Mesh(sphereGeo, sphereMat);
  originSphere.userData = userData;
  group.add(originSphere);

  // 4. Label Sprite floating slightly above the bounding volume
  const labelSprite = createAnchorLabelSprite(
    anchor.code,
    isSelected,
    mappedChildCode,
  );
  labelSprite.position.set(0, h / 2 + 0.035, 0);
  labelSprite.userData = userData;
  group.add(labelSprite);

  return group;
}

/**
 * Recursively disposes of all geometries, materials, and textures in a scene tree.
 * Critical for preventing WebGL memory leaks during SPA navigation.
 */
export function disposeThreeHierarchy(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    // If the node or container has an active asset instance release hook, invoke it
    if (typeof child.userData?.releaseAssetInstance === "function") {
      child.userData.releaseAssetInstance();
    }

    if (
      (child as THREE.Mesh).isMesh ||
      (child as THREE.LineSegments).isLineSegments
    ) {
      const mesh = child as THREE.Mesh;

      // Do NOT dispose shared geometries or materials belonging to cached custom assets.
      // Cached templates own their GPU resources and manage their lifecycle separately.
      if (mesh.userData?.isCustomAsset) {
        return;
      }

      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          for (const m of mesh.material) {
            disposeMaterial(m);
          }
        } else {
          disposeMaterial(mesh.material);
        }
      }
    }
  });
}

function disposeMaterial(mat: THREE.Material): void {
  if ("map" in mat && mat.map && (mat.map as THREE.Texture).dispose) {
    (mat.map as THREE.Texture).dispose();
  }
  mat.dispose();
}
