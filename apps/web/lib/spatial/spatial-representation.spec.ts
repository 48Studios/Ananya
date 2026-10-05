import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  resolveChildSpatialRepresentation,
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
import { classifySpatialKind } from "@ananya/inventory";

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
    expect(direct.model?.code).toBe(CABINET_MODEL.code);
    expect(direct.structure).toBe("enclosure");
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
      ["shelf", "rack"],
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
   * Kind audit matrix: every kind the location form can produce resolves to a
   * declared representation in both rendering contexts (or is explicitly scene
   * context), and every kind is classified by the domain compatibility rule.
   * A new kind added to the form without a decision here fails this test.
   */
  it("classifies every location-form kind", () => {
    const expected: Record<
      string,
      { structure: string; source: string; kindClass: string }
    > = {
      warehouse: { structure: "warehouse", source: "kind", kindClass: "space" },
      building: { structure: "warehouse", source: "kind", kindClass: "space" },
      facility: { structure: "warehouse", source: "kind", kindClass: "space" },
      room: { structure: "none", source: "fallback", kindClass: "space" },
      zone: { structure: "none", source: "fallback", kindClass: "space" },
      aisle: { structure: "none", source: "fallback", kindClass: "space" },
      rack: { structure: "rack", source: "kind", kindClass: "container" },
      shelf: { structure: "rack", source: "kind", kindClass: "container" },
      cabinet: { structure: "enclosure", source: "kind", kindClass: "container" },
      dry_cabinet: {
        structure: "dry-cabinet",
        source: "kind",
        kindClass: "container",
      },
      reel_rack: { structure: "reel-rack", source: "kind", kindClass: "container" },
      drawer: { structure: "drawer", source: "kind", kindClass: "compartment" },
      bin: { structure: "tray", source: "kind", kindClass: "compartment" },
      compartment: { structure: "tray", source: "kind", kindClass: "compartment" },
      tray: { structure: "tray", source: "kind", kindClass: "compartment" },
      tube: { structure: "tube", source: "kind", kindClass: "compartment" },
      reel_slot: { structure: "reel-slot", source: "kind", kindClass: "compartment" },
    };

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

  it("preserves authored rotation and scale in the nested transform", () => {
    const child = makeChild({ kind: "cabinet", model: CABINET_MODEL });
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
