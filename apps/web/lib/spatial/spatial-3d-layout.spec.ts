import { describe, expect, it } from "vitest";
import {
  calculateCameraFit,
  computeSceneBoundingBox,
  degToRad,
  getSemanticVisualState,
  fitDimensionsToSlot,
  isCornerAuthoredAnchorZ,
  layoutChildrenFor3D,
  metersToMm,
  mmToMeters,
  radToDeg,
  resolveAuthoredContainerDimensions,
  resolveChildPosition,
  resolveChildRotation,
  resolveChildSlotEnvelope,
  resolveObjectDimensions,
  resolveOperationalParentBodyOffset,
  resolveSpatialRepresentation,
  resolveTargetChildLocationId,
  resolveWarehouseFloorPlan,
  resolveWarehouseShellDimensions,
  shouldGroundRootAssembly,
  type SceneChildLayout,
  type Vector3D,
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

  const anchor: SpatialAnchorDto | null =
    anchorPos || anchorRot
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
  describe("Root placement context", () => {
    it("grounds only synthetic Builder roots", () => {
      expect(shouldGroundRootAssembly(true, false)).toBe(true);
      expect(shouldGroundRootAssembly(true, true)).toBe(false);
    });

    it("does not ground persisted Location Details roots", () => {
      expect(shouldGroundRootAssembly(false, false)).toBe(false);
      expect(shouldGroundRootAssembly(false, true)).toBe(false);
    });
  });

  describe("Operational parent/child frame composition", () => {
    it("keeps the real Drawer A01 Bin A01-01 envelope inside the procedural drawer", () => {
      const parentDimensions = {
        x: mmToMeters(171),
        y: mmToMeters(289.33),
        z: mmToMeters(308),
      };
      const child = createMockChild("bin-a01-01", "DEMO-SPATIAL-BIN-A01-01", {
        kind: "bin",
        anchorPos: { x: 42.75, y: 144.67, z: 0 },
        anchorBounds: { w: 68.4, h: 231.46, d: 277.2 },
      });

      const { mapped } = layoutChildrenFor3D(
        [child],
        null,
        new Map(),
        parentDimensions,
      );
      const bin = mapped[0]!;
      const parentOffset = resolveOperationalParentBodyOffset(
        parentDimensions,
        { isAuthoringLayout: false, rendersWarehouseShell: false },
      );

      const drawerMin = {
        x: parentOffset.x - parentDimensions.x / 2,
        y: parentOffset.y - parentDimensions.y / 2,
        z: parentOffset.z - parentDimensions.z / 2,
      };
      const drawerMax = {
        x: parentOffset.x + parentDimensions.x / 2,
        y: parentOffset.y + parentDimensions.y / 2,
        z: parentOffset.z + parentDimensions.z / 2,
      };
      const binMin = {
        x: bin.position.x - bin.dimensions.x / 2,
        y: bin.position.y - bin.dimensions.y / 2,
        z: bin.position.z - bin.dimensions.z / 2,
      };
      const binMax = {
        x: bin.position.x + bin.dimensions.x / 2,
        y: bin.position.y + bin.dimensions.y / 2,
        z: bin.position.z + bin.dimensions.z / 2,
      };

      expect(bin.position).toEqual({
        x: mmToMeters(-42.75),
        y: mmToMeters(144.67),
        z: 0,
      });
      expect(bin.dimensions).toEqual({
        x: mmToMeters(68.4),
        y: mmToMeters(231.46),
        z: mmToMeters(277.2),
      });
      expect(binMin.x).toBeGreaterThanOrEqual(drawerMin.x);
      expect(binMax.x).toBeLessThanOrEqual(drawerMax.x);
      expect(binMin.y).toBeGreaterThanOrEqual(drawerMin.y);
      expect(binMax.y).toBeLessThanOrEqual(drawerMax.y);
      expect(binMin.z).toBeGreaterThanOrEqual(drawerMin.z);
      expect(binMax.z).toBeLessThanOrEqual(drawerMax.z);
    });
  });

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

    it.each([
      ["rack", "rack", 1.2, 2.1, 0.6],
      ["dry_cabinet", "dry-cabinet", 0.8, 1.8, 0.6],
      ["reel_rack", "reel-rack", 1, 1.8, 0.45],
      ["tray", "tray", 0.6, 0.08, 0.3],
      ["tube", "tube", 0.04, 0.04, 0.12],
      ["reel_slot", "reel-slot", 0.09, 0.09, 0.1],
      ["compartment", "tray", 0.1, 0.08, 0.14],
      ["slot", "tray", 0.1, 0.08, 0.14],
    ])(
      "resolves %s to a dedicated physical representation",
      (kind, shape, width, height, depth) => {
        const representation = resolveSpatialRepresentation({
          location: { id: `loc-${kind}`, kind },
        });
        expect(representation.structure).toBe(shape);
        expect(representation.dimensions).toEqual({
          x: width,
          y: height,
          z: depth,
        });
      },
    );
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

  describe("Parent-Frame Normalization of Child Placement", () => {
    // DEMO-SPATIAL-MODEL-DRAWER-DEEP: the drawer body its bins are mapped into.
    const drawerFrame: Vector3D = { x: 0.171, y: 0.28933, z: 0.308 };

    const makeAnchor = (
      overrides: Partial<SpatialAnchorDto> = {},
    ): SpatialAnchorDto => ({
      id: "anchor-1",
      modelId: "model-drawer-deep",
      code: "BIN01",
      name: "Bin Compartment 01",
      anchorType: "BIN",
      localPositionX: 42.75,
      localPositionY: 144.67,
      localPositionZ: 0,
      localRotationX: 0,
      localRotationY: 0,
      localRotationZ: 0,
      boundingWidthMm: 68.4,
      boundingHeightMm: 231.46,
      boundingDepthMm: 277.2,
      metadata: {},
      ...overrides,
    });

    it("keeps an elevation-authored anchor Z on the parent's mid-depth plane", () => {
      // The anchor editor's default authors Z = 0 as the mid-depth elevation
      // plane. Centring it by -depth/2 pushed every anchored child half a
      // container out of its parent's back.
      const position = resolveChildPosition(
        null,
        makeAnchor({ localPositionZ: 0 }),
        drawerFrame,
      );

      expect(position.z).toBeCloseTo(0, 6);
    });

    it("keeps an anchored bin fully inside its drawer in depth", () => {
      const anchor = makeAnchor({ localPositionZ: 0 });
      const position = resolveChildPosition(null, anchor, drawerFrame);
      const dimensions = resolveObjectDimensions(null, anchor, "bin");

      expect(position.z - dimensions.z / 2).toBeGreaterThanOrEqual(
        -drawerFrame.z / 2 - 1e-9,
      );
      expect(position.z + dimensions.z / 2).toBeLessThanOrEqual(
        drawerFrame.z / 2 + 1e-9,
      );
    });

    it("still centres a corner-authored anchor Z into the frame", () => {
      // A positive Z whose slot envelope fits [0, depth] is corner-authored.
      const position = resolveChildPosition(
        null,
        makeAnchor({
          localPositionZ: 200,
          boundingDepthMm: 150,
          boundingWidthMm: 100,
          boundingHeightMm: 100,
        }),
        { x: 0.6, y: 0.9, z: 0.4 },
      );

      expect(position.z).toBeCloseTo(0, 6);
    });

    it("applies an anchored node offset in the anchor's frame", () => {
      const node = createMockChild("c1", "A01").node!;
      node.positionZ = 12;

      const position = resolveChildPosition(
        node,
        makeAnchor({ localPositionZ: 0 }),
        drawerFrame,
      );

      expect(position.z).toBeCloseTo(mmToMeters(12), 6);
    });

    it("keeps builder-published node slots corner-authored", () => {
      // The storage engine emits slot centres relative to the container corner,
      // so a 166 mm Z in a 320 mm cabinet frame is 6 mm in front of centre.
      const node = createMockChild("c1", "A01").node!;
      node.positionX = 97.5;
      node.positionY = 743.33;
      node.positionZ = 166;

      const position = resolveChildPosition(node, null, {
        x: 0.72,
        y: 0.9,
        z: 0.32,
      });

      expect(position.x).toBeCloseTo(mmToMeters(97.5 - 360), 6);
      expect(position.y).toBeCloseTo(mmToMeters(743.33), 6);
      expect(position.z).toBeCloseTo(mmToMeters(166 - 160), 6);
    });

    it("never shifts an explicitly centred anchor", () => {
      const anchor = makeAnchor({
        localPositionZ: 25,
        boundingDepthMm: 100,
        metadata: { origin: "center" },
      });

      const position = resolveChildPosition(null, anchor, drawerFrame);
      expect(position.z).toBeCloseTo(mmToMeters(25), 6);
    });

    it("classifies anchor Z conventions from the slot envelope", () => {
      expect(
        isCornerAuthoredAnchorZ(
          { localPositionZ: 0, boundingDepthMm: 277.2, metadata: {} },
          0.308,
        ),
      ).toBe(false);
      expect(
        isCornerAuthoredAnchorZ(
          { localPositionZ: 200, boundingDepthMm: 150, metadata: {} },
          0.4,
        ),
      ).toBe(true);
      expect(
        isCornerAuthoredAnchorZ(
          {
            localPositionZ: 25,
            boundingDepthMm: 100,
            metadata: { origin: "center" },
          },
          0.4,
        ),
      ).toBe(false);
    });
  });

  describe("Slot Containment for Oversized Objects", () => {
    // DEMO-SPATIAL-LAYOUT-WAREHOUSE bay: the slot a mapped container lives in.
    const warehouseBay = { widthMm: 786.67, heightMm: 1080, depthMm: 900 };

    it("keeps objects that already fit their slot at their exact model dimensions", () => {
      const fitted = fitDimensionsToSlot(
        { x: mmToMeters(720), y: mmToMeters(900), z: mmToMeters(320) },
        { x: 1, y: 1, z: 1 },
        warehouseBay,
      );

      expect(fitted.x).toBeCloseTo(mmToMeters(720), 6);
      expect(fitted.y).toBeCloseTo(mmToMeters(900), 6);
      expect(fitted.z).toBeCloseTo(mmToMeters(320), 6);
    });

    it("shrinks an oversized object uniformly into its slot", () => {
      // A full pallet rack model mapped into a single warehouse bay.
      const fitted = fitDimensionsToSlot(
        { x: mmToMeters(2200), y: mmToMeters(2400), z: mmToMeters(900) },
        { x: 1, y: 1, z: 1 },
        warehouseBay,
      );

      const widthRatio = fitted.x / mmToMeters(2200);
      const heightRatio = fitted.y / mmToMeters(2400);
      const depthRatio = fitted.z / mmToMeters(900);

      expect(widthRatio).toBeCloseTo(heightRatio, 6);
      expect(heightRatio).toBeCloseTo(depthRatio, 6);
      expect(fitted.x).toBeLessThanOrEqual(
        mmToMeters(warehouseBay.widthMm) + 1e-9,
      );
      expect(fitted.y).toBeLessThanOrEqual(
        mmToMeters(warehouseBay.heightMm) + 1e-9,
      );
      expect(fitted.z).toBeLessThanOrEqual(
        mmToMeters(warehouseBay.depthMm) + 1e-9,
      );
    });

    it("accounts for a persisted node scale when fitting", () => {
      const base = {
        x: mmToMeters(400),
        y: mmToMeters(400),
        z: mmToMeters(400),
      };
      const slot = { widthMm: 400, heightMm: 400, depthMm: 400 };

      const fitted = fitDimensionsToSlot(base, { x: 2, y: 2, z: 2 }, slot);

      expect(fitted.x).toBeCloseTo(mmToMeters(200), 6);
      expect(fitted.x * 2).toBeCloseTo(mmToMeters(400), 6);
    });

    it("never grows an object and leaves slot-less placements untouched", () => {
      const tiny = { x: 0.05, y: 0.05, z: 0.05 };
      expect(
        fitDimensionsToSlot(tiny, { x: 1, y: 1, z: 1 }, warehouseBay),
      ).toEqual(tiny);

      const oversized = { x: 5, y: 5, z: 5 };
      expect(
        fitDimensionsToSlot(oversized, { x: 1, y: 1, z: 1 }, null),
      ).toEqual(oversized);
    });

    it("resolves the authored slot envelope from the layout, falling back to the anchor bounds", () => {
      const layoutMapped = createMockChild("c1", "A01", {
        modelDims: { w: 2200, h: 2400, d: 900 },
      });
      layoutMapped.slotDimensionsMm = warehouseBay;
      expect(resolveChildSlotEnvelope(layoutMapped)).toEqual(warehouseBay);

      const anchorMapped = createMockChild("c2", "A02", {
        anchorPos: { x: 0, y: 0, z: 0 },
        anchorBounds: { w: 180, h: 120, d: 300 },
      });
      expect(resolveChildSlotEnvelope(anchorMapped)).toEqual({
        widthMm: 180,
        heightMm: 120,
        depthMm: 300,
      });

      const bare = createMockChild("c3", "A03", { isMapped: true });
      expect(resolveChildSlotEnvelope(bare)).toBeNull();
    });

    it("fits a warehouse rack into its bay without moving it", () => {
      const rack = createMockChild("rack", "DEMO-SPATIAL-RACK", {
        kind: "rack",
        modelDims: { w: 2200, h: 2400, d: 900 },
      });
      rack.node!.positionX = 453.33;
      rack.node!.positionY = 1780;
      rack.node!.positionZ = 450;
      rack.slotDimensionsMm = warehouseBay;

      const { mapped } = layoutChildrenFor3D([rack], null, new Map(), {
        x: 2.6,
        y: 2.4,
        z: 0.9,
      });

      const placed = mapped[0]!;
      expect(placed.position.x).toBeCloseTo(mmToMeters(453.33 - 1300), 6);
      expect(placed.position.y).toBeCloseTo(mmToMeters(1780), 6);
      expect(placed.position.z).toBeCloseTo(0, 6);
      expect(placed.dimensions.x).toBeLessThanOrEqual(
        mmToMeters(786.67) + 1e-9,
      );
      expect(placed.dimensions.y).toBeLessThanOrEqual(mmToMeters(1080) + 1e-9);
      expect(placed.dimensions.z).toBeLessThanOrEqual(mmToMeters(900) + 1e-9);
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
      publishedChild.node!.metadata = { source: "inventory_builder" };

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

      expect(Math.abs(withModelFrame.x - withLayoutFrame.x)).toBeCloseTo(
        mmToMeters(60),
        6,
      );

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
      const posLeft = resolveChildPosition(
        childLeft.node,
        childLeft.anchor,
        cabinetDims,
      );
      // 100 - 300 = -200 mm (-0.2 m)
      expect(posLeft.x).toBeCloseTo(-0.2, 4);
      expect(posLeft.y).toBeCloseTo(0.675, 4);

      // Center column: 300 mm from left edge
      const childCenter = createMockChild("c-center", "A02", {
        anchorPos: { x: 300, y: 675, z: 0 },
      });
      const posCenter = resolveChildPosition(
        childCenter.node,
        childCenter.anchor,
        cabinetDims,
      );
      // 300 - 300 = 0 mm (0.0 m)
      expect(posCenter.x).toBeCloseTo(0.0, 4);

      // Right column: 500 mm from left edge
      const childRight = createMockChild("c-right", "A03", {
        anchorPos: { x: 500, y: 675, z: 0 },
      });
      const posRight = resolveChildPosition(
        childRight.node,
        childRight.anchor,
        cabinetDims,
      );
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

  describe("Warehouse Floor Grid", () => {
    const child = (
      code: string,
      dims: { x: number; y: number; z: number },
      options: {
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
      } = {},
    ): SceneChildLayout => {
      const position = options.position ?? { x: 0, y: dims.y / 2, z: 0 };
      return {
        locationId: `loc-${code}`,
        locationCode: code,
        locationName: code,
        kind: "cabinet",
        isMapped: true,
        hasStock: false,
        totalQuantity: 0,
        position,
        rotation: options.rotation ?? { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        dimensions: dims,
        rawChild: {
          location: {
            id: `loc-${code}`,
            code,
            name: code,
            kind: "cabinet",
            parentId: "warehouse",
            isActive: true,
          },
          node: null,
          model: null,
          anchor: null,
        },
      } as SceneChildLayout;
    };

    /** Elevated bay-plan placements: never a deliberate floor arrangement. */
    const bayPlaced = (code: string, level: number): SceneChildLayout =>
      child(
        code,
        { x: 0.72, y: 0.9, z: 0.32 },
        {
          position: {
            x: (level % 3) * 0.9 - 0.9,
            y: level % 2 === 0 ? 0.62 : 1.78,
            z: 0.45,
          },
        },
      );

    const bounds = (entries: SceneChildLayout[]) =>
      entries.map((entry) => ({
        code: entry.locationCode,
        minX: entry.position.x - entry.dimensions.x / 2,
        maxX: entry.position.x + entry.dimensions.x / 2,
        minZ: entry.position.z - entry.dimensions.z / 2,
        maxZ: entry.position.z + entry.dimensions.z / 2,
      }));

    const overlapCount = (entries: SceneChildLayout[]): number => {
      const boxes = bounds(entries);
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (
            a.minX < b.maxX &&
            b.minX < a.maxX &&
            a.minZ < b.maxZ &&
            b.minZ < a.maxZ
          ) {
            overlaps += 1;
          }
        }
      }
      return overlaps;
    };

    it("keeps a single child as the only occupant of the floor", () => {
      const plan = resolveWarehouseFloorPlan([bayPlaced("A", 1)]);

      // One object needs no arrangement: its authored placement is preserved.
      expect(plan.generated).toBe(false);
      expect(plan.rows).toBe(1);
      expect(plan.columns).toBe(1);
      expect(plan.children).toHaveLength(1);
      expect(overlapCount(plan.children)).toBe(0);
    });

    it("lays three children out in one row", () => {
      const plan = resolveWarehouseFloorPlan([
        bayPlaced("A", 0),
        bayPlaced("B", 1),
        bayPlaced("C", 2),
      ]);

      expect(plan.generated).toBe(true);
      expect(plan.rows).toBe(1);
      expect(plan.columns).toBe(3);
      const zs = new Set(plan.children.map((entry) => entry.position.z));
      expect(zs.size).toBe(1);
      expect(overlapCount(plan.children)).toBe(0);
    });

    it("lays six children out in two rows with an aisle between them", () => {
      const plan = resolveWarehouseFloorPlan(
        Array.from({ length: 6 }, (_, index) =>
          bayPlaced(`ITEM-${index}`, index),
        ),
      );

      expect(plan.generated).toBe(true);
      expect(plan.rows).toBe(2);
      expect(plan.columns).toBe(3);

      const rows = new Map<number, number>();
      for (const entry of plan.children) {
        rows.set(entry.position.z, (rows.get(entry.position.z) ?? 0) + 1);
      }
      expect(rows.size).toBe(2);
      expect([...rows.values()].sort()).toEqual([3, 3]);

      // The row gap is the aisle plus the two half-depths it separates.
      const rowDepths = [...rows.keys()].sort((a, b) => a - b);
      const gap = rowDepths[1]! - rowDepths[0]!;
      expect(gap).toBeGreaterThanOrEqual(0.9);
      expect(overlapCount(plan.children)).toBe(0);
    });

    it("lays ten or more children out in multiple rows and columns", () => {
      const plan = resolveWarehouseFloorPlan(
        Array.from({ length: 12 }, (_, index) =>
          bayPlaced(`ITEM-${String(index).padStart(2, "0")}`, index),
        ),
      );

      expect(plan.generated).toBe(true);
      expect(plan.columns).toBeGreaterThanOrEqual(3);
      expect(plan.rows).toBeGreaterThanOrEqual(3);
      expect(plan.children).toHaveLength(12);
      expect(overlapCount(plan.children)).toBe(0);

      const maxRowWidth = bounds(plan.children).reduce(
        (widest, box) => Math.max(widest, box.maxX - box.minX),
        0,
      );
      expect(plan.width).toBeGreaterThanOrEqual(maxRowWidth - 1e-6);
    });

    it("keeps mixed dimensions apart and inside the planned footprint", () => {
      const plan = resolveWarehouseFloorPlan([
        child(
          "RACK",
          { x: 1.0, y: 0.9, z: 0.5 },
          {
            position: { x: 0, y: 1.78, z: 0.45 },
          },
        ),
        child(
          "CAB",
          { x: 0.6, y: 0.9, z: 0.4 },
          {
            position: { x: 0, y: 0.62, z: 0.45 },
          },
        ),
        child(
          "SHELF",
          { x: 1.2, y: 0.6, z: 0.5 },
          {
            position: { x: 0, y: 0.62, z: 0.45 },
          },
        ),
        child(
          "BINS",
          { x: 0.4, y: 0.47, z: 0.18 },
          {
            position: { x: 0, y: 0.62, z: 0.45 },
          },
        ),
      ]);

      expect(plan.generated).toBe(true);
      expect(overlapCount(plan.children)).toBe(0);

      for (const entry of plan.children) {
        expect(
          entry.position.x - entry.dimensions.x / 2,
        ).toBeGreaterThanOrEqual(-plan.width / 2 - 1e-6);
        expect(entry.position.x + entry.dimensions.x / 2).toBeLessThanOrEqual(
          plan.width / 2 + 1e-6,
        );
        expect(
          entry.position.z - entry.dimensions.z / 2,
        ).toBeGreaterThanOrEqual(-plan.depth / 2 - 1e-6);
        expect(entry.position.z + entry.dimensions.z / 2).toBeLessThanOrEqual(
          plan.depth / 2 + 1e-6,
        );
      }

      const shelf = plan.children.find(
        (entry) => entry.locationCode === "SHELF",
      )!;
      const bins = plan.children.find(
        (entry) => entry.locationCode === "BINS",
      )!;
      expect(
        Math.abs(shelf.position.x - bins.position.x),
      ).toBeGreaterThanOrEqual((1.2 + 0.4) / 2);
    });

    it("produces the same arrangement for the same input", () => {
      const entries = Array.from({ length: 7 }, (_, index) =>
        bayPlaced(`ITEM-${index}`, index),
      );

      const placement = (plan: ReturnType<typeof resolveWarehouseFloorPlan>) =>
        Object.fromEntries(
          plan.children.map((entry) => [
            entry.locationCode,
            { x: entry.position.x, z: entry.position.z },
          ]),
        );

      const first = resolveWarehouseFloorPlan(entries);
      // The same warehouse, whatever order the children arrive in.
      const second = resolveWarehouseFloorPlan([...entries].reverse());

      expect(placement(second)).toEqual(placement(first));
      expect(second.width).toBe(first.width);
      expect(second.depth).toBe(first.depth);
      expect(second.columns).toBe(first.columns);
    });

    it("preserves an authored floor arrangement and its coordinates", () => {
      const authored = [
        child(
          "CAB-A",
          { x: 0.72, y: 0.9, z: 0.32 },
          {
            position: { x: -1.2, y: 0.45, z: -0.4 },
          },
        ),
        child(
          "CAB-B",
          { x: 0.6, y: 0.9, z: 0.4 },
          {
            position: { x: 0.2, y: 0.45, z: -0.4 },
          },
        ),
        child(
          "RACK",
          { x: 0.79, y: 0.86, z: 0.32 },
          {
            position: { x: -1.2, y: 0.43, z: 0.9 },
          },
        ),
      ];

      const plan = resolveWarehouseFloorPlan(authored);

      expect(plan.generated).toBe(false);
      expect(plan.children.map((entry) => entry.position.x)).toEqual(
        authored.map((entry) => entry.position.x),
      );
      expect(plan.children.map((entry) => entry.position.z)).toEqual(
        authored.map((entry) => entry.position.z),
      );
    });

    it("arranges children whose coordinates came from a layout plan", () => {
      // A published bay plan writes slot coordinates; those are a plan
      // placement, not a deliberate warehouse floor arrangement, so the
      // fallback grid takes over even when nothing is elevated.
      const planMapped = bayPlaced("PLAN-A", 0);
      (planMapped.rawChild as { slotDimensionsMm?: unknown }).slotDimensionsMm =
        {
          widthMm: 786.67,
          heightMm: 1080,
          depthMm: 900,
        };
      const handPlaced = child(
        "MANUAL-B",
        { x: 0.6, y: 0.9, z: 0.4 },
        {
          position: { x: 1.4, y: 0.45, z: 0 },
        },
      );

      const plan = resolveWarehouseFloorPlan([planMapped, handPlaced]);

      expect(plan.generated).toBe(true);
      expect(plan.rows).toBe(1);
      expect(plan.columns).toBe(2);
    });

    it("recognizes plan-written nodes as plan placement, not a floor plan", () => {
      const planNode = bayPlaced("PLAN-NODE", 0);
      (planNode.rawChild as { node?: unknown }).node = {
        metadata: { source: "inventory_builder" },
      };
      const handPlaced = child(
        "MANUAL-B",
        { x: 0.6, y: 0.9, z: 0.4 },
        {
          position: { x: 1.4, y: 0.45, z: 0 },
        },
      );

      const plan = resolveWarehouseFloorPlan([planNode, handPlaced]);

      expect(plan.generated).toBe(true);
      expect(plan.columns).toBe(2);
    });

    it("never mutates the layout it arranges", () => {
      const entries = Array.from({ length: 5 }, (_, index) =>
        bayPlaced(`ITEM-${index}`, index),
      );
      const snapshot = JSON.parse(JSON.stringify(entries));

      const plan = resolveWarehouseFloorPlan(entries);

      expect(entries).toEqual(snapshot);
      expect(plan.children).not.toBe(entries);

      if (plan.generated) {
        const moved = plan.children.filter(
          (entry, index) =>
            entry.position.x !== snapshot[index].position.x ||
            entry.position.z !== snapshot[index].position.z,
        );
        expect(moved.length).toBeGreaterThan(0);
        // Elevation and every other authored transform stay untouched.
        for (let index = 0; index < plan.children.length; index += 1) {
          const planned = plan.children[index]!;
          const original = entries.find(
            (entry) => entry.locationId === planned.locationId,
          )!;
          expect(planned.position.y).toBe(original.position.y);
          expect(planned.rotation).toEqual(original.rotation);
          expect(planned.scale).toEqual(original.scale);
          expect(planned.dimensions).toEqual(original.dimensions);
        }
      }
    });

    it("grows the shell with the grid instead of with a single line", () => {
      const three = resolveWarehouseFloorPlan(
        Array.from({ length: 3 }, (_, index) =>
          bayPlaced(`ITEM-${index}`, index),
        ),
      );
      const twelve = resolveWarehouseFloorPlan(
        Array.from({ length: 12 }, (_, index) =>
          bayPlaced(`ITEM-${String(index).padStart(2, "0")}`, index),
        ),
      );

      const shellThree = resolveWarehouseShellDimensions(null, three);
      const shellTwelve = resolveWarehouseShellDimensions(null, twelve);

      expect(shellTwelve.x).toBeGreaterThan(shellThree.x);
      expect(shellTwelve.z).toBeGreaterThan(shellThree.z);
      // Industrial proportions: never an extremely tall warehouse.
      const shellTwelvePlanAspect = shellTwelve.x / shellTwelve.z;
      expect(shellTwelvePlanAspect).toBeGreaterThan(0.5);
      expect(shellTwelvePlanAspect).toBeLessThan(6);
    });
  });

  describe("Warehouse Shell Sizing", () => {
    const child = (
      code: string,
      x: number,
      y: number,
      dims: { x: number; y: number; z: number },
      options: {
        z?: number;
        rotation?: { x: number; y: number; z: number };
      } = {},
    ): SceneChildLayout =>
      ({
        locationId: code,
        locationCode: code,
        locationName: code,
        kind: "cabinet",
        isMapped: true,
        hasStock: false,
        totalQuantity: 0,
        position: { x, y, z: options.z ?? 0 },
        rotation: options.rotation ?? { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        dimensions: dims,
        rawChild: {
          location: {
            id: code,
            code,
            name: code,
            kind: "cabinet",
            parentId: "warehouse",
            isActive: true,
          },
          node: null,
          model: null,
          anchor: null,
        },
      }) as SceneChildLayout;

    it("wraps the floor placement and keeps the authored headroom", () => {
      const plan = resolveWarehouseFloorPlan([
        child("CAB-A", -0.85, 0.62, { x: 0.72, y: 0.9, z: 0.32 }),
      ]);
      const shell = resolveWarehouseShellDimensions(
        { x: 2.6, y: 2.4, z: 0.9 },
        plan,
      );

      expect(shell.x).toBeGreaterThan(plan.width);
      expect(shell.y).toBeGreaterThan(2.4);
      expect(shell.z).toBeGreaterThan(plan.depth);
    });

    it("sizes the roof from the contents' own heights, not their authored elevation", () => {
      const onFloor = child("CAB-A", 0, 0.45, { x: 0.72, y: 0.9, z: 0.32 });
      const authoredHigher = child("CAB-B", 0, 4.2, {
        x: 0.72,
        y: 0.9,
        z: 0.32,
      });

      // Elevation is a layout detail: the same object is the same height once
      // it stands on the warehouse floor.
      expect(
        resolveWarehouseShellDimensions(
          null,
          resolveWarehouseFloorPlan([authoredHigher]),
        ),
      ).toEqual(
        resolveWarehouseShellDimensions(
          null,
          resolveWarehouseFloorPlan([onFloor]),
        ),
      );
    });

    it("uses rotated extents so a rotated object can never poke through a wall", () => {
      const upright = child("CAB", 0, 0.45, { x: 1, y: 0.9, z: 0.4 });
      const rotated = child(
        "CAB",
        0,
        0.45,
        { x: 1, y: 0.9, z: 0.4 },
        {
          rotation: { x: 0, y: Math.PI / 2, z: 0 },
        },
      );

      expect(
        resolveWarehouseShellDimensions(
          null,
          resolveWarehouseFloorPlan([rotated]),
        ).z,
      ).toBeGreaterThan(
        resolveWarehouseShellDimensions(
          null,
          resolveWarehouseFloorPlan([upright]),
        ).z,
      );
    });

    it("keeps a finite minimum stage for an empty warehouse", () => {
      const shell = resolveWarehouseShellDimensions(
        null,
        resolveWarehouseFloorPlan([]),
      );
      expect(shell.x).toBeGreaterThan(0);
      expect(shell.y).toBeGreaterThan(0);
      expect(shell.z).toBeGreaterThan(0);
    });
  });
});
