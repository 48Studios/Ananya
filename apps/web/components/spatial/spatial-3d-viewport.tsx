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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailChip } from "@/components/ui/detail-field";
import type {
  LocationOperationalViewChildDto,
  LocationOperationalViewDto,
} from "@/lib/api/spatial-api";
import type { CellStockSummary } from "@/lib/spatial/spatial-inventory-mapper";
import {
  calculateCameraFit,
  computeSceneBoundingBox,
  getSemanticVisualState,
  getCompartmentBadgeText,
  resolveObjectDimensions,
  radToDeg,
  type SceneChildLayout,
  type SpatialVisualizationMode,
  type Vector3D,
} from "@/lib/spatial/spatial-3d-layout";
import {
  createChildCompartmentMesh,
  createParentCarcassMesh,
  createAnchorMarkerGroup,
  findAnchorMarkerUserData,
  scenePositionToAnchorLocal,
  disposeThreeHierarchy,
  findInteractiveUserData,
  type MeshUserData,
  type AnchorMarkerUserData,
} from "@/lib/spatial/spatial-3d-scene";
import { loadAndNormalizeCustomAsset } from "@/lib/spatial/spatial-3d-asset-loader";
import type { DraftAnchor } from "@/lib/spatial/spatial-anchor-authoring";

export interface Spatial3DViewportProps {
  parentData: LocationOperationalViewDto["parent"];
  childrenLayout: SceneChildLayout[];
  unmappedChildren: LocationOperationalViewChildDto[];
  stockMap: Map<string, CellStockSummary>;
  selectedLocationId?: string | null;
  highlightedLocationId?: string | null;
  onSelectLocation?: (locationId: string) => void;
  onEnterLocation?: (locationId: string) => void;
  onOpenMapping?: () => void;
  visualizationMode?: SpatialVisualizationMode;
  showBadges?: boolean;
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
  onOpenMapping,
  visualizationMode = "standard",
  showBadges = true,
  isAuthoringAnchors = false,
  draftAnchors = [],
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
  const [customAssetError, setCustomAssetError] = React.useState<string | null>(null);
  const [customAssetNotice, setCustomAssetNotice] = React.useState<string | null>(null);
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
  const pointerDownPosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Compute scene bounds
  const parentDimensions = React.useMemo<Vector3D>(() => {
    return resolveObjectDimensions(
      parentData.model,
      null,
      parentData.location.kind,
    );
  }, [parentData.model, parentData.location.kind]);

  const parentDimensionsRef = React.useRef(parentDimensions);
  parentDimensionsRef.current = parentDimensions;

  const sceneBounds = React.useMemo(() => {
    return computeSceneBoundingBox(parentDimensions, childrenLayout);
  }, [parentDimensions, childrenLayout]);

  const sceneBoundsRef = React.useRef(sceneBounds);
  sceneBoundsRef.current = sceneBounds;

  // Motion & transition references
  const gridHelperRef = React.useRef<THREE.GridHelper | null>(null);
  const lastTapRef = React.useRef<{ time: number; locationId: string } | null>(null);
  const isInitialMountRef = React.useRef(true);
  const prevParentIdRef = React.useRef<string>(parentData.location.id);

  const prefersReducedMotion = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Fit camera helper
  const fitCameraToScene = React.useCallback(
    (smooth = true) => {
      if (!cameraRef.current || !controlsRef.current) return;
      const fit = calculateCameraFit(sceneBounds, 45);

      if (!smooth || prefersReducedMotion()) {
        cameraRef.current.position.set(fit.position.x, fit.position.y, fit.position.z);
        controlsRef.current.target.set(fit.target.x, fit.target.y, fit.target.z);
        controlsRef.current.update();
        if (cameraTransitionRef.current) {
          cameraTransitionRef.current.active = false;
        }
        return;
      }

      cameraTransitionRef.current = {
        startPos: cameraRef.current.position.clone(),
        endPos: new THREE.Vector3(fit.position.x, fit.position.y, fit.position.z),
        startTarget: controlsRef.current.target.clone(),
        endTarget: new THREE.Vector3(fit.target.x, fit.target.y, fit.target.z),
        progress: 0,
        duration: 0.45,
        active: true,
      };
    },
    [sceneBounds, prefersReducedMotion],
  );

  // Focus on specific location
  const focusOnLocation = React.useCallback(
    (locationId: string) => {
      if (!cameraRef.current || !controlsRef.current) return;
      const targetChild = childrenLayout.find((c) => c.locationId === locationId);
      if (!targetChild) return;

      const targetPos = new THREE.Vector3(
        targetChild.position.x,
        targetChild.position.y,
        targetChild.position.z,
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
    [childrenLayout, prefersReducedMotion],
  );

  // Initialize Three.js WebGL Scene
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
    controlsRef.current = controls;

    // 4b. TransformControls for interactive anchor authoring
    const transformControls = new TransformControls(camera, renderer.domElement);
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
    const gridDim = Math.max(3, initialBounds.size.x * 3, initialBounds.size.z * 3);
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

    const rootGroup = new THREE.Group();
    rootGroup.name = "spatial-scene-root";

    // 1. Build Parent Carcass Container
    const carcassContainer = new THREE.Group();
    carcassContainer.name = "parent-carcass-container";

    // Immediate synchronous procedural fallback
    const fallbackCarcass = createParentCarcassMesh(parentData, parentDimensions);
    carcassContainer.add(fallbackCarcass);
    rootGroup.add(carcassContainer);

    // 2. Build Mapped Child Meshes
    for (const child of childrenLayout) {
      const summary = stockMap.get(child.locationId);
      const state = getSemanticVisualState(child.locationId, {
        selectedLocationId,
        highlightedLocationId,
        hasStock: child.hasStock,
        isMapped: child.isMapped,
        isActive: child.rawChild.location.isActive,
        mode: visualizationMode,
        stockSummary: summary,
      });

      const badgeText = showBadges
        ? getCompartmentBadgeText(visualizationMode, state, summary)
        : null;

      const childMesh = createChildCompartmentMesh(child, state, badgeText);
      rootGroup.add(childMesh);
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
      for (const child of childrenLayout) {
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
          if (err instanceof Error && err.message === "Asset load aborted") return;
          const msg =
            err instanceof Error ? err.message : "Failed to load custom 3D model";
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
    sceneBounds,
    childrenLayout,
    selectedLocationId,
    highlightedLocationId,
    isAuthoringAnchors,
    draftAnchors,
    selectedAnchorId,
    visualizationMode,
    showBadges,
    stockMap,
  ]);

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
      fitCameraToScene(!prefersReducedMotion());
    }
  }, [parentData.location.id, fitCameraToScene, prefersReducedMotion]);

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

    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
    for (const hit of intersects) {
      const userData = findInteractiveUserData(hit.object);
      if (userData && !userData.isParent) {
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

        if (onSelectLocation) {
          onSelectLocation(userData.locationId);
        }
        return;
      }
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

    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
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

    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
    let found: MeshUserData | null = null;

    for (const hit of intersects) {
      const userData = findInteractiveUserData(hit.object);
      if (userData && !userData.isParent) {
        found = userData;
        break;
      }
    }

    if (found) {
      container.style.cursor = "pointer";
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
                  <span className="font-mono font-semibold">{hoveredLocation.directBreakdown}</span>
                </div>
              )}
              {hoveredLocation.descendantBreakdown && (
                <div className="flex justify-between text-purple-300">
                  <span>Sub-bins:</span>
                  <span className="font-mono font-semibold">{hoveredLocation.descendantBreakdown}</span>
                </div>
              )}
              {hoveredLocation.capacity !== null && hoveredLocation.capacity !== undefined ? (
                <div className="flex justify-between text-slate-400 pt-0.5">
                  <span>Capacity:</span>
                  <span className="font-mono">
                    {hoveredLocation.fillRatio !== null && hoveredLocation.fillRatio !== undefined
                      ? `${Math.round(hoveredLocation.fillRatio * 100)}% (${hoveredLocation.capacity} ${hoveredLocation.capacityUnit || "units"})`
                      : `${hoveredLocation.capacity} ${hoveredLocation.capacityUnit || "units"}`}
                  </span>
                </div>
              ) : hoveredLocation.hasStock ? (
                <div className="flex justify-between text-slate-400 pt-0.5">
                  <span>Capacity:</span>
                  <span className="font-mono italic text-slate-500">Unspecified</span>
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
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-slate-900/80 backdrop-blur-xs border border-slate-700/70 p-1 rounded-md">
        {isAuthoringAnchors && (
          <div className="flex items-center gap-0.5 bg-slate-950/60 p-0.5 rounded mr-1 border border-slate-700/60">
            <Button
              type="button"
              variant={authoringGizmoMode === "translate" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onGizmoModeChange?.("translate")}
              className="h-6 px-2 text-[11px] text-slate-200 gap-1"
              title="Move transform gizmo"
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
            >
              <RotateCw className="size-3" />
              <span>Rotate</span>
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="xs"
          onClick={() => fitCameraToScene(true)}
          className="h-7 px-2 text-xs text-slate-200 hover:text-white hover:bg-slate-800 gap-1"
          title="Fit view to all compartments"
        >
          <Maximize2 className="size-3.5" />
          <span className="hidden sm:inline">Fit View</span>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => fitCameraToScene(false)}
          className="h-7 px-2 text-xs text-slate-200 hover:text-white hover:bg-slate-800"
          title="Reset camera orientation"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      {/* Bottom Left: Semantic Color Legend */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:flex flex-wrap items-center gap-2.5 max-w-[85%] px-3 py-1.5 rounded-md bg-slate-900/90 backdrop-blur-xs border border-slate-700/60 text-[11px] text-slate-300">
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

      {/* Unmapped Staging Tray Drawer */}
      {isUnmappedDrawerOpen && unmappedChildren.length > 0 && (
        <div className="absolute top-12 left-3 z-20 w-80 max-h-72 overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-amber-600/40 rounded-lg p-3 shadow-xl text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Info className="size-3.5" />
              Unmapped Compartments
            </span>
            <button
              type="button"
              onClick={() => setIsUnmappedDrawerOpen(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
            These sub-locations belong under{" "}
            <span className="font-mono text-slate-200 font-bold">
              {parentData.location.code}
            </span>{" "}
            but do not have an anchor assigned on this model. They are not
            invented into 3D space:
          </p>
          <div className="space-y-1.5">
            {unmappedChildren.map((child) => {
              const stock = stockMap.get(child.location.id);
              return (
                <div
                  key={child.location.id}
                  onClick={() => {
                    if (onSelectLocation) {
                      onSelectLocation(child.location.id);
                    }
                  }}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    selectedLocationId === child.location.id
                      ? "bg-blue-600/30 border border-blue-500/50 text-white"
                      : "bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200"
                  }`}
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
