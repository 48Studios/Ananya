"use client";

import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  Maximize2,
  RotateCcw,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Sliders,
  CornerDownRight,
  Box,
  Loader2,
  Anchor as AnchorIcon,
  Move,
  RotateCw,
  Compass,
  ZoomIn,
  ZoomOut,
  X,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailChip } from "@/components/ui/detail-field";
import { cn } from "@/lib/utils";
import type {
  LocationOperationalViewChildDto,
  LocationOperationalViewDto,
} from "@/lib/api/spatial-api";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";
import {
  calculateCameraFit,
  calculateCameraOrientationPreset,
  computeSceneBoundingBox,
  getSemanticVisualState,
  getCompartmentBadgeText,
  resolveContainerFrameDimensions,
  resolveParentGeometryOwnership,
  resolveWarehouseFloorPlan,
  resolveWarehouseShellDimensions,
  radToDeg,
  type SceneChildLayout,
  type SpatialVisualizationMode,
  type Vector3D,
  type CameraOrientationPreset,
} from "@/lib/spatial/spatial-3d-layout";
import {
  createChildCompartmentMesh,
  createParentCarcassMesh,
  groundObjectOnFloor,
  createAnchorMarkerGroup,
  findAnchorMarkerUserData,
  scenePositionToAnchorLocal,
  disposeThreeHierarchy,
  findInteractiveUserData,
  type MeshUserData,
  type AnchorMarkerUserData,
} from "@/lib/spatial/spatial-3d-scene";
import { loadAndNormalizeCustomAsset } from "@/lib/spatial/spatial-3d-asset-loader";
import {
  computeDrawerExtension,
  DRAWER_CLOSE_DURATION_SECONDS,
  DRAWER_OPEN_DURATION_SECONDS,
  advanceDrawerMotion,
  createDrawerMotion,
  drawerOffsetMeters,
  getDrawerMotionPhase,
  isDrawerMotionSettled,
  pruneDrawerMotions,
  resolveDrawerFrontAxis,
  type DrawerMotion,
  type DrawerMotionPhase,
} from "@/lib/spatial/drawer-opening";
import type { DraftAnchor } from "@/lib/spatial/spatial-anchor-authoring";

export interface DrawerProbeState {
  phase: DrawerMotionPhase;
  progress: number;
  offsetMeters: number;
  extensionMeters: number | null;
  basePosition: Vector3D;
  position: Vector3D;
  frontAxis: Vector3D;
  activeDrawerId: string | null;
}

/**
 * Non-visual automation seam for canvas-only 3D content, exposed on the interaction
 * surface element while drawer opening is enabled. Automated browser tests use it to
 * project a compartment's front-plate centre to screen coordinates and to observe
 * the transient, view-only motion state.
 */
export interface SpatialDrawerProbe {
  getActiveDrawerId(): string | null;
  getDrawerLocationIds(): string[];
  getDrawerState(locationId: string): DrawerProbeState | null;
  /** True while the camera is lerping between presets or focus targets. */
  isCameraAnimating(): boolean;
  projectCompartmentCenter(
    locationId: string,
  ): { clientX: number; clientY: number } | null;
}

interface SpatialDrawerProbeHost extends HTMLElement {
  __ananyaDrawerProbe?: SpatialDrawerProbe;
}

/**
 * Stable empty default: an inline `[]` default would create a new array identity on
 * every render, re-running the scene rebuild effect on every hover and selection.
 */
const EMPTY_DRAFT_ANCHORS: DraftAnchor[] = [];

export interface Spatial3DViewportProps {
  parentData: LocationOperationalViewDto["parent"];
  childrenLayout: SceneChildLayout[];
  unmappedChildren: LocationOperationalViewChildDto[];
  stockMap: Map<string, CellStockSummary>;
  selectedLocationId?: string | null;
  highlightedLocationId?: string | null;
  onSelectLocation?: (locationId: string) => void;
  onEnterLocation?: (locationId: string) => void;
  /**
   * Allows clicking the parent carcass to select the top-level container.
   * Defaults to false so existing viewers keep ignoring parent meshes.
   */
  isParentSelectable?: boolean;
  /**
   * Parent-first workflow gate: when false, child compartments render in the
   * disabled palette and are skipped by raycasting, so pointer and hover
   * interactions fall through to the selectable parent carcass.
   * Defaults to true so existing viewers are unchanged.
   */
  isChildInteractionEnabled?: boolean;
  onOpenMapping?: () => void;
  /**
   * Marks an authoring surface (the Inventory Builder preview): the authored
   * layout is the container being edited, so its structure and its authored
   * elevations render instead of the location's warehouse overview. Defaults
   * to false so operational viewers keep the space composition.
   */
  isAuthoringLayout?: boolean;
  visualizationMode?: SpatialVisualizationMode;
  showBadges?: boolean;
  /**
   * Enables click-to-open drawer animation: clicking a compartment slides it out
   * along its front (+Z) axis, clicking it again (or clicking empty space) closes
   * it, and opening another compartment closes the previous one. The motion is
   * purely visual and never mutates layout, mapping, or persistence state.
   *
   * Defaults to false so the read-only spatial viewer is unchanged.
   */
  enableDrawerOpening?: boolean;
  /**
   * Restricts click-to-open to the given location kinds within a parent that
   * contains mixed children (for example drawers inside a cabinet, while the
   * cabinets themselves stay put inside a warehouse). Omit to make every
   * compartment openable, which is what the parametric builder preview does.
   */
  openableKinds?: readonly string[];
  isAuthoringAnchors?: boolean;
  draftAnchors?: DraftAnchor[];
  selectedAnchorId?: string | null;
  authoringGizmoMode?: "translate" | "rotate";
  onSelectAnchor?: (anchorId: string | null) => void;
  onAnchorTransformChange?: (
    anchorId: string,
    updates: Partial<DraftAnchor>,
  ) => void;
  onGizmoModeChange?: (mode: "translate" | "rotate") => void;
  onSwitchTo2D?: () => void;
  className?: string;
}

export function Spatial3DViewport({
  parentData,
  childrenLayout,
  unmappedChildren,
  stockMap,
  selectedLocationId,
  highlightedLocationId,
  onSelectLocation,
  onEnterLocation,
  isParentSelectable = false,
  isChildInteractionEnabled = true,
  onOpenMapping,
  onSwitchTo2D,
  isAuthoringLayout = false,
  visualizationMode = "standard",
  showBadges = true,
  enableDrawerOpening = false,
  openableKinds,
  isAuthoringAnchors = false,
  draftAnchors = EMPTY_DRAFT_ANCHORS,
  selectedAnchorId,
  authoringGizmoMode = "translate",
  onSelectAnchor,
  onAnchorTransformChange,
  onGizmoModeChange,
  className,
}: Spatial3DViewportProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = React.useState<string | null>(null);
  const [isUnmappedDrawerOpen, setIsUnmappedDrawerOpen] = React.useState(false);
  const [activeCameraPreset, setActiveCameraPreset] = React.useState<
    CameraOrientationPreset | "custom"
  >("isometric");
  const [isLegendExpanded, setIsLegendExpanded] = React.useState(false);
  const [hoveredLocation, setHoveredLocation] = React.useState<{
    code: string;
    name: string;
    hasStock: boolean;
    directCount?: number;
    descendantCount?: number;
    directBreakdown?: string | null;
    descendantBreakdown?: string | null;
    occupancyLevel?: string;
    capacity?: number | null;
    capacityUnit?: string | null;
    fillRatio?: number | null;
    x: number;
    y: number;
  } | null>(null);

  // Custom 3D asset state (GLB/GLTF loading & fallback tracking)
  const [customAssetStatus, setCustomAssetStatus] = React.useState<
    "procedural" | "loading" | "loaded" | "error"
  >("procedural");
  const [customAssetError, setCustomAssetError] = React.useState<string | null>(
    null,
  );
  const [customAssetNotice, setCustomAssetNotice] = React.useState<
    string | null
  >(null);
  const customAssetLoadIdRef = React.useRef(0);

  // References to keep animation loop & controls active across renders
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = React.useRef<OrbitControls | null>(null);
  const transformControlsRef = React.useRef<TransformControls | null>(null);
  const animFrameIdRef = React.useRef<number | null>(null);
  const sceneRootRef = React.useRef<THREE.Group | null>(null);

  const onAnchorTransformChangeRef = React.useRef(onAnchorTransformChange);
  onAnchorTransformChangeRef.current = onAnchorTransformChange;
  const draftAnchorsRef = React.useRef(draftAnchors);
  draftAnchorsRef.current = draftAnchors;

  // Camera transition state for smooth focus lerp
  const cameraTransitionRef = React.useRef<{
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    progress: number;
    duration: number; // in seconds
    active: boolean;
  } | null>(null);

  // Track pointer movements to distinguish deliberate clicks from orbit drags
  const pointerDownPosRef = React.useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // --- Drawer opening: transient, view-only interaction state ---
  const [activeDrawerId, setActiveDrawerId] = React.useState<string | null>(
    null,
  );
  const activeDrawerIdRef = React.useRef<string | null>(null);
  const drawerMotionsRef = React.useRef<Map<string, DrawerMotion>>(new Map());
  const drawerGroupsRef = React.useRef<Map<string, THREE.Group>>(new Map());

  // Compute scene bounds. The container frame is the published layout the
  // child coordinates were authored in, falling back to the container's own
  // model, then to kind defaults.
  const parentDimensions = React.useMemo<Vector3D>(() => {
    return resolveContainerFrameDimensions(
      parentData.mapping,
      parentData.model,
      parentData.location.kind,
    );
  }, [parentData.mapping, parentData.model, parentData.location.kind]);

  /**
   * Whether (and how) the viewed location owns visible physical geometry. A
   * warehouse that merely contains mapped locations owns no carcass: its body
   * is the cutaway shell, so its mathematical bounds must never become a
   * cabinet-shaped mesh.
   */
  const parentGeometry = React.useMemo(
    () =>
      resolveParentGeometryOwnership(parentData, {
        authoredLayoutBody: isAuthoringLayout,
      }),
    [parentData, isAuthoringLayout],
  );

  const rendersWarehouseShell = parentGeometry.structure === "warehouse";

  /**
   * Floor placement of a warehouse's contents: the authored arrangement when it
   * already describes floor-standing equipment, otherwise a deterministic floor
   * grid with rows and aisles. Render-time only — the persisted spatial nodes,
   * mappings and layout revisions are never touched.
   */
  const warehouseFloorPlan = React.useMemo(
    () =>
      rendersWarehouseShell ? resolveWarehouseFloorPlan(childrenLayout) : null,
    [rendersWarehouseShell, childrenLayout],
  );

  /** The layout the scene composes: grid-placed contents for a warehouse shell. */
  const composedChildren = warehouseFloorPlan?.children ?? childrenLayout;

  /**
   * Carcass dimensions: a warehouse shell is built around the required floor
   * placement — grid width and depth, aisles and floor margins — so it grows
   * with its contents instead of hugging them like a carcass. Every other
   * parent keeps its authored frame.
   */
  const carcassDimensions = React.useMemo<Vector3D>(
    () =>
      warehouseFloorPlan
        ? resolveWarehouseShellDimensions(parentDimensions, warehouseFloorPlan)
        : parentDimensions,
    [warehouseFloorPlan, parentDimensions],
  );

  const childrenLayoutRef = React.useRef(composedChildren);
  childrenLayoutRef.current = composedChildren;

  /**
   * World-space position each child was composed at, keyed by location id.
   * Warehouse children are grounded on the floor during scene composition, so
   * camera focus targets the composed transform instead of the authored one.
   */
  const composedChildPositionsRef = React.useRef<Map<string, Vector3D>>(
    new Map(),
  );

  // Anchor authoring always converts against the authored frame the anchor
  // coordinates are persisted in, never against the shell that visualizes it.
  const parentDimensionsRef = React.useRef(parentDimensions);
  parentDimensionsRef.current = parentDimensions;

  /**
   * Kind-restricted click-to-open gate. `openableKinds` is optional so the
   * parametric builder keeps every compartment openable; container kinds
   * (cabinets, racks, shelves) are never slidable.
   */
  const openableKindsKey = openableKinds ? [...openableKinds].join("|") : null;
  const openableKindSet = React.useMemo(
    () => (openableKindsKey ? new Set(openableKindsKey.split("|")) : null),
    [openableKindsKey],
  );
  const isCompartmentOpenable = React.useCallback(
    (kind: string) =>
      enableDrawerOpening && (!openableKindSet || openableKindSet.has(kind)),
    [enableDrawerOpening, openableKindSet],
  );
  const sceneBounds = React.useMemo(() => {
    // A warehouse shell is the stage: it is sized to contain every grounded
    // object (floor, walls, roof included), so the shell envelope alone is the
    // camera frame. Every other parent frames its authored container plus the
    // children composed inside it.
    const bounds = computeSceneBoundingBox(
      parentGeometry.structure === "none" ? null : carcassDimensions,
      rendersWarehouseShell ? [] : composedChildren,
    );
    if (!enableDrawerOpening) return bounds;
    // A compartment opens towards the viewer, which would push bottom rows of a
    // fitted scene past the canvas edge. Leave headroom for the deepest possible
    // extension so an opened compartment stays fully framed.
    const frontClearanceMeters = composedChildren.reduce(
      (widest, child) =>
        isCompartmentOpenable(child.kind)
          ? Math.max(widest, computeDrawerExtension(child.dimensions.z))
          : widest,
      0,
    );
    if (frontClearanceMeters <= 0) return bounds;
    return {
      min: bounds.min,
      max: { ...bounds.max, z: bounds.max.z + frontClearanceMeters },
      size: { ...bounds.size, z: bounds.size.z + frontClearanceMeters },
      center: {
        ...bounds.center,
        z: bounds.center.z + frontClearanceMeters / 2,
      },
    };
  }, [
    carcassDimensions,
    parentGeometry.structure,
    rendersWarehouseShell,
    composedChildren,
    enableDrawerOpening,
    isCompartmentOpenable,
  ]);

  const sceneBoundsRef = React.useRef(sceneBounds);
  sceneBoundsRef.current = sceneBounds;

  // Motion & transition references
  const gridHelperRef = React.useRef<THREE.GridHelper | null>(null);
  const lastTapRef = React.useRef<{ time: number; locationId: string } | null>(
    null,
  );
  const isInitialMountRef = React.useRef(true);
  const prevParentIdRef = React.useRef<string>(parentData.location.id);

  const prefersReducedMotion = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Camera orientation preset helper
  const setCameraPreset = React.useCallback(
    (preset: CameraOrientationPreset, smooth = true) => {
      if (!cameraRef.current || !controlsRef.current) return;
      setActiveCameraPreset(preset);
      const fit = calculateCameraOrientationPreset(
        sceneBoundsRef.current,
        preset,
        45,
      );

      if (!smooth || prefersReducedMotion()) {
        cameraRef.current.position.set(
          fit.position.x,
          fit.position.y,
          fit.position.z,
        );
        controlsRef.current.target.set(
          fit.target.x,
          fit.target.y,
          fit.target.z,
        );
        controlsRef.current.update();
        if (cameraTransitionRef.current) {
          cameraTransitionRef.current.active = false;
        }
        return;
      }

      cameraTransitionRef.current = {
        startPos: cameraRef.current.position.clone(),
        endPos: new THREE.Vector3(
          fit.position.x,
          fit.position.y,
          fit.position.z,
        ),
        startTarget: controlsRef.current.target.clone(),
        endTarget: new THREE.Vector3(fit.target.x, fit.target.y, fit.target.z),
        progress: 0,
        duration: 0.4,
        active: true,
      };
    },
    [prefersReducedMotion],
  );

  // Zoom In / Out step helper
  const zoomCamera = React.useCallback(
    (direction: "in" | "out") => {
      if (!cameraRef.current || !controlsRef.current) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      setActiveCameraPreset("custom");

      const factor = direction === "in" ? 0.75 : 1.33;
      const offset = camera.position.clone().sub(controls.target);
      const currentDist = offset.length();
      const minD = controls.minDistance || 0.1;
      const maxD = controls.maxDistance || 25;
      const newDist = Math.max(minD, Math.min(maxD, currentDist * factor));

      offset.normalize().multiplyScalar(newDist);
      const endPos = controls.target.clone().add(offset);

      if (prefersReducedMotion()) {
        camera.position.copy(endPos);
        controls.update();
        if (cameraTransitionRef.current) {
          cameraTransitionRef.current.active = false;
        }
        return;
      }

      cameraTransitionRef.current = {
        startPos: camera.position.clone(),
        endPos,
        startTarget: controls.target.clone(),
        endTarget: controls.target.clone(),
        progress: 0,
        duration: 0.25,
        active: true,
      };
    },
    [prefersReducedMotion],
  );

  // Fit camera helper (delegates to isometric preset)
  const fitCameraToScene = React.useCallback(
    (smooth = true) => {
      setCameraPreset("isometric", smooth);
    },
    [setCameraPreset],
  );

  // Focus on specific location
  const focusOnLocation = React.useCallback(
    (locationId: string) => {
      if (!cameraRef.current || !controlsRef.current) return;
      const targetChild = composedChildren.find(
        (c) => c.locationId === locationId,
      );
      if (!targetChild) return;

      // Prefer the composed transform (grounded for a warehouse overview) so
      // the camera targets where the child actually is on screen.
      const composed = composedChildPositionsRef.current.get(locationId);
      const targetPos = new THREE.Vector3(
        composed?.x ?? targetChild.position.x,
        composed?.y ?? targetChild.position.y,
        composed?.z ?? targetChild.position.z,
      );

      // Camera offset positioned at isometric viewpoint relative to target
      const maxDim = Math.max(
        targetChild.dimensions.x,
        targetChild.dimensions.y,
        targetChild.dimensions.z,
      );
      const dist = Math.max(0.4, maxDim * 3.0);
      const camOffset = new THREE.Vector3(dist * 0.7, dist * 0.6, dist * 0.9);
      const endCamPos = targetPos.clone().add(camOffset);

      if (prefersReducedMotion()) {
        cameraRef.current.position.copy(endCamPos);
        controlsRef.current.target.copy(targetPos);
        controlsRef.current.update();
        if (cameraTransitionRef.current) {
          cameraTransitionRef.current.active = false;
        }
        return;
      }

      cameraTransitionRef.current = {
        startPos: cameraRef.current.position.clone(),
        endPos: endCamPos,
        startTarget: controlsRef.current.target.clone(),
        endTarget: targetPos,
        progress: 0,
        duration: 0.4,
        active: true,
      };
    },
    [composedChildren, prefersReducedMotion],
  );

  // --- Drawer opening helpers (view-only; never persisted) ---

  const applyDrawerMotionOffset = React.useCallback(
    (group: THREE.Group, motion: DrawerMotion) => {
      const base = group.userData.drawerBasePosition as Vector3D | undefined;
      const axis = group.userData.drawerFrontAxis as Vector3D | undefined;
      if (!base || !axis) return;
      const offset = drawerOffsetMeters(motion);
      group.position.set(
        base.x + axis.x * offset,
        base.y + axis.y * offset,
        base.z + axis.z * offset,
      );
    },
    [],
  );

  /** Starts or reverses the motion of a single compartment. */
  const beginDrawerMotion = React.useCallback(
    (locationId: string, target: 0 | 1) => {
      const descriptor = childrenLayoutRef.current.find(
        (child) => child.locationId === locationId,
      );
      if (!descriptor) return;
      const existing = drawerMotionsRef.current.get(locationId);
      const duration = prefersReducedMotion()
        ? 0
        : target === 1
          ? DRAWER_OPEN_DURATION_SECONDS
          : DRAWER_CLOSE_DURATION_SECONDS;
      drawerMotionsRef.current.set(
        locationId,
        createDrawerMotion({
          locationId,
          from: existing?.progress ?? 0,
          to: target,
          duration,
          extensionMeters:
            existing?.extensionMeters ??
            computeDrawerExtension(descriptor.dimensions.z),
        }),
      );
    },
    [prefersReducedMotion],
  );

  /**
   * Closes the single active open drawer. The shared slot selection is left intact
   * so closing is purely visual and the mapping workflow does not drift.
   */
  const closeActiveDrawer = React.useCallback(() => {
    const openId = activeDrawerIdRef.current;
    if (!openId) return;
    beginDrawerMotion(openId, 0);
    activeDrawerIdRef.current = null;
    setActiveDrawerId(null);
  }, [beginDrawerMotion]);

  const openDrawer = React.useCallback(
    (locationId: string) => {
      const previousId = activeDrawerIdRef.current;
      if (previousId && previousId !== locationId) {
        // Selecting another drawer closes the previously opened one.
        beginDrawerMotion(previousId, 0);
      }
      beginDrawerMotion(locationId, 1);
      activeDrawerIdRef.current = locationId;
      setActiveDrawerId(locationId);
    },
    [beginDrawerMotion],
  );

  /** Discards all transient motion state (used when the viewed layout is replaced). */
  const resetDrawerOpeningState = React.useCallback(() => {
    drawerMotionsRef.current.clear();
    activeDrawerIdRef.current = null;
    setActiveDrawerId(null);
  }, []);

  /** Advances all in-flight drawer motions and applies their offsets to the meshes. */
  const advanceDrawerAnimations = React.useCallback(
    (deltaSeconds: number) => {
      const motions = drawerMotionsRef.current;
      if (motions.size === 0) return;
      for (const [locationId, motion] of motions) {
        const advanced = advanceDrawerMotion(motion, deltaSeconds);
        if (advanced !== motion) {
          motions.set(locationId, advanced);
        }
        const group = drawerGroupsRef.current.get(locationId);
        if (group) {
          applyDrawerMotionOffset(group, advanced);
        }
        // Settled close motions are dropped so no orphaned animation state survives.
        if (isDrawerMotionSettled(advanced) && advanced.to === 0) {
          motions.delete(locationId);
        }
      }
    },
    [applyDrawerMotionOffset],
  );

  // The render loop is created once on mount, so it consumes the latest animation
  // helper through a ref (same pattern as the anchor transform callbacks).
  const advanceDrawerAnimationsRef = React.useRef(advanceDrawerAnimations);
  advanceDrawerAnimationsRef.current = advanceDrawerAnimations;

  // Keep the transient open drawer aligned with the shared slot selection: if the
  // selection moves to another compartment, to the container, or is cleared, the
  // open drawer closes and its transient state is discarded.
  React.useEffect(() => {
    if (!enableDrawerOpening) return;
    const openId = activeDrawerIdRef.current;
    if (!openId || selectedLocationId === openId) return;
    beginDrawerMotion(openId, 0);
    activeDrawerIdRef.current = null;
    setActiveDrawerId(null);
  }, [beginDrawerMotion, enableDrawerOpening, selectedLocationId]);

  // Initialize Three.js WebGL Scene
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const drawerGroups = drawerGroupsRef.current;
    const drawerMotions = drawerMotionsRef.current;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
      if (!gl) {
        setWebglError(
          "WebGL is not supported or hardware acceleration is disabled in your browser.",
        );
        return;
      }
    } catch {
      setWebglError("Unable to initialize WebGL context.");
      return;
    }

    const width = container.clientWidth || 800;
    const height = Math.max(450, container.clientHeight || 500);

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#090D16");
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    cameraRef.current = camera;

    // 3. Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (err: unknown) {
      setWebglError(
        err instanceof Error ? err.message : "Failed to create WebGLRenderer",
      );
      return;
    }

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent camera sinking far below ground
    controls.minDistance = 0.1;
    controls.maxDistance = 20;
    controls.addEventListener("start", () => {
      setActiveCameraPreset("custom");
    });
    controlsRef.current = controls;

    // 4b. TransformControls for interactive anchor authoring
    const transformControls = new TransformControls(
      camera,
      renderer.domElement,
    );
    transformControls.size = 0.75;
    transformControls.addEventListener("dragging-changed", (event) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !event.value;
      }
    });
    transformControls.addEventListener("objectChange", () => {
      const attached = transformControls.object;
      if (!attached || !attached.userData?.isAnchorMarker) return;
      const anchorId = attached.userData.anchorId as string;
      const draft = draftAnchorsRef.current?.find((a) => a.id === anchorId);
      if (!draft) return;

      const localCoords = scenePositionToAnchorLocal(
        attached.position,
        parentDimensionsRef.current,
        draft.metadata,
      );
      const rotX = Math.round(radToDeg(attached.rotation.x));
      const rotY = Math.round(radToDeg(attached.rotation.y));
      const rotZ = Math.round(radToDeg(attached.rotation.z));

      onAnchorTransformChangeRef.current?.(anchorId, {
        localPositionX: localCoords.x,
        localPositionY: localCoords.y,
        localPositionZ: localCoords.z,
        localRotationX: rotX,
        localRotationY: rotY,
        localRotationZ: rotZ,
      });
    });
    const tcHelper = transformControls.getHelper();
    tcHelper.visible = false;
    scene.add(tcHelper);
    transformControlsRef.current = transformControls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(2.5, 4.0, 3.0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.6);
    scene.add(hemiLight);

    // 6. Ground reference grid
    const initialBounds = sceneBoundsRef.current;
    const gridDim = Math.max(
      3,
      initialBounds.size.x * 3,
      initialBounds.size.z * 3,
    );
    const gridHelper = new THREE.GridHelper(gridDim, 30, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.001;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Initial camera positioning
    const initialFit = calculateCameraFit(initialBounds, 45);
    camera.position.set(
      initialFit.position.x,
      initialFit.position.y,
      initialFit.position.z,
    );
    controls.target.set(
      initialFit.target.x,
      initialFit.target.y,
      initialFit.target.z,
    );
    controls.update();

    // 7. Render Loop with smooth camera animation
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Advance view-only drawer opening/closing motions (no-op when idle)
      advanceDrawerAnimationsRef.current(delta);

      // Handle smooth camera lerp
      if (cameraTransitionRef.current && cameraTransitionRef.current.active) {
        const trans = cameraTransitionRef.current;
        trans.progress += delta / trans.duration;
        const t = Math.min(1.0, trans.progress);
        // Smooth ease-out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(trans.startPos, trans.endPos, ease);
        controls.target.lerpVectors(trans.startTarget, trans.endTarget, ease);
        controls.update();

        if (t >= 1.0) {
          trans.active = false;
        }
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };
    animFrameIdRef.current = requestAnimationFrame(animate);

    // 8. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = Math.max(450, entry.contentRect.height);
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
        const helper = transformControlsRef.current.getHelper();
        if (sceneRef.current && helper) {
          sceneRef.current.remove(helper);
        }
        transformControlsRef.current.dispose();
        transformControlsRef.current = null;
      }
      controls.dispose();
      if (sceneRootRef.current) {
        disposeThreeHierarchy(sceneRootRef.current);
      }
      if (gridHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(gridHelperRef.current);
        gridHelperRef.current.geometry.dispose();
        gridHelperRef.current = null;
      }
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      drawerGroups.clear();
      drawerMotions.clear();
      activeDrawerIdRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
    };
  }, []); // Mount renderer once and reuse context across hierarchical scene transitions

  // Rebuild 3D Model hierarchy when layout, selection, or highlights update
  React.useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Update ground reference grid if scene bounds change
    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      gridHelperRef.current = null;
    }
    const gridDim = Math.max(3, sceneBounds.size.x * 3, sceneBounds.size.z * 3);
    const newGridHelper = new THREE.GridHelper(gridDim, 30, 0x334155, 0x1e293b);
    newGridHelper.position.y = -0.001;
    scene.add(newGridHelper);
    gridHelperRef.current = newGridHelper;

    // Remove existing scene group
    if (sceneRootRef.current) {
      scene.remove(sceneRootRef.current);
      disposeThreeHierarchy(sceneRootRef.current);
      sceneRootRef.current = null;
    }
    drawerGroupsRef.current.clear();

    const rootGroup = new THREE.Group();
    rootGroup.name = "spatial-scene-root";

    // 1. Build Parent Carcass Container
    const carcassContainer = new THREE.Group();
    carcassContainer.name = "parent-carcass-container";

    // Immediate synchronous procedural fallback
    const fallbackCarcass = createParentCarcassMesh(
      parentData,
      carcassDimensions,
      {
        isSelected: selectedLocationId === parentData.location.id,
        needsAttention: !isChildInteractionEnabled,
        structure: parentGeometry.structure,
        wallThicknessMm: parentGeometry.wallThicknessMm,
        postWidthMm: parentGeometry.postWidthMm,
        beamHeightMm: parentGeometry.beamHeightMm,
      },
    );
    carcassContainer.add(fallbackCarcass);
    rootGroup.add(carcassContainer);

    // 2. Build Mapped Child Meshes
    composedChildPositionsRef.current = new Map();
    for (const child of composedChildren) {
      const summary = stockMap.get(child.locationId);
      const state = getSemanticVisualState(child.locationId, {
        selectedLocationId,
        highlightedLocationId,
        hasStock: child.hasStock,
        isMapped: child.isMapped,
        isActive: child.rawChild.location.isActive,
        isInteractionDisabled: !isChildInteractionEnabled,
        mode: visualizationMode,
        stockSummary: summary,
      });

      const badgeText = showBadges
        ? getCompartmentBadgeText(visualizationMode, state, summary)
        : null;

      const openableChild = isCompartmentOpenable(child.kind);
      const childMesh = createChildCompartmentMesh(child, state, badgeText, {
        openable: openableChild,
        isOpen: openableChild && child.locationId === activeDrawerId,
      });
      rootGroup.add(childMesh);

      // A warehouse overview composes floor-standing equipment: the child is
      // built with its authoritative position, rotation, scale and geometry,
      // then grounded on the warehouse floor from its own world-space bounding
      // box. The persisted transforms are never rewritten, and every other
      // parent composes children exactly as authored.
      if (rendersWarehouseShell) {
        groundObjectOnFloor(childMesh);
        composedChildPositionsRef.current.set(child.locationId, {
          x: childMesh.position.x,
          y: childMesh.position.y,
          z: childMesh.position.z,
        });
      }

      if (openableChild) {
        // Remember the resting transform and opening axis so the animation loop can
        // slide this compartment without re-deriving parametric geometry.
        childMesh.userData.drawerBasePosition = {
          x: childMesh.position.x,
          y: childMesh.position.y,
          z: childMesh.position.z,
        } satisfies Vector3D;
        childMesh.userData.drawerFrontAxis = resolveDrawerFrontAxis(
          child.rotation,
        );
        // Meshes expose their own front-facing probe point; fall back to the
        // compartment's front plane for shapes that do not.
        const probePoint = (childMesh.userData.probePoint ?? {
          x: 0,
          y: 0,
          z: child.dimensions.z / 2,
        }) as Vector3D;
        childMesh.userData.drawerProbePoint = probePoint;
        drawerGroupsRef.current.set(child.locationId, childMesh);

        // Re-apply any in-flight motion so a scene rebuild never snaps a drawer.
        const motion = drawerMotionsRef.current.get(child.locationId);
        if (motion) {
          applyDrawerMotionOffset(childMesh, motion);
        }
      }
    }

    if (enableDrawerOpening) {
      // Compartments removed by a template change or layout reload must not leave
      // orphaned animation state behind.
      const { motions, removedLocationIds } = pruneDrawerMotions(
        drawerMotionsRef.current,
        composedChildren
          .filter((child) => isCompartmentOpenable(child.kind))
          .map((child) => child.locationId),
      );
      // Keep the same Map instance alive for the whole viewport lifetime.
      drawerMotionsRef.current.clear();
      for (const [locationId, motion] of motions) {
        drawerMotionsRef.current.set(locationId, motion);
      }
      if (
        activeDrawerIdRef.current &&
        removedLocationIds.includes(activeDrawerIdRef.current)
      ) {
        activeDrawerIdRef.current = null;
        setActiveDrawerId(null);
      }
    }

    // 3. Build Spatial Anchor Markers if in authoring mode
    let selectedMarkerObject: THREE.Object3D | null = null;
    if (isAuthoringAnchors && draftAnchors && draftAnchors.length > 0) {
      const anchorsGroup = new THREE.Group();
      anchorsGroup.name = "spatial-anchors-group";

      const anchorChildMap = new Map<
        string,
        { code: string; locationId: string }
      >();
      for (const child of composedChildren) {
        if (child.rawChild.anchor) {
          anchorChildMap.set(child.rawChild.anchor.id, {
            code: child.locationCode,
            locationId: child.locationId,
          });
        }
      }

      for (const anchor of draftAnchors) {
        const isSelected = anchor.id === selectedAnchorId;
        const mapped = anchorChildMap.get(anchor.id);
        const marker = createAnchorMarkerGroup(
          anchor,
          isSelected,
          mapped?.code,
          mapped?.locationId,
          parentDimensions,
        );
        anchorsGroup.add(marker);

        if (isSelected) {
          selectedMarkerObject = marker;
        }
      }

      rootGroup.add(anchorsGroup);
    }

    scene.add(rootGroup);
    sceneRootRef.current = rootGroup;

    // Compartment meshes are built and placed in this effect, so their world matrices
    // must be resolved immediately. Otherwise a pointer raycast that arrives before the
    // next render frame tests identity matrices and misses every freshly built mesh.
    rootGroup.updateMatrixWorld(true);

    // Attach / Detach transform controls to selected anchor
    if (transformControlsRef.current) {
      if (isAuthoringAnchors && selectedMarkerObject) {
        transformControlsRef.current.attach(selectedMarkerObject);
        transformControlsRef.current.getHelper().visible = true;
      } else {
        transformControlsRef.current.detach();
        transformControlsRef.current.getHelper().visible = false;
      }
    }

    // 3. Asynchronously load custom 3D asset if configured and format is GLB/GLTF
    const rawAssetUri =
      parentData.model?.assetUri || parentData.model?.assetReference || null;
    const formatUpper = (parentData.model?.format || "").toUpperCase();
    const isCustomModel =
      Boolean(rawAssetUri) && (formatUpper === "GLB" || formatUpper === "GLTF");

    const abortController = new AbortController();

    if (isCustomModel && rawAssetUri) {
      const thisLoadId = ++customAssetLoadIdRef.current;
      setCustomAssetStatus("loading");
      setCustomAssetError(null);
      setCustomAssetNotice(null);

      loadAndNormalizeCustomAsset(rawAssetUri, parentDimensions, {
        locationId: parentData.location.id,
        locationCode: parentData.location.code,
        isParent: true,
        abortSignal: abortController.signal,
      })
        .then((result) => {
          if (
            abortController.signal.aborted ||
            customAssetLoadIdRef.current !== thisLoadId
          ) {
            disposeThreeHierarchy(result.group);
            return;
          }

          // Swap fallback carcass with custom model
          carcassContainer.remove(fallbackCarcass);
          disposeThreeHierarchy(fallbackCarcass);
          carcassContainer.add(result.group);

          setCustomAssetStatus("loaded");
          if (result.isDistorted) {
            setCustomAssetNotice(
              `Model dimensions scaled to match configured ${parentData.model?.widthMm ?? 0}x${parentData.model?.heightMm ?? 0}x${parentData.model?.depthMm ?? 0}mm.`,
            );
          }
        })
        .catch((err: unknown) => {
          if (
            abortController.signal.aborted ||
            customAssetLoadIdRef.current !== thisLoadId
          ) {
            return;
          }
          if (err instanceof Error && err.message === "Asset load aborted")
            return;
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to load custom 3D model";
          setCustomAssetStatus("error");
          setCustomAssetError(msg);
          // Procedural carcass remains safely in place as fallback
        });
    } else {
      setCustomAssetStatus("procedural");
      setCustomAssetError(null);
      setCustomAssetNotice(null);
    }

    return () => {
      abortController.abort();
    };
  }, [
    parentData,
    parentDimensions,
    carcassDimensions,
    parentGeometry,
    isChildInteractionEnabled,
    sceneBounds,
    composedChildren,
    rendersWarehouseShell,
    selectedLocationId,
    highlightedLocationId,
    isAuthoringAnchors,
    draftAnchors,
    selectedAnchorId,
    visualizationMode,
    showBadges,
    stockMap,
    enableDrawerOpening,
    isCompartmentOpenable,
    activeDrawerId,
    applyDrawerMotionOffset,
  ]);

  // Canvas-only 3D content has no DOM representation, so expose a non-visual probe
  // for automated 3D interaction tests while drawer opening is enabled. The probe
  // reads live scene state and never mutates it.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !enableDrawerOpening) return;
    const probeHost = container as SpatialDrawerProbeHost;
    probeHost.__ananyaDrawerProbe = {
      getActiveDrawerId: () => activeDrawerIdRef.current,
      getDrawerLocationIds: () => [...drawerGroupsRef.current.keys()],
      isCameraAnimating: () => Boolean(cameraTransitionRef.current?.active),
      getDrawerState: (locationId) => {
        const group = drawerGroupsRef.current.get(locationId);
        if (!group) return null;
        const motion = drawerMotionsRef.current.get(locationId);
        const basePosition = group.userData.drawerBasePosition as
          Vector3D | undefined;
        const frontAxis = group.userData.drawerFrontAxis as
          Vector3D | undefined;
        if (!basePosition || !frontAxis) return null;
        return {
          phase: motion ? getDrawerMotionPhase(motion) : "closed",
          progress: motion?.progress ?? 0,
          offsetMeters: motion ? drawerOffsetMeters(motion) : 0,
          extensionMeters: motion?.extensionMeters ?? null,
          basePosition: { ...basePosition },
          position: {
            x: group.position.x,
            y: group.position.y,
            z: group.position.z,
          },
          frontAxis: { ...frontAxis },
          activeDrawerId: activeDrawerIdRef.current,
        };
      },
      projectCompartmentCenter: (locationId) => {
        const group = drawerGroupsRef.current.get(locationId);
        const camera = cameraRef.current;
        const host = containerRef.current;
        const probePoint = group?.userData.drawerProbePoint as
          Vector3D | undefined;
        if (!group || !probePoint || !camera || !host) return null;
        group.updateMatrixWorld(true);
        const point = group.localToWorld(
          new THREE.Vector3(probePoint.x, probePoint.y, probePoint.z),
        );
        point.project(camera);
        const rect = host.getBoundingClientRect();
        return {
          clientX: rect.left + ((point.x + 1) / 2) * rect.width,
          clientY: rect.top + ((1 - point.y) / 2) * rect.height,
        };
      },
    };
    return () => {
      delete probeHost.__ananyaDrawerProbe;
    };
  }, [enableDrawerOpening]);

  // Synchronize gizmo mode (translate vs rotate)
  React.useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(authoringGizmoMode || "translate");
    }
  }, [authoringGizmoMode]);

  // React to parent location change (smooth reduced-motion aware scene transition)
  React.useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevParentIdRef.current = parentData.location.id;
      return;
    }

    if (prevParentIdRef.current !== parentData.location.id) {
      prevParentIdRef.current = parentData.location.id;
      // A different container means a different layout: drop any transient open state
      // so nothing survives a reload.
      resetDrawerOpeningState();
      fitCameraToScene(!prefersReducedMotion());
    }
  }, [
    parentData.location.id,
    fitCameraToScene,
    prefersReducedMotion,
    resetDrawerOpeningState,
  ]);

  // React to external selected / highlighted location changes
  React.useEffect(() => {
    const targetId = highlightedLocationId || selectedLocationId;
    if (targetId) {
      focusOnLocation(targetId);
    }
  }, [highlightedLocationId, selectedLocationId, focusOnLocation]);

  // Pointer interaction: Raycasting for click & hover
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
    // Ignore drags / orbits (greater than 5 pixels)
    if (dx > 5 || dy > 5) return;

    const container = containerRef.current;
    if (!container || !cameraRef.current || !sceneRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // If in authoring mode, raycast against anchors first
    if (isAuthoringAnchors) {
      const intersects = raycaster.intersectObjects(
        sceneRef.current.children,
        true,
      );
      for (const hit of intersects) {
        const anchorData = findAnchorMarkerUserData(hit.object);
        if (anchorData) {
          onSelectAnchor?.(anchorData.anchorId);
          return;
        }
      }
      onSelectAnchor?.(null);
      return;
    }

    const intersects = raycaster.intersectObjects(
      sceneRef.current.children,
      true,
    );
    for (const hit of intersects) {
      const userData = findInteractiveUserData(hit.object);
      if (!userData) continue;
      if (userData.isParent && !isParentSelectable) continue;
      // Parent-first gate: gated children are transparent to clicks so the
      // selectable outer container behind them receives the interaction.
      if (!userData.isParent && !isChildInteractionEnabled) continue;

      // Touch double-tap detection (< 350ms on same compartment)
      if (e.pointerType === "touch") {
        const now = performance.now();
        if (
          lastTapRef.current &&
          now - lastTapRef.current.time < 350 &&
          lastTapRef.current.locationId === userData.locationId
        ) {
          lastTapRef.current = null;
          onEnterLocation?.(userData.locationId);
          return;
        }
        lastTapRef.current = { time: now, locationId: userData.locationId };
      }

      // Clicking a compartment toggles its view-only open state; selecting another
      // compartment closes the previously opened drawer.
      if (!userData.isParent && isCompartmentOpenable(userData.kind)) {
        if (activeDrawerIdRef.current === userData.locationId) {
          closeActiveDrawer();
        } else {
          openDrawer(userData.locationId);
        }
      }

      if (onSelectLocation) {
        onSelectLocation(userData.locationId);
      }
      return;
    }

    // Clicking empty space closes the active drawer without touching the current
    // slot selection, mapping state, or camera controls.
    if (enableDrawerOpening) {
      closeActiveDrawer();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isAuthoringAnchors) {
      // In authoring mode, suppress double-click drill-down
      return;
    }

    const container = containerRef.current;
    if (!container || !cameraRef.current || !sceneRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObjects(
      sceneRef.current.children,
      true,
    );
    for (const hit of intersects) {
      const userData = findInteractiveUserData(hit.object);
      if (userData && !userData.isParent) {
        onEnterLocation?.(userData.locationId);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !cameraRef.current || !sceneRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (isAuthoringAnchors) {
      const intersects = raycaster.intersectObjects(
        sceneRef.current.children,
        true,
      );
      let foundAnchor: AnchorMarkerUserData | null = null;
      for (const hit of intersects) {
        const anchorData = findAnchorMarkerUserData(hit.object);
        if (anchorData) {
          foundAnchor = anchorData;
          break;
        }
      }
      if (foundAnchor) {
        container.style.cursor = "pointer";
      } else {
        container.style.cursor = "default";
      }
      setHoveredLocation(null);
      return;
    }

    const intersects = raycaster.intersectObjects(
      sceneRef.current.children,
      true,
    );
    let found: MeshUserData | null = null;

    for (const hit of intersects) {
      const userData = findInteractiveUserData(hit.object);
      if (!userData) continue;
      if (userData.isParent && !isParentSelectable) continue;
      if (!userData.isParent && !isChildInteractionEnabled) continue;
      found = userData;
      break;
    }

    if (found) {
      container.style.cursor = "pointer";
      if (found.isParent) {
        // Containers have no stock summary; hover feedback is cursor-only.
        setHoveredLocation(null);
        return;
      }
      const summary = stockMap.get(found.locationId);
      setHoveredLocation({
        code: found.locationCode,
        name: found.locationName,
        hasStock: found.hasStock,
        directCount: summary?.directComponentCount,
        descendantCount: summary?.descendantComponentCount,
        directBreakdown: summary?.directUnitsBreakdown,
        descendantBreakdown: summary?.descendantUnitsBreakdown,
        occupancyLevel: summary?.occupancyLevel,
        capacity: summary?.capacity,
        capacityUnit: summary?.capacityUnit,
        fillRatio: summary?.fillRatio,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    } else {
      container.style.cursor = "default";
      setHoveredLocation(null);
    }
  };

  const handlePointerLeave = () => {
    setHoveredLocation(null);
  };

  if (webglError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-9 text-destructive mb-2.5" />
        <h3 className="font-semibold text-sm text-foreground">
          3D Scene Unavailable
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          {webglError}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-[520px] rounded-xl overflow-hidden border border-border bg-[#090D16] select-none ${className || ""}`}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        data-testid="spatial-3d-interaction-surface"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />

      {/* Hover Tooltip HUD */}
      {hoveredLocation && (
        <div
          className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg bg-slate-900/95 border border-slate-700/80 text-white shadow-xl text-xs space-y-1 max-w-[260px]"
          style={{
            left: `${hoveredLocation.x + 12}px`,
            top: `${hoveredLocation.y + 12}px`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-bold">{hoveredLocation.code}</span>
            {hoveredLocation.hasStock ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Stocked
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                Empty
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-300 truncate">
            {hoveredLocation.name}
          </div>

          {/* Unit-safe stock breakdown */}
          {hoveredLocation.hasStock && (
            <div className="pt-1 border-t border-slate-800 space-y-0.5 text-[10px]">
              {hoveredLocation.directBreakdown && (
                <div className="flex justify-between text-sky-300">
                  <span>Direct:</span>
                  <span className="font-mono font-semibold">
                    {hoveredLocation.directBreakdown}
                  </span>
                </div>
              )}
              {hoveredLocation.descendantBreakdown && (
                <div className="flex justify-between text-purple-300">
                  <span>Sub-bins:</span>
                  <span className="font-mono font-semibold">
                    {hoveredLocation.descendantBreakdown}
                  </span>
                </div>
              )}
              {hoveredLocation.capacity !== null &&
              hoveredLocation.capacity !== undefined ? (
                <div className="flex justify-between text-slate-400 pt-0.5">
                  <span>Capacity:</span>
                  <span className="font-mono">
                    {hoveredLocation.fillRatio !== null &&
                    hoveredLocation.fillRatio !== undefined
                      ? `${Math.round(hoveredLocation.fillRatio * 100)}% (${hoveredLocation.capacity} ${hoveredLocation.capacityUnit || "units"})`
                      : `${hoveredLocation.capacity} ${hoveredLocation.capacityUnit || "units"}`}
                  </span>
                </div>
              ) : hoveredLocation.hasStock ? (
                <div className="flex justify-between text-slate-400 pt-0.5">
                  <span>Capacity:</span>
                  <span className="font-mono italic text-slate-500">
                    Unspecified
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Top Left: Scene Status Chips */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 backdrop-blur-xs border border-slate-700/70 text-slate-200 text-xs">
          <Layers className="size-3.5 text-blue-400" />
          <span className="font-mono font-semibold">
            {parentData.location.code}
          </span>
          <span className="text-slate-400">·</span>
          <span>{childrenLayout.length} in 3D</span>
        </div>

        {unmappedChildren.length > 0 && (
          <button
            type="button"
            onClick={() => setIsUnmappedDrawerOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 hover:bg-amber-900/80 border border-amber-600/50 text-amber-200 text-xs transition-colors"
            title="Click to view unmapped compartments not placed in the 3D model"
          >
            <AlertTriangle className="size-3 text-amber-400" />
            <span>{unmappedChildren.length} unmapped</span>
            {isUnmappedDrawerOpen ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        )}

        {/* Custom 3D Asset Status Indicator */}
        {customAssetStatus === "loading" && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/70 border border-blue-600/50 text-blue-200 text-xs animate-pulse">
            <Loader2 className="size-3 animate-spin text-blue-400" />
            <span>Loading 3D asset...</span>
          </div>
        )}

        {customAssetStatus === "loaded" && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-emerald-600/40 text-emerald-300 text-xs"
            title={
              customAssetNotice
                ? `Custom 3D Model: ${customAssetNotice}`
                : "Custom 3D GLB/glTF model loaded and normalized."
            }
          >
            <Box className="size-3 text-emerald-400" />
            <span>Custom 3D</span>
            {customAssetNotice && (
              <Info className="size-3 text-slate-400 hover:text-slate-200" />
            )}
          </div>
        )}

        {customAssetStatus === "error" && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-600/50 text-amber-200 text-xs"
            title={
              customAssetError ||
              "Failed to load custom 3D asset. Procedural fallback in use."
            }
          >
            <AlertTriangle className="size-3 text-amber-400" />
            <span>Procedural Fallback</span>
            <span className="text-[10px] text-amber-300/80 font-mono hidden md:inline">
              (Asset Error)
            </span>
          </div>
        )}
        {isAuthoringAnchors && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-medium">
            <AnchorIcon className="size-3.5 text-amber-400" />
            <span>Anchor Authoring Active</span>
          </div>
        )}
      </div>

      {/* Top Right: Viewport Camera Controls & Authoring Gizmo Toggle */}
      <div
        data-testid="spatial-3d-camera-controls"
        className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-slate-900/80 backdrop-blur-xs border border-slate-700/70 p-1 rounded-md"
      >
        {isAuthoringAnchors && (
          <div className="flex items-center gap-0.5 bg-slate-950/60 p-0.5 rounded mr-1 border border-slate-700/60">
            <Button
              type="button"
              variant={
                authoringGizmoMode === "translate" ? "secondary" : "ghost"
              }
              size="xs"
              onClick={() => onGizmoModeChange?.("translate")}
              className="h-6 px-2 text-[11px] text-slate-200 gap-1"
              title="Move transform gizmo"
              aria-label="Move transform gizmo"
            >
              <Move className="size-3" />
              <span>Move</span>
            </Button>
            <Button
              type="button"
              variant={authoringGizmoMode === "rotate" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onGizmoModeChange?.("rotate")}
              className="h-6 px-2 text-[11px] text-slate-200 gap-1"
              title="Rotate transform gizmo"
              aria-label="Rotate transform gizmo"
            >
              <RotateCw className="size-3" />
              <span>Rotate</span>
            </Button>
          </div>
        )}

        {/* Camera Orientation Presets */}
        <div className="flex items-center gap-0.5 bg-slate-950/60 p-0.5 rounded border border-slate-700/60">
          <Button
            type="button"
            variant={activeCameraPreset === "isometric" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setCameraPreset("isometric")}
            className="h-6 px-2 text-[11px] font-mono text-slate-200 hover:text-white"
            title="Isometric 3D View (30° Elevation)"
            aria-label="Isometric camera view"
          >
            Iso
          </Button>
          <Button
            type="button"
            variant={activeCameraPreset === "front" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setCameraPreset("front")}
            className="h-6 px-2 text-[11px] font-mono text-slate-200 hover:text-white"
            title="Front Elevation View (Compartment Faceplates)"
            aria-label="Front elevation camera view"
          >
            Front
          </Button>
          <Button
            type="button"
            variant={activeCameraPreset === "top" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setCameraPreset("top")}
            className="h-6 px-2 text-[11px] font-mono text-slate-200 hover:text-white"
            title="Top Plan View (Layout & Footprint)"
            aria-label="Top plan camera view"
          >
            Top
          </Button>
        </div>

        {/* Zoom In & Zoom Out */}
        <div className="flex items-center gap-0.5 pl-1 border-l border-slate-700/60">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => zoomCamera("in")}
            className="h-6 w-6 p-0 text-slate-200 hover:text-white hover:bg-slate-800"
            title="Zoom In"
            aria-label="Zoom in camera"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => zoomCamera("out")}
            className="h-6 w-6 p-0 text-slate-200 hover:text-white hover:bg-slate-800"
            title="Zoom Out"
            aria-label="Zoom out camera"
          >
            <ZoomOut className="size-3.5" />
          </Button>
        </div>

        {/* Fit View & Reset */}
        <div className="flex items-center gap-0.5 pl-1 border-l border-slate-700/60">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => fitCameraToScene(true)}
            className="h-6 px-2 text-[11px] text-slate-200 hover:text-white hover:bg-slate-800 gap-1"
            title="Fit view to all compartments"
            aria-label="Fit view to all compartments"
          >
            <Maximize2 className="size-3" />
            <span className="hidden sm:inline">Fit</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setCameraPreset("isometric", false)}
            className="h-6 w-6 p-0 text-slate-200 hover:text-white hover:bg-slate-800"
            title="Reset camera to default isometric orientation"
            aria-label="Reset camera orientation"
          >
            <RotateCcw className="size-3" />
          </Button>
        </div>
      </div>

      {/* Bottom Left: Collapsible 3D Legend & Orientation HUD */}
      <div
        data-testid="spatial-3d-legend"
        className="absolute bottom-3 left-3 z-10"
      >
        {!isLegendExpanded ? (
          <button
            type="button"
            onClick={() => setIsLegendExpanded(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900/90 backdrop-blur-xs border border-slate-700/70 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800/90 transition-colors shadow-sm"
            aria-expanded={false}
            aria-label="Open 3D scene legend and orientation details"
          >
            <Info className="size-3.5 text-blue-400" />
            <span className="font-medium">Legend</span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Compass className="size-3 text-sky-400" />
              <span className="capitalize">{activeCameraPreset}</span>
            </span>
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-900/95 backdrop-blur-md border border-slate-700/80 text-xs text-slate-200 shadow-xl max-w-sm sm:max-w-md animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Compass className="size-4 text-sky-400" />
                <span className="font-semibold text-slate-100">
                  3D Visual Legend
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                  {activeCameraPreset} View
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLegendExpanded(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors"
                aria-label="Close 3D scene legend"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1 text-[11px]">
              {isAuthoringAnchors ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#F59E0B]" />
                    <span>Selected Anchor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#0284C7]" />
                    <span>Anchor Marker</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#10B981]" />
                    <span>Live Placement</span>
                  </div>
                </>
              ) : visualizationMode === "provenance" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#0284C7]" />
                    <span>Direct Stock</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#8B5CF6]" />
                    <span>Sub-compartments</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#4F46E5]" />
                    <span>Mixed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#CBD5E1]" />
                    <span>Empty</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#10B981]" />
                    <span>Locate Target</span>
                  </div>
                </>
              ) : visualizationMode === "occupancy" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#059669]" />
                    <span>Low (&lt;50%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#D97706]" />
                    <span>Mod (50–79%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#EA580C]" />
                    <span>High (80–100%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#E11D48]" />
                    <span>Over (&gt;100%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#0D9488]" />
                    <span>Presence (Cap N/A)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#CBD5E1]" />
                    <span>Empty (0%)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#1E90FF]" />
                    <span>Selected</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#10B981]" />
                    <span>Locate Target</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#0284C7]" />
                    <span>Has Stock</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#CBD5E1]" />
                    <span>Empty</span>
                  </div>
                </>
              )}
            </div>

            <p className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 leading-normal">
              3D envelopes represent physical storage volumes. Authoritative
              inventory records are verified upon selection.
            </p>
          </div>
        )}
      </div>

      {/* Unmapped Staging Tray Drawer */}
      {isUnmappedDrawerOpen && unmappedChildren.length > 0 && (
        <div
          data-testid="spatial-staging-tray"
          className="absolute top-12 left-3 z-20 w-84 max-h-80 overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-amber-600/50 rounded-lg p-3 shadow-2xl text-xs"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-400" />
              Staging Tray ({unmappedChildren.length})
            </span>
            <button
              type="button"
              onClick={() => setIsUnmappedDrawerOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-0.5 rounded hover:bg-slate-800"
              aria-label="Close unmapped staging tray"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
            Authoritative sub-locations under{" "}
            <span className="font-mono text-slate-200 font-bold">
              {parentData.location.code}
            </span>{" "}
            lacking 3D anchor coordinates on this model. Visualized here to
            preserve physical integrity:
          </p>

          {onSwitchTo2D && (
            <div className="mb-2.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onSwitchTo2D}
                className="w-full h-7 text-[11px] gap-1.5 bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700"
                title="Switch to 2D Operational Grid to see all compartments"
              >
                <LayoutGrid className="size-3 text-sky-400" />
                <span>View in 2D Operational Grid</span>
              </Button>
            </div>
          )}

          <div
            className="space-y-1.5"
            role="listbox"
            aria-label="Unmapped staging items"
          >
            {unmappedChildren.map((child) => {
              const stock = stockMap.get(child.location.id);
              const isSelected = selectedLocationId === child.location.id;
              const isHighlighted = highlightedLocationId === child.location.id;

              return (
                <div
                  key={child.location.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => {
                    onSelectLocation?.(child.location.id);
                    // The inspector that opens for the selection occupies the
                    // same canvas region; yield the transient picker so it can
                    // never sit on top of the panel the operator needs next.
                    setIsUnmappedDrawerOpen(false);
                  }}
                  onDoubleClick={() => onEnterLocation?.(child.location.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onEnterLocation?.(child.location.id);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between p-2 rounded cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500",
                    isSelected
                      ? "bg-blue-600/30 border border-blue-500/70 text-white"
                      : isHighlighted
                        ? "bg-emerald-950/40 border border-emerald-500/50 text-emerald-200"
                        : "bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200",
                  )}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-mono font-bold uppercase truncate">
                      {child.location.code}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {child.location.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {stock && stock.hasStock ? (
                      <DetailChip className="text-[10px] bg-sky-950 text-sky-300 border-sky-700">
                        {stock.totalQuantity} pcs
                      </DetailChip>
                    ) : (
                      <span className="text-[10px] text-slate-500">Empty</span>
                    )}
                    {onEnterLocation && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEnterLocation(child.location.id);
                        }}
                        className="h-6 px-1.5 text-[10px] font-mono text-slate-300 hover:text-white hover:bg-slate-700"
                        title={`Enter ${child.location.code}`}
                        aria-label={`Enter ${child.location.code}`}
                      >
                        <CornerDownRight className="size-3 mr-0.5" />
                        <span>Enter</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {onOpenMapping && (
            <div className="mt-3 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onOpenMapping}
                className="w-full text-xs gap-1.5 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200"
                title="Configure spatial anchors to place these compartments in 3D"
              >
                <Sliders className="size-3 text-amber-400" />
                <span>Map Spatial Anchors</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
