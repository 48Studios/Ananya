import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  WAREHOUSE_FLOOR_ELEVATION_METERS,
  WAREHOUSE_GROUNDING_CLEARANCE_METERS,
  computeSceneBoundingBox,
  degToRad,
  resolveParentGeometryOwnership,
  resolveWarehouseRoofRise,
  type SceneChildLayout,
  type Vector3D,
} from "./spatial-3d-layout";
import {
  createChildCompartmentMesh,
  createParentCarcassMesh,
  findInteractiveUserData,
  groundObjectOnFloor,
} from "./spatial-3d-scene";
import type { LocationOperationalViewDto } from "../api/spatial-api";

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

type ParentDto = LocationOperationalViewDto["parent"];

const WAREHOUSE_LAYOUT_DIMENSIONS = {
  widthMm: 2600,
  heightMm: 2400,
  depthMm: 900,
};

function makeParent({
  kind = "cabinet",
  model = null,
  publishedLayout = null,
}: {
  kind?: string;
  model?: ParentDto["model"];
  publishedLayout?: ParentDto["mapping"]["publishedLayout"];
} = {}): ParentDto {
  return {
    location: {
      id: "loc-1",
      code: "LOC-1",
      name: "Location",
      kind,
      parentId: null,
      isActive: true,
    },
    node: null,
    model,
    anchors: [],
    mapping: {
      status: "MAPPED",
      isMappingEligible: true,
      hasSpatialNode: false,
      directChildCount: 0,
      mappedDirectChildCount: 0,
      unmappedDirectChildCount: 0,
      containerStatus: publishedLayout ? "PUBLISHED" : "NONE",
      publishedLayout,
      slotMapping: null,
    },
  };
}

function makeModel(
  overrides: Partial<NonNullable<ParentDto["model"]>> = {},
): NonNullable<ParentDto["model"]> {
  return {
    id: "model-1",
    code: "MODEL-1",
    name: "Model 1",
    format: "PROCEDURAL",
    widthMm: 720,
    heightMm: 900,
    depthMm: 320,
    isActive: true,
    metadata: {},
    ...overrides,
  };
}

const warehouseLayout = {
  id: "layout-1",
  code: "LAY-1",
  revision: 2,
  totalCompartments: 6,
  containerDimensionsMm: WAREHOUSE_LAYOUT_DIMENSIONS,
  templateType: "PALLET_RACK",
  config: {
    templateType: "PALLET_RACK" as const,
    dimensions: WAREHOUSE_LAYOUT_DIMENSIONS,
    wallThicknessMm: 60,
    uprightPostWidthMm: 60,
    beamHeightMm: 80,
    levels: 2,
    baysPerLevel: 3,
  },
};

const cabinetLayout = {
  id: "layout-2",
  code: "LAY-2",
  revision: 1,
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

function toMeters(mm: {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}): Vector3D {
  return {
    x: mm.widthMm / 1000,
    y: mm.heightMm / 1000,
    z: mm.depthMm / 1000,
  };
}

/** Counts meshes that span the container like a lid/base or a full back panel. */
function countEnclosurePanels(group: THREE.Group, dims: Vector3D): number {
  const size = new THREE.Vector3();
  let panels = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    new THREE.Box3().setFromObject(mesh).getSize(size);
    const spansWidth = size.x > dims.x * 0.9;
    const spansDepth = size.z > dims.z * 0.9;
    const spansHeight = size.y > dims.y * 0.9;
    if (spansWidth && spansDepth) panels += 1;
    else if (spansHeight && spansDepth && size.x < dims.x * 0.2) panels += 1;
    else if (spansWidth && spansHeight && size.z < dims.z * 0.2) panels += 1;
  });
  return panels;
}

function countMeshes(group: THREE.Group): number {
  let meshes = 0;
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes += 1;
  });
  return meshes;
}

/** Counts meshes covering the front opening (z ≈ +D/2) across the full span. */
function countFrontPlates(group: THREE.Group, dims: Vector3D): number {
  const size = new THREE.Vector3();
  let plates = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    box.getSize(size);
    if (
      size.x > dims.x * 0.9 &&
      size.y > dims.y * 0.9 &&
      box.max.z > dims.z * 0.4
    ) {
      plates += 1;
    }
  });
  return plates;
}

/** Meshes of one named shell part, e.g. the floor or the back wall. */
function shellMeshes(group: THREE.Group, namePrefix: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.name.startsWith(namePrefix)) found.push(mesh);
  });
  return found;
}

function shellBox(mesh: THREE.Mesh): THREE.Box3 {
  return new THREE.Box3().setFromObject(mesh);
}

/** Meshes spanning the full width and the full wall height ahead of the walls. */
function countFrontBlockers(
  group: THREE.Group,
  dims: Vector3D,
  eaves: number,
): number {
  const size = new THREE.Vector3();
  let blockers = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = shellBox(mesh);
    box.getSize(size);
    if (
      size.x > dims.x * 0.9 &&
      size.y > eaves * 0.9 &&
      box.max.z > dims.z * 0.25
    ) {
      blockers += 1;
    }
  });
  return blockers;
}

/** Meshes spanning the whole width and depth, i.e. a lid or a base slab. */
function countHorizontalSlabs(
  group: THREE.Group,
  dims: Vector3D,
): THREE.Mesh[] {
  const size = new THREE.Vector3();
  const slabs: THREE.Mesh[] = [];
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = shellBox(mesh);
    box.getSize(size);
    if (size.x > dims.x * 0.9 && size.z > dims.z * 0.9) slabs.push(mesh);
  });
  return slabs;
}

describe("Parent geometry ownership", () => {
  it.each([
    ["dry-cabinet", "structure-dry-cabinet-"],
    ["reel-rack", "structure-reel-rack-"],
    ["tube", "structure-tube-"],
    ["reel-slot", "structure-reel-slot-"],
  ] as const)("renders a distinct procedural %s body", (structure, namePrefix) => {
    const parent = makeParent({ kind: structure });
    const group = createParentCarcassMesh(
      parent,
      { x: 0.8, y: 1.2, z: 0.5 },
      { structure },
    );
    expect(group.getObjectByName(`${namePrefix}${parent.location.code}`)).toBeTruthy();
    expect(countMeshes(group)).toBeGreaterThan(0);
  });

  it("Case 1 — a root warehouse without model or layout owns a cutaway shell", () => {
    const parent = makeParent({ kind: "warehouse" });
    const ownership = resolveParentGeometryOwnership(parent);

    expect(ownership.source).toBe("overview");
    expect(ownership.structure).toBe("warehouse");

    const group = createParentCarcassMesh(
      parent,
      toMeters(WAREHOUSE_LAYOUT_DIMENSIONS),
      { structure: ownership.structure },
    );
    const dims = toMeters(WAREHOUSE_LAYOUT_DIMENSIONS);
    const eaves = dims.y - resolveWarehouseRoofRise(dims.x);
    expect(shellMeshes(group, "warehouse-floor")).toHaveLength(1);
    expect(shellMeshes(group, "warehouse-back-wall")).toHaveLength(1);
    expect(shellMeshes(group, "warehouse-side-wall")).toHaveLength(2);
    expect(shellMeshes(group, "warehouse-roof-")).toHaveLength(2);
    // Scene context, never an enclosure: the front stays open.
    expect(countFrontBlockers(group, dims, eaves)).toBe(0);
  });

  it("Case 2 — an explicit warehouse model is rendered, with no duplicate fallback frame", () => {
    const parent = makeParent({
      kind: "warehouse",
      model: makeModel({ code: "WAREHOUSE-MODEL" }),
    });
    const ownership = resolveParentGeometryOwnership(parent);
    const dims = toMeters({ widthMm: 720, heightMm: 900, depthMm: 320 });

    expect(ownership.source).toBe("model");
    expect(ownership.structure).toBe("enclosure");

    const group = createParentCarcassMesh(parent, dims, {
      structure: ownership.structure,
    });
    // One enclosure, not enclosure + an implicit frame.
    expect(countMeshes(group)).toBe(5);
  });

  it("Case 3 — a warehouse bay plan places contents and never authors the space body", () => {
    const parent = makeParent({
      kind: "warehouse",
      publishedLayout: warehouseLayout,
    });
    const ownership = resolveParentGeometryOwnership(parent);
    const dims = toMeters(WAREHOUSE_LAYOUT_DIMENSIONS);

    // The published layout is a plan for the equipment standing in the space.
    // It may never replace the warehouse's own body with a rack carcass.
    expect(ownership.source).toBe("overview");
    expect(ownership.structure).toBe("warehouse");

    const group = createParentCarcassMesh(parent, dims, {
      structure: ownership.structure,
      wallThicknessMm: ownership.wallThicknessMm,
      postWidthMm: ownership.postWidthMm,
      beamHeightMm: ownership.beamHeightMm,
    });

    // Open structure: floor, back wall, two partial side walls and a pitched
    // roof — never a rack frame or enclosure wrapped around the contents.
    const eaves = dims.y - resolveWarehouseRoofRise(dims.x);
    expect(shellMeshes(group, "warehouse-floor")).toHaveLength(1);
    expect(shellMeshes(group, "warehouse-back-wall")).toHaveLength(1);
    expect(shellMeshes(group, "warehouse-side-wall")).toHaveLength(2);
    expect(shellMeshes(group, "warehouse-roof-")).toHaveLength(2);
    // No rack posts, no compartment body.
    expect(shellMeshes(group, "parent-carcass")).toHaveLength(0);
    expect(countFrontBlockers(group, dims, eaves)).toBe(0);
  });

  it("Case 4 — a cabinet keeps its enclosure, layout or model alike", () => {
    const modelParent = makeParent({ kind: "cabinet", model: makeModel() });
    const layoutParent = makeParent({
      kind: "cabinet",
      publishedLayout: cabinetLayout,
    });
    const dims = toMeters({ widthMm: 720, heightMm: 900, depthMm: 320 });

    expect(resolveParentGeometryOwnership(modelParent).structure).toBe(
      "enclosure",
    );
    expect(resolveParentGeometryOwnership(layoutParent)).toMatchObject({
      source: "layout",
      structure: "enclosure",
    });
    expect(
      countEnclosurePanels(
        createParentCarcassMesh(modelParent, dims, { structure: "enclosure" }),
        dims,
      ),
    ).toBeGreaterThan(0);
  });

  it("Case 5 — a rack keeps its open structure", () => {
    const parent = makeParent({
      kind: "rack",
      model: makeModel({
        code: "RACK",
        widthMm: 2200,
        heightMm: 2400,
        depthMm: 900,
      }),
    });
    const dims = toMeters({ widthMm: 2200, heightMm: 2400, depthMm: 900 });
    const ownership = resolveParentGeometryOwnership(parent);

    expect(ownership.source).toBe("model");
    expect(ownership.structure).toBe("rack");
    expect(
      countEnclosurePanels(
        createParentCarcassMesh(parent, dims, { structure: "rack" }),
        dims,
      ),
    ).toBe(0);
  });

  it("a drawer body keeps its sliding face plate", () => {
    const parent = makeParent({ kind: "drawer" });
    const dims = toMeters({ widthMm: 180, heightMm: 70, depthMm: 350 });
    const ownership = resolveParentGeometryOwnership(parent);

    expect(ownership).toMatchObject({ source: "kind", structure: "drawer" });
    expect(
      countFrontPlates(
        createParentCarcassMesh(parent, dims, {
          structure: ownership.structure,
        }),
        dims,
      ),
    ).toBe(1);
  });

  it("a grid tray keeps its front open so compartments stay visible and clickable", () => {
    const dims = toMeters({ widthMm: 600, heightMm: 400, depthMm: 300 });
    const parent = makeParent({
      kind: "cabinet",
      publishedLayout: {
        ...warehouseLayout,
        templateType: "GRID_PARTS_TRAY",
        config: {
          templateType: "GRID_PARTS_TRAY" as const,
          dimensions: { widthMm: 600, heightMm: 400, depthMm: 300 },
          wallThicknessMm: 12,
          rows: 3,
          columns: 4,
        },
      },
    });
    const ownership = resolveParentGeometryOwnership(parent);

    expect(ownership).toMatchObject({ source: "layout", structure: "tray" });
    const group = createParentCarcassMesh(parent, dims, {
      structure: ownership.structure,
      wallThicknessMm: ownership.wallThicknessMm,
    });
    // Floor, two sides, a back wall and a half-height front lip — never a
    // full-face front plate.
    expect(countMeshes(group)).toBe(5);
    expect(countFrontPlates(group, dims)).toBe(0);
  });

  it("Case 6 — nested locations resolve independently", () => {
    // Root warehouse: cutaway scene context. The cabinet beneath it: its own
    // enclosure. Neither inherits the other's shape.
    expect(
      resolveParentGeometryOwnership(
        makeParent({ kind: "warehouse", publishedLayout: warehouseLayout }),
      ),
    ).toMatchObject({ source: "overview", structure: "warehouse" });
    expect(
      resolveParentGeometryOwnership(
        makeParent({ kind: "cabinet", model: makeModel() }),
      ),
    ).toMatchObject({ source: "model", structure: "enclosure" });
  });

  it("renders the authored container body on an authoring surface", () => {
    const parent = makeParent({
      kind: "warehouse",
      publishedLayout: warehouseLayout,
    });

    // Operational viewer: the warehouse's own body is the cutaway shell.
    expect(resolveParentGeometryOwnership(parent)).toMatchObject({
      source: "overview",
      structure: "warehouse",
    });
    // Inventory Builder preview: the authored layout is the container being
    // edited, so its structure and elevations are what the operator must see.
    expect(
      resolveParentGeometryOwnership(parent, { authoredLayoutBody: true }),
    ).toMatchObject({
      source: "layout",
      structure: "rack",
      postWidthMm: 60,
      beamHeightMm: 80,
    });
  });

  it("physical kinds own a body, space kinds own their scene, and templates decide shape", () => {
    expect(
      resolveParentGeometryOwnership(makeParent({ kind: "cabinet" })),
    ).toMatchObject({
      source: "kind",
      structure: "enclosure",
    });
    expect(
      resolveParentGeometryOwnership(makeParent({ kind: "shelf" })),
    ).toMatchObject({
      source: "kind",
      structure: "rack",
    });
    expect(
      resolveParentGeometryOwnership(makeParent({ kind: "warehouse" })),
    ).toMatchObject({
      source: "overview",
      structure: "warehouse",
    });
    expect(
      resolveParentGeometryOwnership(makeParent({ kind: "room" })),
    ).toMatchObject({
      source: "overview",
      structure: "none",
    });
    expect(
      resolveParentGeometryOwnership(
        makeParent({
          kind: "zone",
          publishedLayout: {
            ...warehouseLayout,
            templateType: "GRID_PARTS_TRAY",
            config: {
              templateType: "GRID_PARTS_TRAY" as const,
              dimensions: WAREHOUSE_LAYOUT_DIMENSIONS,
              wallThicknessMm: 12,
              rows: 3,
              columns: 4,
            },
          },
        }),
      ),
    ).toMatchObject({ source: "layout", structure: "tray" });
  });
});

describe("Cutaway warehouse shell", () => {
  const shellDims: Vector3D = { x: 3.2, y: 2.6, z: 1.2 };
  const eaves = shellDims.y - resolveWarehouseRoofRise(shellDims.x);

  function buildShell(): THREE.Group {
    const parent = makeParent({ kind: "warehouse" });
    return createParentCarcassMesh(parent, shellDims, {
      structure: "warehouse",
    });
  }

  it("puts a thick floor slab on the ground plane so contents stand on it", () => {
    const group = buildShell();
    const floors = shellMeshes(group, "warehouse-floor");

    expect(floors).toHaveLength(1);
    const floor = shellBox(floors[0]!);
    expect(floor.max.y).toBeCloseTo(WAREHOUSE_FLOOR_ELEVATION_METERS, 6);
    // A slab, not a sheet: it reads as a poured industrial floor.
    expect(floor.max.y - floor.min.y).toBeGreaterThan(0.08);
    expect(floor.max.x - floor.min.x).toBeCloseTo(shellDims.x, 5);
    expect(floor.max.z - floor.min.z).toBeCloseTo(shellDims.z, 5);
  });

  it("marks the warehouse boundary with a floor edge outline", () => {
    const group = buildShell();

    const edges: THREE.Object3D[] = [];
    group.traverse((obj) => {
      if (obj.name === "warehouse-floor-edge") edges.push(obj);
    });
    expect(edges).toHaveLength(1);
    expect((edges[0] as THREE.LineSegments).isLineSegments).toBe(true);
  });

  it("keeps a back wall and only the rear third of each side wall", () => {
    const group = buildShell();

    const backWalls = shellMeshes(group, "warehouse-back-wall");
    expect(backWalls).toHaveLength(1);
    const backBox = shellBox(backWalls[0]!);
    expect(backBox.max.x - backBox.min.x).toBeCloseTo(shellDims.x, 5);
    expect(backBox.max.y - backBox.min.y).toBeCloseTo(eaves, 5);

    const sideWalls = shellMeshes(group, "warehouse-side-wall");
    expect(sideWalls).toHaveLength(2);
    for (const sideWall of sideWalls) {
      const box = shellBox(sideWall);
      expect(box.max.z - box.min.z).toBeCloseTo(shellDims.z / 3, 5);
      // The open front runs from the wall's front edge to the shell's front.
      expect(box.max.z).toBeLessThan(0);
      expect(box.max.y - box.min.y).toBeCloseTo(eaves, 5);
    }
    const [left, right] = sideWalls.map((mesh) => shellBox(mesh));
    expect(Math.min(left!.min.x, right!.min.x)).toBeCloseTo(
      -shellDims.x / 2,
      5,
    );
    expect(Math.max(left!.max.x, right!.max.x)).toBeCloseTo(shellDims.x / 2, 5);
  });

  it("raises a pitched roof above the walls and keeps the front open", () => {
    const group = buildShell();

    const roofSlabs = shellMeshes(group, "warehouse-roof-");
    expect(roofSlabs).toHaveLength(2);
    for (const slab of roofSlabs) {
      const box = shellBox(slab);
      // The roof planes sit on the eaves and rise to the ridge, with only the
      // slab's own thickness hanging below the eave line.
      expect(box.min.y).toBeGreaterThan(eaves - 0.1);
      expect(box.max.y).toBeGreaterThan(eaves + (shellDims.y - eaves) * 0.5);
    }
    expect(shellMeshes(group, "warehouse-ridge-cap")).toHaveLength(1);

    expect(countFrontBlockers(group, shellDims, eaves)).toBe(0);
    // The whole top of the shell is the roof: nothing caps it like a lid.
    const slabs = countHorizontalSlabs(group, shellDims);
    expect(slabs.map((mesh) => mesh.name)).toEqual(["warehouse-floor"]);
  });

  it("adds only a few exposed structural members and thin panel ribs", () => {
    const group = buildShell();

    expect(shellMeshes(group, "warehouse-post-")).toHaveLength(4);
    expect(shellMeshes(group, "warehouse-eave-beam-")).toHaveLength(2);
    expect(shellMeshes(group, "warehouse-back-beam")).toHaveLength(1);
    expect(shellMeshes(group, "warehouse-ridge-beam")).toHaveLength(1);

    const ribs = shellMeshes(group, "warehouse-back-panel-");
    expect(ribs.length).toBeGreaterThan(3);
    for (const rib of ribs) {
      const box = shellBox(rib);
      // Panels are proud of the wall by a few millimetres, never deep slabs.
      expect(box.max.z - box.min.z).toBeLessThan(0.05);
      expect(box.max.x - box.min.x).toBeLessThan(0.1);
    }

    // No compartment body, drawer, rack frame or furniture is generated.
    expect(shellMeshes(group, "warehouse-shelf")).toHaveLength(0);
    expect(countMeshes(group)).toBeLessThan(40);
  });

  it("is not selectable as an inventory location on its own", () => {
    const parent = makeParent({ kind: "warehouse" });
    const group = createParentCarcassMesh(parent, shellDims, {
      structure: "warehouse",
    });

    let meshes = 0;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      // The shell carries the viewed location's identity, but every mesh is a
      // parent: existing consumers only make parents clickable when they opt in.
      expect(mesh.userData.isParent).toBe(true);
      expect(mesh.userData.locationId).toBe(parent.location.id);
    });
    expect(meshes).toBeGreaterThan(5);
  });
});

describe("Warehouse scene grounding", () => {
  /**
   * Builds the kind of object the viewport composes for a child: a group placed
   * at the persisted transform whose geometry carries its own origin
   * convention (centre-origin boxes, bottom-origin boxes, or an offset composite).
   */
  function composeObject({
    dimensions,
    position,
    rotation = { x: 0, y: 0, z: 0 },
    scale = { x: 1, y: 1, z: 1 },
    origin = "center",
    baseOffset = 0,
  }: {
    dimensions: Vector3D;
    position: Vector3D;
    rotation?: Vector3D;
    scale?: Vector3D;
    origin?: "center" | "bottom";
    baseOffset?: number;
  }): THREE.Group {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(
      dimensions.x,
      dimensions.y,
      dimensions.z,
    );
    if (origin === "bottom") geometry.translate(0, dimensions.y / 2, 0);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.y = baseOffset;
    mesh.name = "child-body";
    group.add(mesh);
    group.position.set(position.x, position.y, position.z);
    group.rotation.set(rotation.x, rotation.y, rotation.z);
    group.scale.set(scale.x, scale.y, scale.z);
    return group;
  }

  function bottomOf(object: THREE.Object3D): number {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object).min.y;
  }

  const expectedBottom =
    WAREHOUSE_FLOOR_ELEVATION_METERS + WAREHOUSE_GROUNDING_CLEARANCE_METERS;

  it("grounds centre-origin geometry that was authored high above the floor", () => {
    const object = composeObject({
      dimensions: { x: 0.72, y: 0.9, z: 0.32 },
      position: { x: -0.84, y: 0.62, z: 0 },
    });

    const correction = groundObjectOnFloor(object);

    expect(correction).toBeCloseTo(-0.169, 6);
    expect(bottomOf(object)).toBeCloseTo(expectedBottom, 9);
  });

  it("grounds bottom-origin geometry without assuming the origin convention", () => {
    const object = composeObject({
      dimensions: { x: 0.5, y: 0.6, z: 0.3 },
      position: { x: 0.4, y: 1.78, z: -0.2 },
      origin: "bottom",
    });

    groundObjectOnFloor(object);

    expect(bottomOf(object)).toBeCloseTo(expectedBottom, 9);
  });

  it("grounds rotated and scaled objects from their transformed bounds", () => {
    const object = composeObject({
      dimensions: { x: 0.6, y: 0.8, z: 0.4 },
      position: { x: 0.2, y: 2.4, z: 0.1 },
      rotation: { x: degToRad(20), y: degToRad(35), z: 0 },
      scale: { x: 1.4, y: 0.75, z: 1.1 },
    });

    groundObjectOnFloor(object);

    expect(bottomOf(object)).toBeCloseTo(expectedBottom, 9);
  });

  it("grounds the complete rendered object, including parts offset from its origin", () => {
    const object = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial(),
    );
    body.position.y = 0.25;
    body.position.x = 0.3;
    object.add(body);
    // A part that hangs lower than the body must set the ground contact.
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.2, 0.1),
      new THREE.MeshBasicMaterial(),
    );
    foot.position.set(-0.2, -0.1, 0);
    object.add(foot);
    object.position.set(0, 3, 0);

    groundObjectOnFloor(object);

    // The group's own origin sits above the floor; the lowest geometry touches it.
    expect(bottomOf(object)).toBeCloseTo(expectedBottom, 9);
    expect(object.position.y).toBeLessThan(3);
  });

  it("respects a warehouse floor elevation other than zero", () => {
    const object = composeObject({
      dimensions: { x: 0.4, y: 1, z: 0.4 },
      position: { x: 0, y: 0.5, z: 0 },
    });

    groundObjectOnFloor(object, 1.5);

    expect(bottomOf(object)).toBeCloseTo(
      1.5 + WAREHOUSE_GROUNDING_CLEARANCE_METERS,
      9,
    );
  });

  it("leaves an object already standing on the floor in place", () => {
    const object = composeObject({
      dimensions: { x: 0.4, y: 1, z: 0.4 },
      position: {
        x: 0.7,
        y: WAREHOUSE_FLOOR_ELEVATION_METERS + 0.5,
        z: -0.3,
      },
    });

    const correction = groundObjectOnFloor(object);

    expect(correction).toBeCloseTo(WAREHOUSE_GROUNDING_CLEARANCE_METERS, 9);
    expect(bottomOf(object)).toBeCloseTo(expectedBottom, 9);
  });

  it("preserves horizontal placement, rotation, scale and dimensions", () => {
    const rotation = { x: degToRad(10), y: degToRad(-25), z: degToRad(5) };
    const scale = { x: 1.2, y: 0.9, z: 1.05 };
    const object = composeObject({
      dimensions: { x: 0.72, y: 0.9, z: 0.32 },
      position: { x: -0.8467, y: 0.62, z: 0.15 },
      rotation,
      scale,
    });
    const authoredPosition = object.position.clone();
    const authoredRotation = object.rotation.clone();
    const authoredScale = object.scale.clone();

    groundObjectOnFloor(object);

    expect(object.position.x).toBe(authoredPosition.x);
    expect(object.position.z).toBe(authoredPosition.z);
    expect(object.rotation.x).toBe(authoredRotation.x);
    expect(object.rotation.y).toBe(authoredRotation.y);
    expect(object.rotation.z).toBe(authoredRotation.z);
    expect(object.scale.x).toBe(authoredScale.x);
    expect(object.scale.y).toBe(authoredScale.y);
    expect(object.scale.z).toBe(authoredScale.z);
    // Geometry is untouched: only the root translation moved.
    const body = object.children[0] as THREE.Mesh;
    const geometrySize = new THREE.Vector3();
    body.geometry.computeBoundingBox();
    body.geometry.boundingBox!.getSize(geometrySize);
    expect(geometrySize.x).toBeCloseTo(0.72, 6);
    expect(geometrySize.y).toBeCloseTo(0.9, 6);
    expect(geometrySize.z).toBeCloseTo(0.32, 6);
  });

  it("grounds every child of a warehouse without disturbing the others", () => {
    const children = [
      composeObject({
        dimensions: { x: 0.72, y: 0.9, z: 0.32 },
        position: { x: -0.8467, y: 0.62, z: 0 },
      }),
      composeObject({
        dimensions: { x: 0.6, y: 0.9, z: 0.4 },
        position: { x: 0, y: 0.62, z: 0 },
      }),
      composeObject({
        dimensions: { x: 0.79, y: 0.86, z: 0.32 },
        position: { x: -0.8467, y: 1.78, z: 0 },
        origin: "bottom",
      }),
    ];
    const horizontal = children.map((child) => ({
      x: child.position.x,
      z: child.position.z,
    }));

    for (const child of children) {
      groundObjectOnFloor(child);
    }

    for (let index = 0; index < children.length; index += 1) {
      expect(bottomOf(children[index]!)).toBeCloseTo(expectedBottom, 9);
      expect(children[index]!.position.x).toBe(horizontal[index]!.x);
      expect(children[index]!.position.z).toBe(horizontal[index]!.z);
    }
  });

  it("never mutates the persisted child layout it composes from", () => {
    const layout = {
      position: { x: -0.8467, y: 0.62, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      dimensions: { x: 0.72, y: 0.9, z: 0.32 },
    };
    const snapshot = JSON.parse(JSON.stringify(layout));
    const object = composeObject({
      dimensions: layout.dimensions,
      position: layout.position,
      rotation: layout.rotation,
      scale: layout.scale,
    });

    groundObjectOnFloor(object);

    expect(layout).toEqual(snapshot);
  });
});

describe("Scene bounds are not physical geometry", () => {
  const child = (x: number, z: number): SceneChildLayout =>
    ({
      locationId: `child-${x}-${z}`,
      locationCode: "CHILD",
      locationName: "Child",
      kind: "cabinet",
      isMapped: true,
      hasStock: false,
      totalQuantity: 0,
      position: { x, y: 0.5, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      dimensions: { x: 0.4, y: 1, z: 0.4 },
      rawChild: {
        location: {
          id: `child-${x}-${z}`,
          code: "CHILD",
          name: "Child",
          kind: "cabinet",
          parentId: "loc-1",
          isActive: true,
        },
        node: null,
        model: null,
        anchor: null,
      },
    }) as SceneChildLayout;

  it("fits the children when the context owns no physical frame", () => {
    const bounds = computeSceneBoundingBox(null, [child(-1, 0), child(1, 0)]);

    expect(bounds.min.x).toBeCloseTo(-1.2, 5);
    expect(bounds.max.x).toBeCloseTo(1.2, 5);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(1, 5);
  });

  it("keeps a finite stage when the scene is empty", () => {
    const bounds = computeSceneBoundingBox(null, []);

    expect(Number.isFinite(bounds.size.x)).toBe(true);
    expect(Number.isFinite(bounds.size.y)).toBe(true);
    expect(Number.isFinite(bounds.size.z)).toBe(true);
    expect(bounds.size.x).toBeGreaterThan(0);
    expect(bounds.size.y).toBeGreaterThan(0);
  });

  it("still expands an authored frame with its children", () => {
    const bounds = computeSceneBoundingBox({ x: 1, y: 1, z: 1 }, [child(2, 0)]);
    expect(bounds.max.x).toBeCloseTo(2.2, 5);
  });
});

describe("Interactive mesh hit testing & child-selection inside selected container", () => {
  it("rejects LineSegments, Lines, and non-Mesh objects from interactive selection", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial());
    line.userData = {
      locationId: "loc-wireframe",
      isParent: true,
    };

    expect(findInteractiveUserData(line)).toBeNull();
    expect(findInteractiveUserData(new THREE.GridHelper(10, 10))).toBeNull();
  });

  it("resolves userData for solid Mesh objects belonging to a location", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.userData = {
      locationId: "drawer-1",
      locationCode: "DRW-1",
      kind: "drawer",
      isParent: false,
    };

    const resolved = findInteractiveUserData(mesh);
    expect(resolved).not.toBeNull();
    expect(resolved?.locationId).toBe("drawer-1");
    expect(resolved?.isParent).toBe(false);
  });

  it("allows selecting a child drawer inside a selected root container without carcass outline interception", () => {
    const parent = makeParent({ kind: "cabinet" });
    const carcassDimensions: Vector3D = { x: 0.8, y: 1.0, z: 0.4 };

    // Parent container is currently selected
    const carcass = createParentCarcassMesh(parent, carcassDimensions, {
      isSelected: true,
      needsAttention: false,
      structure: "enclosure",
    });

    const childDrawer: SceneChildLayout = {
      locationId: "child-drawer-slot-1",
      locationCode: "D01",
      locationName: "Drawer 1",
      kind: "drawer",
      isMapped: true,
      hasStock: false,
      totalQuantity: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      dimensions: { x: 0.2, y: 0.15, z: 0.35 },
      rawChild: {
        location: {
          id: "child-drawer-slot-1",
          code: "D01",
          name: "Drawer 1",
          kind: "drawer",
          parentId: parent.location.id,
          isActive: true,
        },
        node: null,
        model: null,
        anchor: null,
      },
    };

    const drawerMesh = createChildCompartmentMesh(childDrawer, "empty-mapped", null, {
      openable: true,
    });

    const scene = new THREE.Scene();
    scene.add(carcass);
    scene.add(drawerMesh);
    scene.updateMatrixWorld(true);

    // Cast a ray from the front (+Z) pointing straight into the drawer
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 2),
      new THREE.Vector3(0, 0, -1),
    );

    const intersects = raycaster.intersectObjects(scene.children, true);
    expect(intersects.length).toBeGreaterThan(0);

    // Find the first interactive object hit
    let firstInteractiveUserData = null;
    for (const hit of intersects) {
      const data = findInteractiveUserData(hit.object);
      if (data) {
        firstInteractiveUserData = data;
        break;
      }
    }

    // The hit must resolve to the child drawer, NOT the parent carcass selection outline
    expect(firstInteractiveUserData).not.toBeNull();
    expect(firstInteractiveUserData?.locationId).toBe("child-drawer-slot-1");
    expect(firstInteractiveUserData?.isParent).toBe(false);
  });
});

