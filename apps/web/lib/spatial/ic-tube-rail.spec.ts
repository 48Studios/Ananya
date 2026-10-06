import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  resolveChildSpatialRepresentation,
  resolveKindStructureShape,
  resolveSpatialRepresentation,
  type SceneChildLayout,
} from "./spatial-3d-layout";
import {
  createChildCompartmentMesh,
  createParentCarcassMesh,
  createStructureBodyMesh,
  findInteractiveUserData,
} from "./spatial-3d-scene";
import { resolveSpatialModel } from "./spatial-model-library";
import type {
  LocationOperationalViewChildDto,
  SpatialModelDto,
} from "../api/spatial-api";

/**
 * IC Tube / Rail: canonical model → "tube" structure → dedicated open rail
 * channel (base + two side walls), never the legacy cylinder.
 */

// Label plates use canvas textures; the web suite runs without a DOM.
(globalThis as unknown as { document?: unknown }).document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => null,
  }),
};

const RAIL_MODEL: SpatialModelDto = {
  id: "ic-tube-rail-model-custom",
  code: "IC-RAIL-CUSTOM",
  name: "Custom IC tube rail",
  format: "PROCEDURAL",
  widthMm: 60,
  heightMm: 30,
  depthMm: 540,
  isActive: true,
  metadata: {},
};
const RAIL_DIMS = { x: 0.06, y: 0.03, z: 0.54 };

function makeRailChild(
  kind = "ic_tube_rail",
  model: SpatialModelDto | null = RAIL_MODEL,
): LocationOperationalViewChildDto {
  return {
    location: {
      id: "loc-ic-rail",
      code: "IC-RAIL-01",
      name: "IC rail 01",
      kind,
      parentId: "loc-shelf",
      isActive: true,
    },
    node: null,
    model,
    anchor: null,
  };
}

function toSceneChild(child: LocationOperationalViewChildDto): SceneChildLayout {
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
  };
}

function railBody(dimensions = RAIL_DIMS): THREE.Group {
  return createStructureBodyMesh("tube", dimensions, {
    locationId: "loc-ic-rail",
    locationCode: "IC-RAIL-01",
    locationName: "IC rail 01",
    kind: "ic_tube_rail",
    hasStock: false,
    isMapped: true,
    isParent: true,
  });
}

function meshes(group: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) found.push(obj as THREE.Mesh);
  });
  return found;
}

function size(object: THREE.Object3D): THREE.Vector3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

describe("IC Tube / Rail canonical model", () => {
  it.each(["ic_tube_rail", "tube", "rail", "ic-tube", "IC Tube Rail", "IC Tube / Rail"])(
    "resolves %s to the canonical tube structure",
    (kind) => {
      expect(resolveSpatialModel(kind)?.structure).toBe("tube");
      expect(resolveKindStructureShape(kind)).toBe("tube");
    },
  );

  it("never resolves the display label to tray or matrix-tray geometry", () => {
    for (const label of ["IC Tube / Rail", "ic tube / rail", " IC Tube/Rail "]) {
      expect(resolveKindStructureShape(label)).not.toBe("tray");
      expect(resolveKindStructureShape(label)).not.toBe("matrix-tray");
      expect(
        resolveSpatialRepresentation({ location: { id: "l", kind: label } })
          .structure,
      ).toBe("tube");
    }
  });

  it("resolves the canonical ic_tube_rail model metadata", () => {
    const model = resolveSpatialModel("ic_tube_rail");
    expect(model).toMatchObject({
      kind: "ic_tube_rail",
      displayName: "IC Tube / Rail",
      category: "physical",
      structure: "tube",
      isFallback: false,
    });
  });

  it("builds a model instance from persisted custom dimensions", () => {
    const representation = resolveSpatialRepresentation({
      location: { id: "loc-ic-rail", kind: "ic_tube_rail" },
      model: RAIL_MODEL,
    });
    expect(representation.source).toBe("model");
    expect(representation.structure).toBe("tube");
    expect(representation.modelInstance).toEqual({
      locationId: "loc-ic-rail",
      category: "ic_tube_rail",
      modelId: "ic_tube_rail-model",
      dimensions: { widthMm: 60, heightMm: 30, depthMm: 540 },
    });
    expect(representation.dimensions.x).toBeCloseTo(RAIL_DIMS.x, 10);
    expect(representation.dimensions.y).toBeCloseTo(RAIL_DIMS.y, 10);
    expect(representation.dimensions.z).toBeCloseTo(RAIL_DIMS.z, 10);
  });
});

describe("IC Tube / Rail geometry", () => {
  it("does not render the legacy cylinder", () => {
    for (const mesh of meshes(railBody())) {
      expect(mesh.geometry).not.toBeInstanceOf(THREE.CylinderGeometry);
      expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    }
  });

  it("renders exactly a base, left wall and right wall", () => {
    const group = railBody();
    expect(meshes(group).map((mesh) => mesh.name).sort()).toEqual([
      "tube-base-IC-RAIL-01",
      "tube-left-wall-IC-RAIL-01",
      "tube-right-wall-IC-RAIL-01",
    ]);
    const base = group.getObjectByName("tube-base-IC-RAIL-01")!;
    const left = group.getObjectByName("tube-left-wall-IC-RAIL-01")!;
    const right = group.getObjectByName("tube-right-wall-IC-RAIL-01")!;

    // Base spans the full footprint at the bottom.
    const baseBox = new THREE.Box3().setFromObject(base);
    expect(baseBox.min.y).toBeCloseTo(-RAIL_DIMS.y / 2, 6);
    expect(size(base).x).toBeCloseTo(RAIL_DIMS.x, 6);
    expect(size(base).z).toBeCloseTo(RAIL_DIMS.z, 6);

    // Walls stand on the base at opposite edges and reach the top.
    const leftBox = new THREE.Box3().setFromObject(left);
    const rightBox = new THREE.Box3().setFromObject(right);
    expect(leftBox.min.x).toBeCloseTo(-RAIL_DIMS.x / 2, 6);
    expect(rightBox.max.x).toBeCloseTo(RAIL_DIMS.x / 2, 6);
    expect(leftBox.min.y).toBeCloseTo(baseBox.max.y, 6);
    expect(rightBox.min.y).toBeCloseTo(baseBox.max.y, 6);
    expect(leftBox.max.y).toBeCloseTo(RAIL_DIMS.y / 2, 6);
    expect(rightBox.max.y).toBeCloseTo(RAIL_DIMS.y / 2, 6);
  });

  it("leaves the top open between the side walls", () => {
    const group = railBody();
    group.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const [first] = raycaster.intersectObject(group, true);
    expect(first?.object.name).toBe("tube-base-IC-RAIL-01");
  });

  it.each([
    { x: 0.06, y: 0.03, z: 0.54 },
    { x: 0.04, y: 0.04, z: 0.12 },
    { x: 0.2, y: 0.05, z: 0.6 },
  ])("matches instance bounds %o exactly", (dimensions) => {
    const bounds = size(railBody(dimensions));
    expect(bounds.x).toBeCloseTo(dimensions.x, 6);
    expect(bounds.y).toBeCloseTo(dimensions.y, 6);
    expect(bounds.z).toBeCloseTo(dimensions.z, 6);
  });
});

describe("IC Tube / Rail interaction identity", () => {
  it("resolves every mesh of a Location Details carcass to the rail location", () => {
    const group = createParentCarcassMesh(
      {
        location: makeRailChild().location,
        node: null,
        model: RAIL_MODEL,
        mapping: null,
        anchors: [],
      } as unknown as Parameters<typeof createParentCarcassMesh>[0],
      RAIL_DIMS,
      { structure: "tube", isSelected: true },
    );
    const parts = meshes(group);
    expect(parts.length).toBe(3);
    for (const part of parts) {
      expect(findInteractiveUserData(part)).toMatchObject({
        locationId: "loc-ic-rail",
        locationCode: "IC-RAIL-01",
        kind: "ic_tube_rail",
        isParent: true,
      });
    }
    // Selection outlines are styling only and never capture the ray.
    const outline = group.getObjectByName("parent-selection-outline")!;
    expect(findInteractiveUserData(outline)).toBeNull();
  });

  it("resolves rays hitting the base, either wall or the label to the child rail", () => {
    const group = createChildCompartmentMesh(
      toSceneChild(makeRailChild()),
      "empty-mapped",
      null,
    );
    const scene = new THREE.Scene();
    scene.add(group);
    scene.updateMatrixWorld(true);
    expect(group.userData.probePoint).toEqual({ x: 0, y: 0, z: RAIL_DIMS.z / 2 });

    const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    const rays: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(center.x, 2, center.z), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(-2, center.y + 0.005, center.z), new THREE.Vector3(1, 0, 0)],
      [new THREE.Vector3(2, center.y + 0.005, center.z), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(center.x, center.y, 2), new THREE.Vector3(0, 0, -1)],
    ];
    const hitNames = new Set<string>();
    for (const [origin, direction] of rays) {
      const [hit] = new THREE.Raycaster(origin, direction).intersectObjects(
        scene.children,
        true,
      );
      expect(hit).toBeTruthy();
      hitNames.add(hit!.object.name);
      expect(findInteractiveUserData(hit!.object)).toMatchObject({
        locationId: "loc-ic-rail",
        locationCode: "IC-RAIL-01",
        isParent: false,
      });
    }
    expect(hitNames).toContain("tube-base-IC-RAIL-01");
    expect(hitNames).toContain("tube-left-wall-IC-RAIL-01");
    expect(hitNames).toContain("tube-right-wall-IC-RAIL-01");
  });
});

describe("IC Tube / Rail cross-context consistency", () => {
  it("resolves the same structure, instance and bounds as child, direct view and published view", () => {
    const child = makeRailChild();
    const builder = resolveChildSpatialRepresentation(child);
    const details = resolveSpatialRepresentation({
      location: child.location,
      model: RAIL_MODEL,
    });
    const published = resolveSpatialRepresentation({
      location: child.location,
      model: RAIL_MODEL,
      mapping: { publishedLayout: null },
    });
    expect(builder.structure).toBe("tube");
    expect(details.structure).toBe("tube");
    expect(published.structure).toBe("tube");
    expect(details.modelInstance).toEqual(builder.modelInstance);
    expect(published.modelInstance).toEqual(builder.modelInstance);

    const childMesh = createChildCompartmentMesh(toSceneChild(child), "empty-mapped");
    const detailsMesh = createParentCarcassMesh(
      {
        location: child.location,
        node: null,
        model: RAIL_MODEL,
        mapping: null,
        anchors: [],
      } as unknown as Parameters<typeof createParentCarcassMesh>[0],
      details.dimensions,
      { structure: details.structure },
    );
    // Compare the rail body itself; the shared front label plate is excluded.
    const railEnvelope = (group: THREE.Object3D) => {
      group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const mesh of meshes(group)) {
        if (mesh.name.startsWith("tube-")) box.expandByObject(mesh);
      }
      return box.getSize(new THREE.Vector3());
    };
    const childSize = railEnvelope(childMesh);
    const detailsSize = railEnvelope(detailsMesh);
    expect(childSize.x).toBeCloseTo(detailsSize.x, 6);
    expect(childSize.y).toBeCloseTo(detailsSize.y, 6);
    expect(childSize.z).toBeCloseTo(detailsSize.z, 6);
    expect(detailsSize.x).toBeCloseTo(RAIL_DIMS.x, 6);
    expect(detailsSize.y).toBeCloseTo(RAIL_DIMS.y, 6);
    expect(detailsSize.z).toBeCloseTo(RAIL_DIMS.z, 6);
  });

  it("legacy tube and canonical ic_tube_rail kinds render the same geometry", () => {
    const legacy = resolveSpatialRepresentation({
      location: { id: "legacy", kind: "tube" },
      model: RAIL_MODEL,
    });
    const canonical = resolveSpatialRepresentation({
      location: { id: "legacy", kind: "ic_tube_rail" },
      model: RAIL_MODEL,
    });
    expect(legacy.structure).toBe(canonical.structure);
    expect(legacy.modelInstance).toEqual(canonical.modelInstance);
  });
});
