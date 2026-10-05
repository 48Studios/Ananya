import { describe, expect, it } from "vitest";
import {
  calculateCameraFit,
  computeSceneBoundingBox,
  degToRad,
  getSemanticVisualState,
  layoutChildrenFor3D,
  metersToMm,
  mmToMeters,
  radToDeg,
  resolveAuthoredContainerDimensions,
  resolveChildPosition,
  resolveChildRotation,
  resolveObjectDimensions,
  resolveTargetChildLocationId,
} from "./spatial-3d-layout";
import { convertGeneratedToSceneLayout } from "./inventory-builder-state";
import {
  createDefaultSmdCabinetConfig,
  generateStorageCompartments,
} from "@ananya/inventory";
import type {
  LocationOperationalViewChildDto,
  SpatialAnchorDto,
  SpatialModelDto,
  SpatialNodeDto,
} from "../api/spatial-api";
import type { CellStockSummary } from "./spatial-inventory-mapper";

function createMockChild(
  id: string,
  code: string,
  options: {
    kind?: string;
    isMapped?: boolean;
    nodePos?: { x: number; y: number; z: number };
    nodeRot?: { x: number; y: number; z: number };
    anchorPos?: { x: number; y: number; z: number };
    anchorRot?: { x: number; y: number; z: number };
    anchorBounds?: { w: number; h: number; d: number };
    modelDims?: { w: number; h: number; d: number };
    isActive?: boolean;
  } = {},
): LocationOperationalViewChildDto {
  const {
    kind = "drawer",
    isMapped = true,
    nodePos,
    nodeRot,
    anchorPos,
    anchorRot,
    anchorBounds,
    modelDims,
    isActive = true,
  } = options;

  const anchor: SpatialAnchorDto | null = (anchorPos || anchorRot)
    ? {
        id: `anchor-${id}`,
        modelId: "model-parent",
        code: `ANCHOR-${code}`,
        name: `Anchor ${code}`,
        anchorType: "DRAWER",
        localPositionX: anchorPos?.x ?? 0,
        localPositionY: anchorPos?.y ?? 0,
        localPositionZ: anchorPos?.z ?? 0,
        localRotationX: anchorRot?.x ?? 0,
        localRotationY: anchorRot?.y ?? 0,
        localRotationZ: anchorRot?.z ?? 0,
        boundingWidthMm: anchorBounds?.w ?? null,
        boundingHeightMm: anchorBounds?.h ?? null,
        boundingDepthMm: anchorBounds?.d ?? null,
        metadata: { allowedKind: kind },
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      }
    : null;

  const model: SpatialModelDto | null = modelDims
    ? {
        id: `model-${id}`,
        code: `MODEL-${code}`,
        name: `Model ${code}`,
        format: "procedural",
        assetReference: null,
        widthMm: modelDims.w,
        heightMm: modelDims.h,
        depthMm: modelDims.d,
        isActive: true,
        metadata: {},
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      }
    : null;

  const node: SpatialNodeDto | null = isMapped
    ? {
        id: `node-${id}`,
        locationId: id,
        modelId: model?.id ?? null,
        parentSpatialNodeId: "node-parent",
        anchorId: anchor?.id ?? null,
        positionX: nodePos?.x ?? 0,
        positionY: nodePos?.y ?? 0,
        positionZ: nodePos?.z ?? 0,
        rotationX: nodeRot?.x ?? 0,
        rotationY: nodeRot?.y ?? 0,
        rotationZ: nodeRot?.z ?? 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        isVisible: true,
        metadata: {},
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      }
    : null;

  return {
    location: {
      id,
      code,
      name: `Compartment ${code}`,
      kind,
      parentId: "loc-parent",
      isActive,
    },
    node,
    model,
    anchor,
  };
}

describe("Spatial 3D Layout & Scene Engine", () => {
  describe("Millimeter Dimensions and Unit Conversions", () => {
    it("converts millimeters to meters accurately", () => {
      expect(mmToMeters(0)).toBe(0);
      expect(mmToMeters(1000)).toBe(1.0);
      expect(mmToMeters(600)).toBeCloseTo(0.6, 5);
      expect(mmToMeters(150)).toBeCloseTo(0.15, 5);
      expect(mmToMeters(-500)).toBeCloseTo(-0.5, 5);
    });

    it("converts meters to millimeters accurately", () => {
      expect(metersToMm(0)).toBe(0);
      expect(metersToMm(1.0)).toBe(1000);
      expect(metersToMm(0.27)).toBeCloseTo(270, 5);
    });

    it("converts degrees to radians and back", () => {
      expect(degToRad(0)).toBe(0);
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 5);
      expect(degToRad(180)).toBeCloseTo(Math.PI, 5);
      expect(degToRad(360)).toBeCloseTo(Math.PI * 2, 5);

      expect(radToDeg(0)).toBe(0);
      expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 5);
      expect(radToDeg(Math.PI)).toBeCloseTo(180, 5);
    });
  });

  describe("Dimensions Resolution Priority", () => {
    it("prefers object's own SpatialModel dimensions when available (Priority 1)", () => {
      const model: SpatialModelDto = {
        id: "m1",
        code: "M1",
        name: "M1",
        format: "procedural",
        assetReference: null,
        widthMm: 250,
        heightMm: 80,
        depthMm: 350,
        isActive: true,
        metadata: {},
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      };

      const anchor: SpatialAnchorDto = {
        id: "a1",
        modelId: "mp",
        code: "A1",
        name: "A1",
        anchorType: "DRAWER",
        localPositionX: 0,
        localPositionY: 0,
        localPositionZ: 0,
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 270,
        boundingHeightMm: 90,
        boundingDepthMm: 400,
        metadata: {},
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      };

      const dims = resolveObjectDimensions(model, anchor, "drawer");
      expect(dims.x).toBeCloseTo(0.25, 4);
      expect(dims.y).toBeCloseTo(0.08, 4);
      expect(dims.z).toBeCloseTo(0.35, 4);
    });

    it("falls back to anchor bounding dimensions when model is missing (Priority 2)", () => {
      const anchor: SpatialAnchorDto = {
        id: "a1",
        modelId: "mp",
        code: "A1",
        name: "A1",
        anchorType: "DRAWER",
        localPositionX: 0,
        localPositionY: 0,
        localPositionZ: 0,
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 270,
        boundingHeightMm: 90,
        boundingDepthMm: 400,
        metadata: {},
        createdAt: "2026-09-30T00:00:00Z",
        updatedAt: "2026-09-30T00:00:00Z",
      };

      const dims = resolveObjectDimensions(null, anchor, "drawer");
      expect(dims.x).toBeCloseTo(0.27, 4);
      expect(dims.y).toBeCloseTo(0.09, 4);
      expect(dims.z).toBeCloseTo(0.4, 4);
    });

    it("falls back to semantic kind dimensions when model and anchor are missing (Priority 3)", () => {
      const drawerDims = resolveObjectDimensions(null, null, "drawer");
      expect(drawerDims.x).toBeCloseTo(0.18, 4);
      expect(drawerDims.y).toBeCloseTo(0.07, 4);
      expect(drawerDims.z).toBeCloseTo(0.35, 4);

      const binDims = resolveObjectDimensions(null, null, "bin");
      expect(binDims.x).toBeCloseTo(0.08, 4);
      expect(binDims.y).toBeCloseTo(0.06, 4);
      expect(binDims.z).toBeCloseTo(0.12, 4);

      const shelfDims = resolveObjectDimensions(null, null, "shelf");
      expect(shelfDims.x).toBeCloseTo(0.95, 4);
      expect(shelfDims.y).toBeCloseTo(0.3, 4);
      expect(shelfDims.z).toBeCloseTo(0.35, 4);
    });
  });

  describe("Anchor-Based Child Placement and Transform Offsets", () => {
    it("places child at exact anchor coordinates when node offset is zero", () => {
      const child = createMockChild("c1", "A01", {
        anchorPos: { x: -140, y: 730, z: 0 },
        nodePos: { x: 0, y: 0, z: 0 },
      });

      const pos = resolveChildPosition(child.node, child.anchor);
      expect(pos.x).toBeCloseTo(-0.14, 4);
      expect(pos.y).toBeCloseTo(0.73, 4);
      expect(pos.z).toBeCloseTo(0.0, 4);
    });

    it("combines anchor coordinates and node fine-offset", () => {
      const child = createMockChild("c1", "A01", {
        anchorPos: { x: 100, y: 200, z: 300 },
        nodePos: { x: 10, y: -20, z: 5 },
      });

      const pos = resolveChildPosition(child.node, child.anchor);
      expect(pos.x).toBeCloseTo(0.11, 4); // (100 + 10) mm
      expect(pos.y).toBeCloseTo(0.18, 4); // (200 - 20) mm
      expect(pos.z).toBeCloseTo(0.305, 4); // (300 + 5) mm
    });

    it("combines anchor and node rotations in radians", () => {
      const child = createMockChild("c1", "A01", {
        anchorRot: { x: 0, y: 90, z: 0 },
        nodeRot: { x: 0, y: 45, z: 0 },
      });

      const rot = resolveChildRotation(child.node, child.anchor);
      expect(rot.x).toBe(0);
      expect(rot.y).toBeCloseTo(degToRad(135), 5); // 90 + 45 deg
      expect(rot.z).toBe(0);
    });
  });

  describe("Missing Anchors and Unmapped Children Segregation", () => {
    it("segregates mapped and unmapped children honestly without fabricating 3D coordinates", () => {
      const mappedChild1 = createMockChild("c1", "DRAWER-01", {
        isMapped: true,
        anchorPos: { x: -100, y: 200, z: 0 },
      });
      const mappedChild2 = createMockChild("c2", "DRAWER-02", {
        isMapped: true,
        anchorPos: { x: 100, y: 200, z: 0 },
      });
      const unmappedChild1 = createMockChild("c3", "DRAWER-UNMAPPED", {
        isMapped: false,
        anchorPos: undefined,
      });

      const stockMap = new Map<string, CellStockSummary>();
      stockMap.set("c1", {
        locationId: "c1",
        locationCode: "DRAWER-01",
        locationName: "Drawer 01",
        isMapped: true,
        directProjections: [],
        descendantProjections: [],
        totalQuantity: 50,
        distinctComponentsCount: 1,
        hasStock: true,
        components: [],
        directComponentCount: 0,
        descendantComponentCount: 0,
        directUnitsByMeasure: { pcs: 50 },
        descendantUnitsByMeasure: {},
        totalUnitsByMeasure: { pcs: 50 },
        directUnitsBreakdown: "50 pcs",
        descendantUnitsBreakdown: "0 units",
        provenanceStatus: "direct-only",
        capacity: null,
        capacityUnit: null,
        fillRatio: null,
        occupancyLevel: "unspecified",
      });

      const result = layoutChildrenFor3D(
        [mappedChild1, mappedChild2, unmappedChild1],
        null,
        stockMap,
      );

      expect(result.mapped).toHaveLength(2);
      expect(result.unmapped).toHaveLength(1);

      // Verify mapped items have correct positions
      expect(result.mapped[0]!.locationCode).toBe("DRAWER-01");
      expect(result.mapped[0]!.hasStock).toBe(true);
      expect(result.mapped[0]!.totalQuantity).toBe(50);
      expect(result.mapped[0]!.position.x).toBeCloseTo(-0.1, 4);

      // Verify unmapped item is cleanly preserved in unmapped array
      expect(result.unmapped[0]!.location.code).toBe("DRAWER-UNMAPPED");
    });
  });

  describe("Canonical Mapping Definition and Coordinate Agreement", () => {
    it("treats a child with a spatial node but no anchor or model as mapped", () => {
      // Builder-published mappings carry exact node coordinates and no anchor
      // or model; the API and the 2D views call these mapped, so 3D must too.
      const builderChild = createMockChild("c1", "SLOT-A01", {
        isMapped: true,
        nodePos: { x: 100, y: 50, z: 20 },
      });

      const result = layoutChildrenFor3D([builderChild], null, new Map());

      expect(result.unmapped).toHaveLength(0);
      expect(result.mapped).toHaveLength(1);
      expect(result.mapped[0]!.isMapped).toBe(true);
      // No authored container frame: coordinates are used verbatim in meters.
      expect(result.mapped[0]!.position.x).toBeCloseTo(0.1, 6);
      expect(result.mapped[0]!.position.y).toBeCloseTo(0.05, 6);
      expect(result.mapped[0]!.position.z).toBeCloseTo(0.02, 6);
    });

    it("treats a child with no spatial node as unmapped", () => {
      const unmapped = createMockChild("c2", "SLOT-A02", { isMapped: false });

      const result = layoutChildrenFor3D([unmapped], null, new Map());

      expect(result.mapped).toHaveLength(0);
      expect(result.unmapped).toHaveLength(1);
    });

    it("renders a builder-published node exactly where the builder preview places it", () => {
      const config = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: 720, heightMm: 900, depthMm: 300 },
      };
      const { compartments } = generateStorageCompartments(config);
      const first = compartments[0]!;

      // The builder preview renders the generated compartments in the frame the
      // template was configured with.
      const builderPreview = convertGeneratedToSceneLayout(
        compartments,
        new Map(),
        config.dimensions,
      );
      const previewFirst = builderPreview[0]!;

      // Publishing persists the same corner-origin millimetre coordinates on
      // the child's spatial node.
      const publishedChild = createMockChild(first.slotId, first.code, {
        kind: first.kind,
        isMapped: true,
        nodePos: {
          x: first.position.x,
          y: first.position.y,
          z: first.position.z,
        },
      });

      const authoredFrame = resolveAuthoredContainerDimensions(
        { publishedLayout: { containerDimensionsMm: config.dimensions } },
        null,
      );
      expect(authoredFrame).not.toBeNull();

      const operational = layoutChildrenFor3D(
        [publishedChild],
        null,
        new Map(),
        authoredFrame,
      );

      expect(operational.unmapped).toHaveLength(0);
      expect(operational.mapped).toHaveLength(1);
      const rendered = operational.mapped[0]!.position;
      expect(rendered.x).toBeCloseTo(previewFirst.position.x, 6);
      expect(rendered.y).toBeCloseTo(previewFirst.position.y, 6);
      expect(rendered.z).toBeCloseTo(previewFirst.position.z, 6);
    });

    it("centers a published node with the layout frame, not a differing model frame", () => {
      const config = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: 720, heightMm: 900, depthMm: 300 },
      };
      const { compartments } = generateStorageCompartments(config);
      const first = compartments[0]!;

      const publishedChild = createMockChild(first.slotId, first.code, {
        kind: first.kind,
        isMapped: true,
        nodePos: {
          x: first.position.x,
          y: first.position.y,
          z: first.position.z,
        },
      });

      // A container model narrower than the layout would shift the same node by
      // 60 mm if it were used as the frame.
      const modelFrame = { x: 0.6, y: 0.9, z: 0.4 };
      const layoutFrame = resolveAuthoredContainerDimensions(
        { publishedLayout: { containerDimensionsMm: config.dimensions } },
        null,
      );

      const withLayoutFrame = resolveChildPosition(
        publishedChild.node,
        null,
        layoutFrame,
      );
      const withModelFrame = resolveChildPosition(
        publishedChild.node,
        null,
        modelFrame,
      );

      expect(
        Math.abs(withModelFrame.x - withLayoutFrame.x),
      ).toBeCloseTo(mmToMeters(60), 6);

      const operational = layoutChildrenFor3D(
        [publishedChild],
        null,
        new Map(),
        layoutFrame,
      );
      expect(operational.mapped[0]!.position.x).toBeCloseTo(
        withLayoutFrame.x,
        6,
      );
      expect(operational.mapped[0]!.position.z).toBeCloseTo(
        withLayoutFrame.z,
        6,
      );
    });

    it("preserves a persisted node scale for the renderer", () => {
      const scaled = createMockChild("c1", "SLOT-A01", {
        isMapped: true,
        nodePos: { x: 100, y: 50, z: 20 },
      });
      scaled.node!.scaleX = 0.5;
      scaled.node!.scaleY = 2;
      scaled.node!.scaleZ = 1;

      const result = layoutChildrenFor3D([scaled], null, new Map());

      expect(result.mapped[0]!.scale).toEqual({ x: 0.5, y: 2, z: 1 });
    });

    it("sanitizes a malformed node scale to 1 so geometry never collapses", () => {
      const malformed = createMockChild("c1", "SLOT-A01", { isMapped: true });
      malformed.node!.scaleX = 0;
      malformed.node!.scaleY = Number.NaN;
      malformed.node!.scaleZ = -2;

      const result = layoutChildrenFor3D([malformed], null, new Map());

      expect(result.mapped[0]!.scale).toEqual({ x: 1, y: 1, z: 1 });
    });

    it("falls back to model dimensions when no layout is published", () => {
      const frame = resolveAuthoredContainerDimensions(null, {
        id: "m1",
        code: "MODEL",
        name: "Model",
        format: "procedural",
        assetReference: null,
        widthMm: 600,
        heightMm: 900,
        depthMm: 400,
        isActive: true,
        metadata: {},
      });

      expect(frame).toEqual({ x: 0.6, y: 0.9, z: 0.4 });
    });

  });

  describe("Colliding Placements Are Fanned Out Instead of Stacked", () => {
    it("fans out siblings that share an unauthored origin into a readable row", () => {
      // Mirrors containers whose children were mapped without anchors or node
      // coordinates: every sibling resolves to the same point.
      const a = createMockChild("w1", "CABINET-A", {
        kind: "cabinet",
        modelDims: { w: 600, h: 900, d: 400 },
      });
      const b = createMockChild("w2", "CABINET-B", {
        kind: "cabinet",
        modelDims: { w: 600, h: 900, d: 400 },
      });
      const c = createMockChild("w3", "SHELF-C", {
        kind: "shelf",
        modelDims: { w: 1000, h: 1500, d: 350 },
      });

      const result = layoutChildrenFor3D([a, b, c], null, new Map());

      expect(result.unmapped).toHaveLength(0);
      const xs = result.mapped.map((child) => child.position.x);
      expect(new Set(xs).size).toBe(3);
      expect(result.mapped.every((child) => child.isAutoArranged)).toBe(true);

      // Ordered by location code, centred on the shared point, spaced by the
      // widest sibling plus the fixed gap.
      expect(result.mapped.map((child) => child.locationCode)).toEqual([
        "CABINET-A",
        "CABINET-B",
        "SHELF-C",
      ]);
      const slot = 1.0 + 0.05;
      expect(result.mapped[0]!.position.x).toBeCloseTo(-slot, 6);
      expect(result.mapped[1]!.position.x).toBeCloseTo(0, 6);
      expect(result.mapped[2]!.position.x).toBeCloseTo(slot, 6);
      // Auto-arrangement is horizontal only.
      expect(result.mapped.every((child) => child.position.y === 0)).toBe(true);
    });

    it("never moves siblings that are stacked vertically", () => {
      const lower = createMockChild("s1", "SHELF-LOW", {
        kind: "shelf",
        nodePos: { x: 0, y: 0, z: 0 },
        modelDims: { w: 1000, h: 400, d: 350 },
      });
      const upper = createMockChild("s2", "SHELF-UP", {
        kind: "shelf",
        nodePos: { x: 0, y: 800, z: 0 },
        modelDims: { w: 1000, h: 400, d: 350 },
      });

      const result = layoutChildrenFor3D([lower, upper], null, new Map());

      expect(result.mapped).toHaveLength(2);
      expect(result.mapped.every((child) => child.isAutoArranged)).toBeFalsy();
      const byCode = new Map(
        result.mapped.map((child) => [child.locationCode, child.position]),
      );
      expect(byCode.get("SHELF-LOW")).toEqual({ x: 0, y: 0, z: 0 });
      expect(byCode.get("SHELF-UP")).toEqual({ x: 0, y: 0.8, z: 0 });
    });

    it("leaves distinct authored anchor placements untouched", () => {
      const left = createMockChild("a1", "DRAWER-01", {
        anchorPos: { x: -100, y: 200, z: 0 },
      });
      const right = createMockChild("a2", "DRAWER-02", {
        anchorPos: { x: 100, y: 200, z: 0 },
      });

      const result = layoutChildrenFor3D([left, right], null, new Map());

      expect(result.mapped.map((child) => child.position.x)).toEqual([
        -0.1, 0.1,
      ]);
      expect(result.mapped.every((child) => child.isAutoArranged)).toBeFalsy();
    });
  });

  describe("Deterministic Handling of Incomplete Spatial Data", () => {
    it("handles null anchors and null models without throwing", () => {
      const child = createMockChild("c-null", "UNKNOWN", {
        isMapped: true,
        anchorPos: undefined,
      });

      const pos = resolveChildPosition(child.node, null);
      const rot = resolveChildRotation(child.node, null);
      const dims = resolveObjectDimensions(null, null, "generic");

      expect(pos).toEqual({ x: 0, y: 0, z: 0 });
      expect(rot).toEqual({ x: 0, y: 0, z: 0 });
      expect(dims.x).toBeGreaterThan(0);
      expect(dims.y).toBeGreaterThan(0);
      expect(dims.z).toBeGreaterThan(0);
    });

    it("computes scene bounding box correctly including parent and children", () => {
      const parentDims = { x: 0.6, y: 0.9, z: 0.4 };
      const childrenLayout = [
        {
          locationId: "c1",
          locationCode: "A01",
          locationName: "Drawer A01",
          kind: "drawer",
          isMapped: true,
          hasStock: false,
          totalQuantity: 0,
          position: { x: -0.15, y: 0.7, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          dimensions: { x: 0.27, y: 0.27, z: 0.38 },
          rawChild: {} as unknown as LocationOperationalViewChildDto,
        },
      ];

      const bounds = computeSceneBoundingBox(parentDims, childrenLayout);
      expect(bounds.size.x).toBeGreaterThanOrEqual(0.6);
      expect(bounds.size.y).toBeGreaterThanOrEqual(0.9);
      expect(bounds.size.z).toBeGreaterThanOrEqual(0.4);
      expect(bounds.center).toBeDefined();
    });

    it("calculates camera fit distance and isometric angles accurately", () => {
      const bounds = {
        min: { x: -0.3, y: 0, z: -0.2 },
        max: { x: 0.3, y: 0.9, z: 0.2 },
        center: { x: 0, y: 0.45, z: 0 },
        size: { x: 0.6, y: 0.9, z: 0.4 },
      };

      const fit = calculateCameraFit(bounds, 45);
      expect(fit.distance).toBeGreaterThan(0.9);
      expect(fit.target).toEqual(bounds.center);
      // Camera is elevated and offset
      expect(fit.position.y).toBeGreaterThan(bounds.center.y);
      expect(fit.position.z).toBeGreaterThan(bounds.center.z);
    });
  });

  describe("Locate Target Selection and Semantic Visual States", () => {
    it("resolves locate-target state with highest priority when highlighted", () => {
      const state = getSemanticVisualState("loc-target", {
        selectedLocationId: "loc-other",
        highlightedLocationId: "loc-target",
        hasStock: true,
        isMapped: true,
        isActive: true,
      });
      expect(state).toBe("locate-target");
    });

    it("resolves selected state when selected", () => {
      const state = getSemanticVisualState("loc-selected", {
        selectedLocationId: "loc-selected",
        highlightedLocationId: null,
        hasStock: true,
        isMapped: true,
        isActive: true,
      });
      expect(state).toBe("selected");
    });

    it("resolves has-stock state when mapped and stock exists", () => {
      const state = getSemanticVisualState("loc-stock", {
        selectedLocationId: null,
        highlightedLocationId: null,
        hasStock: true,
        isMapped: true,
        isActive: true,
      });
      expect(state).toBe("has-stock");
    });

    it("resolves empty-mapped state when mapped but has no stock", () => {
      const state = getSemanticVisualState("loc-empty", {
        selectedLocationId: null,
        highlightedLocationId: null,
        hasStock: false,
        isMapped: true,
        isActive: true,
      });
      expect(state).toBe("empty-mapped");
    });

    it("resolves disabled state for inactive locations", () => {
      const state = getSemanticVisualState("loc-disabled", {
        selectedLocationId: "loc-disabled",
        highlightedLocationId: null,
        hasStock: true,
        isMapped: true,
        isActive: false,
      });
      expect(state).toBe("disabled");
    });

    it("resolves unmapped state when isMapped is false", () => {
      const state = getSemanticVisualState("loc-unmapped", {
        selectedLocationId: null,
        highlightedLocationId: null,
        hasStock: false,
        isMapped: false,
        isActive: true,
      });
      expect(state).toBe("unmapped");
    });
  });

  describe("Anchor Origin Interpretation (Corner-based vs Center-based)", () => {
    const cabinetDims = { x: 0.6, y: 0.9, z: 0.4 }; // 600 x 900 x 400 mm

    it("converts corner-based anchor X coordinates [0, W] to centered parent frame [-W/2, +W/2]", () => {
      // Left column: 100 mm from left edge
      const childLeft = createMockChild("c-left", "A01", {
        anchorPos: { x: 100, y: 675, z: 0 },
      });
      const posLeft = resolveChildPosition(childLeft.node, childLeft.anchor, cabinetDims);
      // 100 - 300 = -200 mm (-0.2 m)
      expect(posLeft.x).toBeCloseTo(-0.2, 4);
      expect(posLeft.y).toBeCloseTo(0.675, 4);

      // Center column: 300 mm from left edge
      const childCenter = createMockChild("c-center", "A02", {
        anchorPos: { x: 300, y: 675, z: 0 },
      });
      const posCenter = resolveChildPosition(childCenter.node, childCenter.anchor, cabinetDims);
      // 300 - 300 = 0 mm (0.0 m)
      expect(posCenter.x).toBeCloseTo(0.0, 4);

      // Right column: 500 mm from left edge
      const childRight = createMockChild("c-right", "A03", {
        anchorPos: { x: 500, y: 675, z: 0 },
      });
      const posRight = resolveChildPosition(childRight.node, childRight.anchor, cabinetDims);
      // 500 - 300 = +200 mm (+0.2 m)
      expect(posRight.x).toBeCloseTo(0.2, 4);
    });

    it("preserves centered anchor coordinates when X is already authored as negative", () => {
      const child = createMockChild("c-neg", "A01", {
        anchorPos: { x: -200, y: 675, z: 0 },
      });
      const pos = resolveChildPosition(child.node, child.anchor, cabinetDims);
      // Retains -0.2 m directly without shifting further
      expect(pos.x).toBeCloseTo(-0.2, 4);
    });

    it("respects explicit origin: center metadata", () => {
      const child = createMockChild("c-meta", "A01", {
        anchorPos: { x: 100, y: 675, z: 0 },
      });
      if (child.anchor) {
        child.anchor.metadata = { origin: "center" };
      }
      const pos = resolveChildPosition(child.node, child.anchor, cabinetDims);
      // Retains +0.1 m because metadata declared it centered
      expect(pos.x).toBeCloseTo(0.1, 4);
    });
  });

  describe("Compound Rotations and Nested Transforms", () => {
    it("sums compound anchor and node rotations accurately across all 3 axes", () => {
      const child = createMockChild("c-rot", "ROT-1", {
        anchorRot: { x: 15, y: 90, z: -30 },
        nodeRot: { x: 5, y: -45, z: 10 },
      });

      const rot = resolveChildRotation(child.node, child.anchor);
      expect(rot.x).toBeCloseTo(degToRad(20), 5); // 15 + 5
      expect(rot.y).toBeCloseTo(degToRad(45), 5); // 90 - 45
      expect(rot.z).toBeCloseTo(degToRad(-20), 5); // -30 + 10
    });
  });

  describe("Deep Hierarchy Locate Target Resolution (resolveTargetChildLocationId)", () => {
    const directChildren = [
      createMockChild("drawer-a01", "A01"),
      createMockChild("drawer-a02", "A02"),
      createMockChild("drawer-a03", "A03"),
    ];

    const descendantLocations = [
      { id: "bin-01", parentId: "drawer-a01" },
      { id: "bin-02", parentId: "drawer-a01" },
      { id: "sub-compartment-x", parentId: "bin-01" },
      { id: "bin-03", parentId: "drawer-a02" },
    ];

    it("resolves direct child immediately when focusLocationId matches child", () => {
      const resolved = resolveTargetChildLocationId(
        "drawer-a02",
        undefined,
        directChildren,
        descendantLocations,
      );
      expect(resolved).toBe("drawer-a02");
    });

    it("traces 1-level nested descendant (Bin -> Drawer) to containing direct child", () => {
      const resolved = resolveTargetChildLocationId(
        "bin-01",
        undefined,
        directChildren,
        descendantLocations,
      );
      expect(resolved).toBe("drawer-a01");
    });

    it("traces 2-level deeply nested descendant (SubBin -> Bin -> Drawer) to containing direct child", () => {
      const resolved = resolveTargetChildLocationId(
        "sub-compartment-x",
        undefined,
        directChildren,
        descendantLocations,
      );
      expect(resolved).toBe("drawer-a01");
    });

    it("falls back to component stock map when focusLocationId is undefined", () => {
      const stockMap = new Map<string, CellStockSummary>();
      stockMap.set("drawer-a03", {
        locationId: "drawer-a03",
        locationCode: "A03",
        locationName: "Drawer A03",
        isMapped: true,
        directProjections: [],
        descendantProjections: [],
        totalQuantity: 100,
        distinctComponentsCount: 1,
        hasStock: true,
        components: [
          {
            componentId: "comp-target",
            sku: "SKU-TARGET",
            name: "Target Component",
            quantity: 100,
            unit: "pcs",
            isDirect: true,
          },
        ],
        directComponentCount: 1,
        descendantComponentCount: 0,
        directUnitsByMeasure: { pcs: 100 },
        descendantUnitsByMeasure: {},
        totalUnitsByMeasure: { pcs: 100 },
        directUnitsBreakdown: "100 pcs",
        descendantUnitsBreakdown: "0 units",
        provenanceStatus: "direct-only",
        capacity: null,
        capacityUnit: null,
        fillRatio: null,
        occupancyLevel: "unspecified",
      });

      const resolved = resolveTargetChildLocationId(
        undefined,
        "comp-target",
        directChildren,
        descendantLocations,
        stockMap,
      );
      expect(resolved).toBe("drawer-a03");
    });

    it("handles non-existent target safely without looping", () => {
      const resolved = resolveTargetChildLocationId(
        "non-existent-loc",
        undefined,
        directChildren,
        descendantLocations,
      );
      expect(resolved).toBeNull();
    });
  });
});
