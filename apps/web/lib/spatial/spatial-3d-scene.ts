import * as THREE from "three";
import {
  mmToMeters,
  metersToMm,
  degToRad,
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
  handleMesh.position.set(0, 0, dim.z / 2 + handleDepth / 2);
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
 * Creates child compartment mesh based on kind.
 *
 * `options.openable` swaps closed slab bodies for hollow open-top trays (drawers and
 * parts-tray slots) so the compartment can slide out and reveal an interior.
 * `options.isOpen` prints the transient OPEN indicator on the front plate label.
 */
export function createChildCompartmentMesh(
  child: SceneChildLayout,
  state: SemanticVisualState,
  badgeText?: string | null,
  options: CompartmentMeshOptions = {},
): THREE.Group {
  const userData: MeshUserData = {
    locationId: child.locationId,
    locationCode: child.locationCode,
    locationName: child.locationName,
    kind: child.kind,
    hasStock: child.hasStock,
    isMapped: child.isMapped,
    isParent: false,
  };

  const kindLower = child.kind?.toLowerCase() || "";
  const openable = Boolean(options.openable);
  let group: THREE.Group;

  if (
    kindLower.includes("drawer") ||
    (openable && kindLower.includes("slot"))
  ) {
    group = createDrawerMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else if (kindLower.includes("bin")) {
    group = createBinMesh(
      child.dimensions,
      userData,
      state,
      badgeText,
      options,
    );
  } else if (kindLower.includes("shelf") || kindLower.includes("tier")) {
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

  // Set position, rotation & persisted scale
  group.position.set(child.position.x, child.position.y, child.position.z);
  group.rotation.set(child.rotation.x, child.rotation.y, child.rotation.z);
  group.scale.set(child.scale.x, child.scale.y, child.scale.z);

  return group;
}

/**
 * Creates the outer chassis/carcass for the parent location (cabinet, rack frame, room zone).
 * Carcass is rendered with an open front so child drawers and bins inside remain visible.
 */
export function createParentCarcassMesh(
  parent: LocationOperationalViewParent,
  dimensions: Vector3D,
  options: { isSelected?: boolean; needsAttention?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `parent-carcass-${parent.location.code}`;

  const userData: MeshUserData = {
    locationId: parent.location.id,
    locationCode: parent.location.code,
    locationName: parent.location.name,
    kind: parent.location.kind,
    hasStock: false,
    isMapped: true,
    isParent: true,
  };

  const { x: W, y: H, z: D } = dimensions;
  const wall = Math.min(0.018, Math.min(W, D) * 0.05);

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

  const kindLower = parent.location.kind?.toLowerCase() || "";

  // 1. Procedural Shelf / Pallet Rack: Upright corner posts and perimeter rails (open sides and front/back)
  if (kindLower.includes("shelf") || kindLower.includes("rack")) {
    const postWidth = Math.min(0.035, Math.min(W, D) * 0.08);
    const postGeo = new THREE.BoxGeometry(postWidth, H, postWidth);

    const corners = [
      { x: -W / 2 + postWidth / 2, z: -D / 2 + postWidth / 2 },
      { x: W / 2 - postWidth / 2, z: -D / 2 + postWidth / 2 },
      { x: -W / 2 + postWidth / 2, z: D / 2 - postWidth / 2 },
      { x: W / 2 - postWidth / 2, z: D / 2 - postWidth / 2 },
    ];

    for (const pos of corners) {
      const postMesh = new THREE.Mesh(postGeo, carcassMat);
      postMesh.position.set(pos.x, H / 2, pos.z);
      postMesh.userData = userData;
      postMesh.castShadow = true;
      group.add(postMesh);
    }

    // Top & Bottom cross rails
    const railXGeo = new THREE.BoxGeometry(W, postWidth * 0.7, postWidth * 0.7);
    for (const yPos of [postWidth / 2, H - postWidth / 2]) {
      for (const zPos of [-D / 2 + postWidth / 2, D / 2 - postWidth / 2]) {
        const rail = new THREE.Mesh(railXGeo, carcassMat);
        rail.position.set(0, yPos, zPos);
        rail.userData = userData;
        group.add(rail);
      }
    }

    // Wireframe bounding frame
    const frameGeo = new THREE.BoxGeometry(W, H, D);
    const edges = new THREE.EdgesGeometry(frameGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: SPATIAL_3D_PALETTE.edgeLines,
      linewidth: 1,
    });
    const wireFrame = new THREE.LineSegments(edges, lineMat);
    wireFrame.position.set(0, H / 2, 0);
    group.add(wireFrame);

    return group;
  }

  // 2. Procedural Open-Top Drawer: Bottom plate + 4 walls (open top for nested bin visibility)
  if (kindLower.includes("drawer")) {
    // Bottom panel
    const botGeo = new THREE.BoxGeometry(W, wall, D);
    const botMesh = new THREE.Mesh(botGeo, carcassMat);
    botMesh.position.set(0, wall / 2, 0);
    botMesh.userData = userData;
    botMesh.receiveShadow = true;
    group.add(botMesh);

    // Left wall
    const sideGeo = new THREE.BoxGeometry(wall, H - wall, D);
    const leftMesh = new THREE.Mesh(sideGeo, carcassMat);
    leftMesh.position.set(-W / 2 + wall / 2, H / 2 + wall / 2, 0);
    leftMesh.userData = userData;
    group.add(leftMesh);

    // Right wall
    const rightMesh = new THREE.Mesh(sideGeo, carcassMat);
    rightMesh.position.set(W / 2 - wall / 2, H / 2 + wall / 2, 0);
    rightMesh.userData = userData;
    group.add(rightMesh);

    // Back wall
    const backGeo = new THREE.BoxGeometry(W - 2 * wall, H - wall, wall);
    const backMesh = new THREE.Mesh(backGeo, interiorMat);
    backMesh.position.set(0, H / 2 + wall / 2, -D / 2 + wall / 2);
    backMesh.userData = userData;
    group.add(backMesh);

    // Front face plate with pull handle
    const frontGeo = new THREE.BoxGeometry(W, H, wall);
    const frontMesh = new THREE.Mesh(frontGeo, carcassMat);
    frontMesh.position.set(0, H / 2, D / 2 - wall / 2);
    frontMesh.userData = userData;
    group.add(frontMesh);

    const frameGeo = new THREE.BoxGeometry(W, H, D);
    const edges = new THREE.EdgesGeometry(frameGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: SPATIAL_3D_PALETTE.edgeLines,
      linewidth: 1,
    });
    const wireFrame = new THREE.LineSegments(edges, lineMat);
    wireFrame.position.set(0, H / 2, 0);
    group.add(wireFrame);

    return group;
  }

  // 3. Procedural Cabinet / Default Enclosure: Open front with top, bottom, sides, back
  // Top panel
  const topGeo = new THREE.BoxGeometry(W, wall, D);
  const topMesh = new THREE.Mesh(topGeo, carcassMat);
  topMesh.position.set(0, H - wall / 2, 0);
  topMesh.userData = userData;
  group.add(topMesh);

  // Bottom panel
  const botMesh = new THREE.Mesh(topGeo, carcassMat);
  botMesh.position.set(0, wall / 2, 0);
  botMesh.userData = userData;
  botMesh.receiveShadow = true;
  group.add(botMesh);

  // Left panel
  const sideGeo = new THREE.BoxGeometry(wall, H - 2 * wall, D);
  const leftMesh = new THREE.Mesh(sideGeo, carcassMat);
  leftMesh.position.set(-W / 2 + wall / 2, H / 2, 0);
  leftMesh.userData = userData;
  group.add(leftMesh);

  // Right panel
  const rightMesh = new THREE.Mesh(sideGeo, carcassMat);
  rightMesh.position.set(W / 2 - wall / 2, H / 2, 0);
  rightMesh.userData = userData;
  group.add(rightMesh);

  // Back panel
  const backGeo = new THREE.BoxGeometry(W - 2 * wall, H - 2 * wall, wall);
  const backMesh = new THREE.Mesh(backGeo, interiorMat);
  backMesh.position.set(0, H / 2, -D / 2 + wall / 2);
  backMesh.userData = userData;
  group.add(backMesh);

  // Wireframe bounding frame for crisp modern industrial appearance
  const frameGeo = new THREE.BoxGeometry(W, H, D);
  const edges = new THREE.EdgesGeometry(frameGeo);
  const lineMat = new THREE.LineBasicMaterial({
    color: SPATIAL_3D_PALETTE.edgeLines,
    linewidth: 1,
  });
  const wireFrame = new THREE.LineSegments(edges, lineMat);
  wireFrame.position.set(0, H / 2, 0);
  group.add(wireFrame);

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
    attentionOutline.position.set(0, H / 2, 0);
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
    selectionOutline.position.set(0, H / 2, 0);
    selectionOutline.userData = { ...userData };
    group.add(selectionOutline);
  }

  return group;
}

/**
 * Helper to traverse up the scene tree from an intersected mesh to find the associated locationId.
 */
export function findInteractiveUserData(
  obj: THREE.Object3D | null,
): MeshUserData | null {
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
    metadata?: Record<string, unknown>;
  },
  parentDimensions?: Vector3D | null,
): Vector3D {
  const rawX = anchor.localPositionX;
  const rawY = anchor.localPositionY;
  const rawZ = anchor.localPositionZ;

  let x = mmToMeters(rawX);
  const y = mmToMeters(rawY);
  let z = mmToMeters(rawZ);

  const isExplicitlyCentered =
    anchor.metadata &&
    typeof anchor.metadata === "object" &&
    (anchor.metadata as Record<string, unknown>).origin === "center";

  if (parentDimensions && parentDimensions.x > 0 && !isExplicitlyCentered) {
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
