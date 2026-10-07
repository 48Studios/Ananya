import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  resolveChildSpatialRepresentation,
  resolveKindStructureShape,
  resolveSpatialRepresentation,
  type SpatialRepresentation,
} from "./spatial-3d-layout";
import {
  createChildCompartmentMesh,
  createParentCarcassMesh,
  groundObjectOnFloor,
} from "./spatial-3d-scene";
import type {
  LocationOperationalViewChildDto,
  SpatialAnchorDto,
  SpatialModelDto,
} from "../api/spatial-api";
import type { SceneChildLayout } from "./spatial-3d-layout";
import { classifySpatialKind, SPATIAL_LOCATION_CATEGORIES } from "@ananya/inventory";

/**
 * Global fidelity invariant: a location's visual representation is identical
 * wherever it is rendered. These tests resolve the same location the way a
 * direct view does (as the parent) and the way a parent scene does (as a
 * child), and assert the representation never changes.
 */

// Compartment face labels are canvas textures, and the web suite intentionally
// runs without a DOM (browser behaviour is covered by Playwright). The scene
// builders only need the canvas shape three.js stores as a texture image.
type CanvasStub = {
  width: number;
  height: number;
  style: Record<string, unknown>;
  getContext: (contextId: string) => null;
};
const documentStub = {
  createElement: (): CanvasStub => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => null,
  }),
};
(globalThis as unknown as { document?: unknown }).document ??= documentStub;

const CABINET_MODEL: SpatialModelDto = {
  id: "model-cabinet-a",
  code: "DEMO-SPATIAL-MODEL-CABINET-A",
  name: "Cabinet A model",
  format: "PROCEDURAL",
  widthMm: 720,
  heightMm: 900,
  depthMm: 320,
  isActive: true,
  metadata: {},
};

const IMPORTED_MODEL: SpatialModelDto = {
  ...CABINET_MODEL,
  id: "model-imported",
  code: "IMPORTED-RACK",
  format: "GLB",
  assetUri: "https://assets.example.test/imported-rack.glb",
  widthMm: 1200,
  heightMm: 2100,
  depthMm: 600,
};

const ANCHOR: SpatialAnchorDto = {
  id: "anchor-1",
  modelId: "parent-model",
  code: "ANCHOR-A01",
  name: "Anchor A01",
  anchorType: "BIN",
  localPositionX: 100,
  localPositionY: 200,
  localPositionZ: 0,
  localRotationX: 0,
  localRotationY: 0,
  localRotationZ: 0,
  boundingWidthMm: 80,
  boundingHeightMm: 60,
  boundingDepthMm: 120,
  metadata: {},
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
};

const PUBLISHED_LAYOUT = {
  id: "layout-1",
  code: "DEMO-SPATIAL-LAYOUT-CAB-A",
  revision: 2,
  totalCompartments: 12,
  containerDimensionsMm: { widthMm: 720, heightMm: 900, depthMm: 320 },
  templateType: "SMD_DRAWER_CABINET",
  config: {
    templateType: "SMD_DRAWER_CABINET" as const,
    dimensions: { widthMm: 720, heightMm: 900, depthMm: 320 },
    wallThicknessMm: 12,
    dividerThicknessMm: 4,
    rows: 3,
    columns: 4,
  },
};

function makeChild({
  kind = "cabinet",
  model = null,
  anchor = null,
  node = { positionX: 453.33, positionY: 620, positionZ: 450 },
}: {
  kind?: string;
  model?: SpatialModelDto | null;
  anchor?: SpatialAnchorDto | null;
  node?: { positionX: number; positionY: number; positionZ: number } | null;
} = {}): LocationOperationalViewChildDto {
  return {
    location: {
      id: `loc-${kind}`,
      code: `DEMO-${kind.toUpperCase()}`,
      name: `Demo ${kind}`,
      kind,
      parentId: "warehouse",
      isActive: true,
    },
    node: node
      ? {
          id: `node-${kind}`,
          locationId: `loc-${kind}`,
          modelId: model?.id ?? null,
          parentSpatialNodeId: null,
          anchorId: anchor?.id ?? null,
          positionX: node.positionX,
          positionY: node.positionY,
          positionZ: node.positionZ,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          isVisible: true,
          metadata: {},
          createdAt: "2026-10-05T00:00:00Z",
          updatedAt: "2026-10-05T00:00:00Z",
        }
      : null,
    model,
    anchor,
  };
}

/** Resolves a location the way a direct view does (as the viewed parent). */
function resolveAsDirectView(
  child: LocationOperationalViewChildDto,
): SpatialRepresentation {
  return resolveSpatialRepresentation({
    location: child.location,
    model: child.model,
    anchor: child.anchor,
    mapping: child.model ? { publishedLayout: null } : null,
  });
}

/** Resolves the same location the way a parent scene does (as a child). */
function resolveAsChildInScene(
  child: LocationOperationalViewChildDto,
): SpatialRepresentation {
  return resolveChildSpatialRepresentation(child);
}

function toSceneChild(
  child: LocationOperationalViewChildDto,
  overrides: Partial<SceneChildLayout> = {},
): SceneChildLayout {
  const representation = resolveChildSpatialRepresentation(child);
  return {
    locationId: child.location.id,
    locationCode: child.location.code,
    locationName: child.location.name,
    kind: child.location.kind,
    isMapped: true,
    hasStock: false,
    totalQuantity: 0,
    position: { x: 0, y: representation.dimensions.y / 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    dimensions: representation.dimensions,
    rawChild: child,
    ...overrides,
  };
}

function countMeshes(group: THREE.Object3D): number {
  let meshes = 0;
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes += 1;
  });
  return meshes;
}

describe("Canonical spatial representation", () => {
  it("resolves explicit models as the `model` tier in every context", () => {
    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });

    const direct = resolveAsDirectView(child);
    const nested = resolveAsChildInScene(child);

    expect(direct.source).toBe("model");
    expect(nested.source).toBe("model");
    expect(direct.modelInstance).toEqual(nested.modelInstance);
    expect(direct.model?.code).toBe(CABINET_MODEL.code);
    expect(direct.structure).toBe("enclosure");
  });

  it("keeps a custom Drawer instance dimension-identical in Builder, Location Details, and published views", () => {
    const drawerModel: SpatialModelDto = {
      ...CABINET_MODEL,
      id: "drawer-model-instance-1",
      code: "CUSTOM-DRAWER-01",
      name: "Custom Drawer",
      widthMm: 321,
      heightMm: 87,
      depthMm: 407,
    };
    const child = makeChild({ kind: "drawer", model: drawerModel });
    const publishedMapping = {
      status: "MAPPED" as const,
      isMappingEligible: true,
      hasSpatialNode: true,
      directChildCount: 2,
      mappedDirectChildCount: 2,
      unmappedDirectChildCount: 0,
      containerStatus: "PUBLISHED" as const,
      publishedLayout: PUBLISHED_LAYOUT,
      slotMapping: null,
    };
    child.mapping = publishedMapping;

    const builder = resolveChildSpatialRepresentation(child);
    const locationDetails = resolveSpatialRepresentation({
      location: child.location,
      model: drawerModel,
    });
    const published = resolveSpatialRepresentation({
      location: child.location,
      model: drawerModel,
      mapping: { publishedLayout: PUBLISHED_LAYOUT },
    });

    expect(builder.modelInstance).toEqual({
      locationId: "loc-drawer",
      category: "drawer",
      modelId: "drawer-model",
      dimensions: { widthMm: 321, heightMm: 87, depthMm: 407 },
    });
    expect(locationDetails.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);
    expect(builder.dimensions.x).toBeCloseTo(0.321, 6);
    expect(builder.dimensions.y).toBeCloseTo(0.087, 6);
    expect(builder.dimensions.z).toBeCloseTo(0.407, 6);
    expect(locationDetails.dimensions).toEqual(builder.dimensions);
    expect(published.dimensions).toEqual(builder.dimensions);

    const builderMesh = createChildCompartmentMesh(
      toSceneChild(child, { dimensions: builder.dimensions }),
      "empty-mapped",
    );
    const detailsMesh = createParentCarcassMesh(
      {
        location: child.location,
        node: child.node,
        model: drawerModel,
        mapping: publishedMapping,
        anchors: [],
      },
      locationDetails.dimensions,
      { structure: locationDetails.structure },
    );
    const builderBounds = new THREE.Box3().setFromObject(builderMesh);
    const detailsBounds = new THREE.Box3().setFromObject(detailsMesh);
    const builderSize = builderBounds.getSize(new THREE.Vector3());
    const detailsSize = detailsBounds.getSize(new THREE.Vector3());
    expect(builderSize.x).toBeCloseTo(detailsSize.x, 6);
    expect(builderSize.y).toBeCloseTo(detailsSize.y, 6);
    expect(builderSize.z).toBeCloseTo(detailsSize.z, 6);
  });

  it("keeps a custom Shelf instance dimension-identical across Builder, Location Details, and published views", () => {
    const shelfModel: SpatialModelDto = {
      ...CABINET_MODEL,
      id: "shelf-model-instance-1",
      code: "CUSTOM-SHELF-01",
      name: "Custom Shelf",
      widthMm: 1100,
      heightMm: 40,
      depthMm: 550,
    };
    const child = makeChild({ kind: "shelf", model: shelfModel });
    const shelfPublishedMapping = {
      status: "MAPPED" as const,
      isMappingEligible: true,
      hasSpatialNode: true,
      directChildCount: 0,
      mappedDirectChildCount: 0,
      unmappedDirectChildCount: 0,
      containerStatus: "PUBLISHED" as const,
      publishedLayout: PUBLISHED_LAYOUT,
      slotMapping: null,
    };
    child.mapping = shelfPublishedMapping;
    const builder = resolveChildSpatialRepresentation(child);
    const details = resolveSpatialRepresentation({
      location: child.location,
      model: shelfModel,
    });
    const published = resolveSpatialRepresentation({
      location: child.location,
      model: shelfModel,
      mapping: { publishedLayout: PUBLISHED_LAYOUT },
    });

    expect(builder.structure).toBe("shelf");
    expect(details.structure).toBe(builder.structure);
    expect(published.structure).toBe(builder.structure);
    expect(builder.modelInstance).toEqual({
      locationId: "loc-shelf",
      category: "shelf",
      modelId: "shelf-model",
      dimensions: { widthMm: 1100, heightMm: 40, depthMm: 550 },
    });
    expect(details.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);

    const builderMesh = createChildCompartmentMesh(
      toSceneChild(child, { dimensions: builder.dimensions }),
      "empty-mapped",
    );
    const detailsMesh = createParentCarcassMesh(
      {
        location: child.location,
        node: child.node,
        model: shelfModel,
        mapping: shelfPublishedMapping,
        anchors: [],
      },
      details.dimensions,
      { structure: details.structure },
    );
    const builderBody = builderMesh.getObjectByName("structure-shelf-DEMO-SHELF");
    const detailsBody = detailsMesh.getObjectByName("structure-shelf-DEMO-SHELF");
    expect(builderBody).toBeDefined();
    expect(detailsBody).toBeDefined();
    // Labels are scene affordances with context-specific presentation; compare
    // the shared physical model body itself.
    const builderLabel = builderBody!.getObjectByName("structure-shelf-label");
    const detailsLabel = detailsBody!.getObjectByName("structure-shelf-label");
    if (builderLabel) builderBody!.remove(builderLabel);
    if (detailsLabel) detailsBody!.remove(detailsLabel);
    const builderBounds = new THREE.Box3().setFromObject(builderBody!);
    const detailsBounds = new THREE.Box3().setFromObject(detailsBody!);
    const builderSize = builderBounds.getSize(new THREE.Vector3());
    const detailsSize = detailsBounds.getSize(new THREE.Vector3());
    expect(builderSize.x).toBeCloseTo(detailsSize.x, 6);
    expect(builderSize.y).toBeCloseTo(detailsSize.y, 6);
    expect(builderSize.z).toBeCloseTo(detailsSize.z, 6);
  });

  it("keeps a custom Rack instance and authored support levels consistent across contexts", () => {
    const rackModel: SpatialModelDto = {
      ...CABINET_MODEL,
      id: "rack-model-instance-1",
      code: "CUSTOM-RACK-01",
      name: "Custom Rack",
      widthMm: 1200,
      heightMm: 2200,
      depthMm: 600,
    };
    const rackLayout = {
      ...PUBLISHED_LAYOUT,
      templateType: "PALLET_RACK",
      containerDimensionsMm: { widthMm: 1200, heightMm: 2200, depthMm: 600 },
      config: {
        templateType: "PALLET_RACK" as const,
        dimensions: { widthMm: 1200, heightMm: 2200, depthMm: 600 },
        wallThicknessMm: 50,
        uprightPostWidthMm: 50,
        beamHeightMm: 40,
        levels: 3,
        baysPerLevel: 2,
      },
    };
    const mapping = {
      status: "MAPPED" as const,
      isMappingEligible: true,
      hasSpatialNode: true,
      directChildCount: 1,
      mappedDirectChildCount: 1,
      unmappedDirectChildCount: 0,
      containerStatus: "PUBLISHED" as const,
      publishedLayout: rackLayout,
      slotMapping: null,
    };
    const child = makeChild({ kind: "rack", model: rackModel });
    child.mapping = mapping;
    const builder = resolveChildSpatialRepresentation(child);
    const details = resolveSpatialRepresentation({
      location: child.location,
      model: rackModel,
      mapping,
    });
    const published = resolveSpatialRepresentation({
      location: child.location,
      model: rackModel,
      mapping,
    });

    expect(builder.modelInstance?.category).toBe("rack");
    expect(builder.dimensions).toEqual({ x: 1.2, y: 2.2, z: 0.6 });
    expect(details.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);
    expect(details.dimensions).toEqual(builder.dimensions);
    expect(published.dimensions).toEqual(builder.dimensions);
    expect(details.shelfLevels).toBe(3);

    const builderMesh = createChildCompartmentMesh(
      toSceneChild(child, { dimensions: builder.dimensions }),
      "empty-mapped",
    );
    const detailsMesh = createParentCarcassMesh(
      {
        location: child.location,
        node: child.node,
        model: rackModel,
        mapping,
        anchors: [],
      },
      details.dimensions,
      {
        structure: details.structure,
        postWidthMm: details.postWidthMm,
        beamHeightMm: details.beamHeightMm,
        shelfLevels: details.shelfLevels,
      },
    );
    const builderBody = builderMesh.getObjectByName("structure-rack-DEMO-RACK");
    const detailsBody = detailsMesh.getObjectByName("structure-rack-DEMO-RACK");
    expect(builderBody).toBeDefined();
    expect(detailsBody).toBeDefined();
    const builderLabel = builderBody!.getObjectByName("structure-rack-label");
    if (builderLabel) builderBody!.remove(builderLabel);
    const builderSize = new THREE.Box3()
      .setFromObject(builderBody!)
      .getSize(new THREE.Vector3());
    const detailsSize = new THREE.Box3()
      .setFromObject(detailsBody!)
      .getSize(new THREE.Vector3());
    expect(builderSize.x).toBeCloseTo(detailsSize.x, 6);
    expect(builderSize.y).toBeCloseTo(detailsSize.y, 6);
    expect(builderSize.z).toBeCloseTo(detailsSize.z, 6);
  });

  it("uses identical custom Reel Rack and Reel Slot instances in Builder, Details, and published contexts", () => {
    for (const [kind, dims, structure] of [
      ["reel_rack", [1250, 2050, 520], "reel-rack"],
      ["reel_slot", [160, 180, 140], "reel-slot"],
    ] as const) {
      const model: SpatialModelDto = {
        ...CABINET_MODEL,
        id: `${kind}-instance`,
        code: kind.toUpperCase(),
        name: kind,
        widthMm: dims[0],
        heightMm: dims[1],
        depthMm: dims[2],
      };
      const layout = {
        ...PUBLISHED_LAYOUT,
        templateType: "REEL_RACK",
        containerDimensionsMm: { widthMm: 1250, heightMm: 2050, depthMm: 520 },
        config: {
          templateType: "REEL_RACK" as const,
          dimensions: { widthMm: 1250, heightMm: 2050, depthMm: 520 },
          wallThicknessMm: 20,
          rows: 3,
          columns: 4,
          slotSpacingMm: 12,
        },
      };
      const child = makeChild({ kind, model });
      child.location.id = `${kind}-loc`;
      child.mapping = {
        status: "MAPPED",
        isMappingEligible: true,
        hasSpatialNode: true,
        directChildCount: 1,
        mappedDirectChildCount: 1,
        unmappedDirectChildCount: 0,
        containerStatus: "PUBLISHED",
        publishedLayout: layout,
        slotMapping: null,
      };
      const builder = resolveChildSpatialRepresentation(child);
      const details = resolveSpatialRepresentation({ location: child.location, model });
      const published = resolveSpatialRepresentation({ location: child.location, model, mapping: child.mapping });
      expect(builder.structure).toBe(structure);
      expect(details.modelInstance).toEqual(builder.modelInstance);
      expect(published.modelInstance).toEqual(builder.modelInstance);
      expect(details.dimensions).toEqual(builder.dimensions);
      expect(published.dimensions).toEqual(builder.dimensions);
      const builderMesh = createChildCompartmentMesh(toSceneChild(child, { dimensions: builder.dimensions }), "empty-mapped");
      const detailsMesh = createParentCarcassMesh({
        location: child.location,
        model,
        node: child.node,
        anchors: [],
        mapping: child.mapping!,
      }, details.dimensions, {
        structure: details.structure,
        reelRows: details.reelRows,
        reelSlotSpacingMm: details.reelSlotSpacingMm,
      });
      const bodyName = `structure-${structure}-${child.location.code}`;
      const builderBody = builderMesh.getObjectByName(bodyName)!;
      const detailsBody = detailsMesh.getObjectByName(bodyName)!;
      expect(builderBody).toBeDefined();
      expect(detailsBody).toBeDefined();
      const builderLabel = builderBody.getObjectByName(`structure-${structure}-label`);
      const detailsLabel = detailsBody.getObjectByName(`structure-${structure}-label`);
      if (builderLabel) builderBody.remove(builderLabel);
      if (detailsLabel) detailsBody.remove(detailsLabel);
      const builderSize = new THREE.Box3().setFromObject(builderBody).getSize(new THREE.Vector3());
      const detailsSize = new THREE.Box3().setFromObject(detailsBody).getSize(new THREE.Vector3());
      expect(builderSize.x).toBeCloseTo(detailsSize.x, 6);
      expect(builderSize.y).toBeCloseTo(detailsSize.y, 6);
      expect(builderSize.z).toBeCloseTo(detailsSize.z, 6);
      expect(builderSize.x).toBeCloseTo(dims[0] / 1000, 6);
    }
  });

  it("uses the same custom Dry Cabinet model instance and body geometry across contexts", () => {
    const model: SpatialModelDto = {
      ...CABINET_MODEL,
      id: "dry-cabinet-custom-instance",
      code: "MSD-CUSTOM",
      name: "Custom Dry Cabinet",
      widthMm: 940,
      heightMm: 1970,
      depthMm: 640,
    };
    const location = { id: "dry-cabinet-custom-location", code: "MSD-CUSTOM", name: "Custom Dry Cabinet", kind: "dry_cabinet", parentId: null, isActive: true };
    const child = makeChild({ kind: "dry_cabinet", model });
    child.location = location;
    const builder = resolveChildSpatialRepresentation(child);
    const details = resolveSpatialRepresentation({ location, model });
    const published = resolveSpatialRepresentation({ location, model, mapping: child.mapping! });
    expect(builder.structure).toBe("dry-cabinet");
    expect(details.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);
    const builderMesh = createChildCompartmentMesh(toSceneChild(child, { dimensions: builder.dimensions }), "empty-mapped");
    const detailsMesh = createParentCarcassMesh({ location, model, node: child.node, anchors: [], mapping: child.mapping! }, details.dimensions, { structure: details.structure });
    const builderBody = builderMesh.getObjectByName("structure-dry-cabinet-MSD-CUSTOM")!;
    const detailsBody = detailsMesh.getObjectByName("structure-dry-cabinet-MSD-CUSTOM")!;
    expect(builderBody).toBeDefined();
    expect(detailsBody).toBeDefined();
    const builderSize = new THREE.Box3().setFromObject(builderBody).getSize(new THREE.Vector3());
    const detailsSize = new THREE.Box3().setFromObject(detailsBody).getSize(new THREE.Vector3());
    expect(builderSize.x).toBeCloseTo(0.94, 6);
    expect(builderSize.y).toBeCloseTo(1.97, 6);
    expect(builderSize.z).toBeCloseTo(0.64, 6);
    expect(detailsSize.x).toBeCloseTo(builderSize.x, 6);
    expect(detailsSize.y).toBeCloseTo(builderSize.y, 6);
    expect(detailsSize.z).toBeCloseTo(builderSize.z, 6);
  });

  it.each([
    ["matrix_tray", "matrix-tray", 300, 25, 200],
    ["compartment", "compartment", 45, 20, 35],
  ] as const)("uses the same custom %s model instance and bounds across Builder, Details, and published views", (kind, structure, widthMm, heightMm, depthMm) => {
    const model: SpatialModelDto = { ...CABINET_MODEL, id: `${kind}-custom`, code: kind.toUpperCase(), widthMm, heightMm, depthMm };
    const child = makeChild({ kind, model });
    child.location = { id: `${kind}-loc`, code: kind.toUpperCase(), name: kind, kind, parentId: null, isActive: true };
    child.mapping = {
      status: "MAPPED", isMappingEligible: true, hasSpatialNode: true,
      directChildCount: 1, mappedDirectChildCount: 1, unmappedDirectChildCount: 0,
      containerStatus: "PUBLISHED", publishedLayout: {
        ...PUBLISHED_LAYOUT,
        templateType: "GRID_PARTS_TRAY",
        containerDimensionsMm: { widthMm: 300, heightMm: 25, depthMm: 200 },
        config: { templateType: "GRID_PARTS_TRAY", dimensions: { widthMm: 300, heightMm: 25, depthMm: 200 }, wallThicknessMm: 3, rows: 4, columns: 6, dividerThicknessMm: 2 },
      }, slotMapping: null,
    };
    const builder = resolveChildSpatialRepresentation(child);
    const details = resolveSpatialRepresentation({ location: child.location, model });
    const published = resolveSpatialRepresentation({ location: child.location, model, mapping: child.mapping });
    expect(builder.structure).toBe(structure);
    expect(details.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);
    expect(details.dimensions).toEqual(builder.dimensions);
    expect(published.dimensions).toEqual(builder.dimensions);
    const dimensions = { x: widthMm / 1000, y: heightMm / 1000, z: depthMm / 1000 };
    const builderMesh = createChildCompartmentMesh(toSceneChild(child, { dimensions: builder.dimensions }), "empty-mapped");
    const detailsMesh = createParentCarcassMesh({ location: child.location, model, node: child.node, anchors: [], mapping: child.mapping }, details.dimensions, { structure: details.structure, wallThicknessMm: details.wallThicknessMm, gridRows: details.gridRows, gridColumns: details.gridColumns, gridDividerThicknessMm: details.gridDividerThicknessMm });
    const builderBody = builderMesh.getObjectByName(`structure-${structure}-${child.location.code}`)!;
    const detailsBody = detailsMesh.getObjectByName(`structure-${structure}-${child.location.code}`)!;
    const builderBounds = new THREE.Box3().setFromObject(builderBody).getSize(new THREE.Vector3());
    const detailsBounds = new THREE.Box3().setFromObject(detailsBody).getSize(new THREE.Vector3());
    expect(builderBounds.x).toBeCloseTo(dimensions.x, 6);
    expect(builderBounds.y).toBeCloseTo(dimensions.y, 6);
    expect(builderBounds.z).toBeCloseTo(dimensions.z, 6);
    expect(detailsBounds.x).toBeCloseTo(builderBounds.x, 6);
    expect(detailsBounds.y).toBeCloseTo(builderBounds.y, 6);
    expect(detailsBounds.z).toBeCloseTo(builderBounds.z, 6);
  });

  it("keeps an imported (GLB) model instance available when nested", () => {
    const child = makeChild({ kind: "rack", model: IMPORTED_MODEL });

    const direct = resolveAsDirectView(child);
    const nested = resolveAsChildInScene(child);

    expect(direct.source).toBe("model");
    expect(nested.source).toBe("model");
    // The asset reference travels with the representation, so a parent scene
    // instantiates the actual model instead of a proxy box.
    expect(direct.model?.assetUri).toBe(
      "https://assets.example.test/imported-rack.glb",
    );
    expect(nested.model?.assetUri).toBe(direct.model?.assetUri);
    expect(nested.model?.format).toBe("GLB");
  });

  it("resolves published builder geometry as the `layout` tier in every context", () => {
    const direct = resolveSpatialRepresentation({
      location: { id: "loc-1", code: "CAB-A", kind: "cabinet" },
      mapping: { publishedLayout: PUBLISHED_LAYOUT },
    });
    const nested = resolveChildSpatialRepresentation(
      makeChild({ kind: "cabinet" }),
    );

    expect(direct.source).toBe("layout");
    expect(direct.structure).toBe("enclosure");
    expect(direct.wallThicknessMm).toBe(12);
    // Without the child's own layout in the payload, the same kind still
    // resolves to the same generated geometry rather than a proxy.
    expect(nested.source).toBe("kind");
    expect(nested.structure).toBe("enclosure");
  });

  it("resolves persisted node/anchor geometry as the `node` tier", () => {
    const child = makeChild({ kind: "bin", anchor: ANCHOR });
    const nested = resolveAsChildInScene(child);

    expect(nested.source).toBe("node");
    expect(nested.dimensions).toEqual({ x: 0.08, y: 0.06, z: 0.12 });
    expect(nested.structure).toBe("tray");
  });

  it("keeps a space kind as scene context when it has no model", () => {
    const warehouse = makeChild({ kind: "warehouse" });
    expect(resolveAsChildInScene(warehouse).structure).toBe("warehouse");
    // A warehouse with an explicit model keeps that model's body instead.
    const modelled = makeChild({ kind: "warehouse", model: CABINET_MODEL });
    expect(resolveAsChildInScene(modelled).source).toBe("model");
    expect(resolveAsChildInScene(modelled).structure).toBe("enclosure");
  });

  it("resolves generated parametric geometry from the kind", () => {
    const expectations: Array<[string, string]> = [
      ["cabinet", "enclosure"],
      ["dry_cabinet", "dry-cabinet"],
      ["rack", "rack"],
      ["shelf", "shelf"],
      ["reel_rack", "reel-rack"],
      ["drawer", "drawer"],
      ["bin", "tray"],
      ["tray", "tray"],
      ["reel_slot", "reel-slot"],
      ["tube", "tube"],
    ];

    for (const [kind, structure] of expectations) {
      const child = makeChild({ kind, model: CABINET_MODEL });
      expect(resolveAsChildInScene(child).structure).toBe(structure);
    }
  });

  /**
   * Canonical kind audit matrix: every one of the 14 canonical categories
   * resolves to a declared representation in both rendering contexts (or is
   * explicitly scene context), and is classified by the domain compatibility
   * rule. A new canonical category added without a decision here fails this
   * test. Legacy aliases are covered separately below, so an alias can never be
   * mistaken for a canonical category.
   */
  it("classifies every canonical category", () => {
    const expected: Record<
      string,
      { structure: string; source: string; kindClass: string }
    > = {
      warehouse: { structure: "warehouse", source: "kind", kindClass: "space" },
      room_area: { structure: "warehouse", source: "kind", kindClass: "space" },
      aisle: { structure: "none", source: "fallback", kindClass: "space" },
      rack: { structure: "rack", source: "kind", kindClass: "container" },
      shelf: { structure: "shelf", source: "kind", kindClass: "container" },
      cabinet: {
        structure: "enclosure",
        source: "kind",
        kindClass: "container",
      },
      dry_cabinet: {
        structure: "dry-cabinet",
        source: "kind",
        kindClass: "container",
      },
      bin: { structure: "tray", source: "kind", kindClass: "compartment" },
      drawer: { structure: "drawer", source: "kind", kindClass: "compartment" },
      compartment: {
        structure: "compartment",
        source: "kind",
        kindClass: "compartment",
      },
      reel_rack: {
        structure: "reel-rack",
        source: "kind",
        kindClass: "container",
      },
      reel_slot: {
        structure: "reel-slot",
        source: "kind",
        kindClass: "compartment",
      },
      matrix_tray: {
        structure: "matrix-tray",
        source: "kind",
        kindClass: "container",
      },
      ic_tube_rail: {
        structure: "tube",
        source: "kind",
        kindClass: "compartment",
      },
    };

    // The matrix must cover the canonical taxonomy exactly — no more, no less.
    expect(Object.keys(expected).sort()).toEqual(
      [...SPATIAL_LOCATION_CATEGORIES].sort(),
    );

    for (const [kind, expectation] of Object.entries(expected)) {
      const child = makeChild({ kind });
      const direct = resolveAsDirectView(child);
      const nested = resolveAsChildInScene(child);

      expect(
        { kind, structure: direct.structure, source: direct.source },
        `direct ${kind}`,
      ).toEqual({
        kind,
        structure: expectation.structure,
        source: expectation.source,
      });
      expect(
        { kind, structure: nested.structure, source: nested.source },
        `nested ${kind}`,
      ).toEqual({
        kind,
        structure: expectation.structure,
        source: expectation.source,
      });
      expect(classifySpatialKind(kind), `class ${kind}`).toBe(
        expectation.kindClass,
      );
    }
  });

  /**
   * Legacy aliases resolve to their canonical category's representation but keep
   * their legacy compatibility class. Tested separately so the alias table can
   * never be read as a set of canonical categories.
   */
  it("resolves legacy aliases through their canonical category", () => {
    const aliases: Record<
      string,
      { structure: string; source: string; kindClass: string }
    > = {
      // Space aliases — read-compatible spellings of `room_area`.
      room: { structure: "warehouse", source: "kind", kindClass: "space" },
      area: { structure: "warehouse", source: "kind", kindClass: "space" },
      // Legacy warehouse-shell spellings with no canonical category.
      building: { structure: "warehouse", source: "kind", kindClass: "space" },
      facility: { structure: "warehouse", source: "kind", kindClass: "space" },
      zone: { structure: "none", source: "fallback", kindClass: "space" },
      // Matrix Tray alias keeps its legacy open-tray body (geometry safety) but
      // keeps its legacy compartment class.
      tray: {
        structure: "tray",
        source: "kind",
        kindClass: "compartment",
      },
      // IC Tube / Rail aliases all resolve to the canonical tube body.
      tube: { structure: "tube", source: "kind", kindClass: "compartment" },
      rail: { structure: "tube", source: "kind", kindClass: "compartment" },
      ic_tube: { structure: "tube", source: "kind", kindClass: "compartment" },
    };

    for (const [kind, expectation] of Object.entries(aliases)) {
      const child = makeChild({ kind });
      const direct = resolveAsDirectView(child);
      const nested = resolveAsChildInScene(child);

      expect(
        { kind, structure: direct.structure, source: direct.source },
        `direct ${kind}`,
      ).toEqual({
        kind,
        structure: expectation.structure,
        source: expectation.source,
      });
      expect(
        { kind, structure: nested.structure, source: nested.source },
        `nested ${kind}`,
      ).toEqual({
        kind,
        structure: expectation.structure,
        source: expectation.source,
      });
      expect(classifySpatialKind(kind), `class ${kind}`).toBe(
        expectation.kindClass,
      );
    }
  });

  it("keeps one representation for a location across every rendering context", () => {
    const child = makeChild({ kind: "rack", model: CABINET_MODEL });

    const contexts = [
      resolveAsDirectView(child),
      resolveAsChildInScene(child),
      resolveSpatialRepresentation({
        location: child.location,
        model: child.model,
      }),
    ];

    for (const representation of contexts) {
      expect(representation.source).toBe(contexts[0]!.source);
      expect(representation.structure).toBe(contexts[0]!.structure);
      expect(representation.dimensions).toEqual(contexts[0]!.dimensions);
      expect(representation.model?.code).toBe(contexts[0]!.model?.code);
    }
  });

  it("marks locations with no authoritative representation as `fallback`", () => {
    const child = makeChild({ kind: "aisle" });
    const nested = resolveAsChildInScene(child);

    expect(nested.source).toBe("fallback");
    expect(nested.structure).toBe("none");
  });
});

describe("Rendered instance fidelity", () => {
  /** Meshes of an instance's geometry, excluding label affordances. */
  function bodyMeshes(group: THREE.Object3D): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !obj.name.includes("-label")) {
        meshes.push(obj);
      }
    });
    return meshes;
  }

  it("composes a child instance with the same body as its direct view", () => {
    const child = makeChild({
      kind: "rack",
      model: { ...CABINET_MODEL, widthMm: 2200, heightMm: 2400, depthMm: 900 },
    });
    const dimensions = resolveChildSpatialRepresentation(child).dimensions;

    const directParent = createParentCarcassMesh(
      {
        location: {
          id: child.location.id,
          code: child.location.code,
          name: child.location.name,
          kind: child.location.kind,
          parentId: null,
          isActive: true,
        },
        node: null,
        model: child.model,
        anchors: [],
        mapping: {
          status: "MAPPED",
          isMappingEligible: true,
          hasSpatialNode: true,
          directChildCount: 0,
          mappedDirectChildCount: 0,
          unmappedDirectChildCount: 0,
          containerStatus: "NONE",
          publishedLayout: null,
          slotMapping: null,
        },
      },
      dimensions,
      {},
    );

    const nestedInstance = createChildCompartmentMesh(
      toSceneChild(child),
      "empty-mapped",
      null,
    );

    // Same structure, same mesh vocabulary, same dimensions: only the scene
    // transform, the semantic material and the label affordance differ.
    const directBodies = directParent.children.filter((obj) =>
      obj.name.startsWith("structure-"),
    );
    expect(directBodies).toHaveLength(1);
    expect(countMeshes(directBodies[0]!)).toBe(8); // 4 posts + 4 rails
    expect(bodyMeshes(nestedInstance)).toHaveLength(8);
    expect(nestedInstance.name).toContain("structure-rack-");

    nestedInstance.updateMatrixWorld(true);
    const nestedBox = new THREE.Box3();
    for (const mesh of bodyMeshes(nestedInstance)) {
      nestedBox.union(new THREE.Box3().setFromObject(mesh));
    }
    expect(nestedBox.max.x - nestedBox.min.x).toBeCloseTo(dimensions.x, 5);
    expect(nestedBox.max.y - nestedBox.min.y).toBeCloseTo(dimensions.y, 5);
    expect(nestedBox.max.z - nestedBox.min.z).toBeCloseTo(dimensions.z, 5);
  });

  it("never downgrades a model-bearing child to a bare box", () => {
    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });
    const instance = createChildCompartmentMesh(
      toSceneChild(child),
      "empty-mapped",
      null,
    );

    expect(instance.userData.representationSource).toBe("model");
    // An enclosure is an open-front body: it never becomes a single solid box.
    expect(countMeshes(instance)).toBeGreaterThan(1);
    expect(instance.name).toContain("structure-enclosure-");
  });

  it("records the representation tier on every instance, including the fallback", () => {
    const modelled = createChildCompartmentMesh(
      toSceneChild(makeChild({ kind: "cabinet", model: CABINET_MODEL })),
      "empty-mapped",
      null,
    );
    const fallback = createChildCompartmentMesh(
      toSceneChild(makeChild({ kind: "aisle" })),
      "empty-mapped",
      null,
    );

    expect(modelled.userData.representationSource).toBe("model");
    expect(String(modelled.userData.representationReason)).toContain(
      CABINET_MODEL.code,
    );
    expect(fallback.userData.representationSource).toBe("fallback");
  });

  /**
   * GEOMETRY SAFETY: `tray` is a legacy alias whose canonical category is
   * `matrix_tray`. Canonicalising its IDENTITY must not silently change the
   * visible body of persisted legacy rows, so the raw legacy token keeps its
   * historical open-tray body while canonical `matrix_tray` gets the divided
   * body. Dimensions are identical either way.
   */
  it("keeps legacy tray geometry distinct from canonical matrix_tray geometry", () => {
    const legacy = resolveSpatialRepresentation({
      location: { id: "legacy-tray", kind: "tray" },
    });
    const canonical = resolveSpatialRepresentation({
      location: { id: "canonical-matrix-tray", kind: "matrix_tray" },
    });

    // Identity is shared (both are the Matrix Tray category), but the rendered
    // body for the persisted legacy token is unchanged.
    expect(legacy.structure).toBe("tray");
    expect(canonical.structure).toBe("matrix-tray");
    expect(legacy.structure).not.toBe(canonical.structure);
    // Dimensions are identical, so only the body shape is preserved/changed.
    expect(legacy.dimensions).toEqual(canonical.dimensions);

    // The canonical category always resolves to the divided Matrix Tray body.
    expect(resolveKindStructureShape("matrix_tray")).toBe("matrix-tray");
    expect(resolveKindStructureShape("Matrix Tray")).toBe("matrix-tray");
  });

  it("never guesses a physical shape from substrings of an unknown kind", () => {    // Regression: the fallback tier previously used `kind.includes("bin")`,
    // `includes("shelf")`, `includes("drawer")`. `cabinet` contains "bin", so a
    // cabinet-named value could render as a tray; a tube-named value could render
    // as a tray; and any arbitrary string could acquire geometry it never had.
    // Shape selection is now canonical/token-safe.
    for (const value of [
      "cabinet", // contains "bin"
      "ic_tube_/_rail",
      "tube_holder",
      "glass tube",
      "shelfing",
      "drawerless",
      "arbitrary_unknown_kind",
      "banana",
    ]) {
      const shape = resolveKindStructureShape(value);
      expect(shape, value).not.toBe("tray");
      expect(shape, value).not.toBe("drawer");
      expect(shape, value).not.toBe("shelf");
    }
    // `cabinet` resolves to its own enclosure, never tray geometry.
    expect(resolveKindStructureShape("cabinet")).toBe("enclosure");
    // Unknown kinds resolve to no authored body.
    expect(resolveKindStructureShape("arbitrary_unknown_kind")).toBe("none");
    expect(resolveKindStructureShape("banana")).toBe("none");
  });

  it("renders an unknown-kind fallback as the generic body, not tray geometry", () => {
    const fallback = createChildCompartmentMesh(
      toSceneChild(makeChild({ kind: "arbitrary_unknown_kind" })),
      "empty-mapped",
      null,
    );
    expect(fallback.userData.representationSource).toBe("fallback");
    // The generic box is a single mesh; tray/drawer/shelf fallbacks add their own
    // affordances. Either way, the instance must not claim a tray structure.
    expect(resolveKindStructureShape("arbitrary_unknown_kind")).toBe("none");
  });

  it("preserves authored rotation and scale in the nested transform", () => {    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });
    const instance = createChildCompartmentMesh(
      toSceneChild(child, {
        rotation: { x: 0, y: Math.PI / 4, z: 0 },
        scale: { x: 1.5, y: 0.75, z: 1.2 },
        position: { x: -1.25, y: 0.62, z: 0.4 },
      }),
      "empty-mapped",
      null,
    );

    expect(instance.rotation.y).toBeCloseTo(Math.PI / 4, 6);
    expect(instance.scale.x).toBeCloseTo(1.5, 6);
    expect(instance.scale.y).toBeCloseTo(0.75, 6);
    expect(instance.position.x).toBeCloseTo(-1.25, 6);
    expect(instance.position.z).toBeCloseTo(0.4, 6);
  });

  it("grounds a nested instance on the scene floor from its world bounds", () => {
    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });
    const instance = createChildCompartmentMesh(
      toSceneChild(child, {
        position: { x: 0, y: 1.78, z: 0 },
        rotation: { x: 0, y: Math.PI / 6, z: 0 },
      }),
      "empty-mapped",
      null,
    );

    groundObjectOnFloor(instance);

    const bounds = new THREE.Box3().setFromObject(instance);
    expect(bounds.min.y).toBeCloseTo(0.001, 6);
  });

  it("keeps nested models selectable through their own location identity", () => {
    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });
    const instance = createChildCompartmentMesh(
      toSceneChild(child),
      "empty-mapped",
      null,
    );

    let meshes = 0;
    instance.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      expect(mesh.userData.locationId).toBe(child.location.id);
      expect(mesh.userData.isParent).toBe(false);
    });
    expect(meshes).toBeGreaterThan(1);
  });

  it("never mutates the persisted child data it composes from", () => {
    const child = makeChild({ kind: "rack", model: CABINET_MODEL });
    const snapshot = JSON.parse(JSON.stringify(child));

    const instance = createChildCompartmentMesh(
      toSceneChild(child),
      "empty-mapped",
      null,
    );
    groundObjectOnFloor(instance);

    expect(child).toEqual(snapshot);
  });
});
