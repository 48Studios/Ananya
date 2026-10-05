import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SPATIAL_MODEL_DEFINITIONS,
  SUPPORTED_CONTEXT_LOCATION_KINDS,
  SUPPORTED_PHYSICAL_LOCATION_KINDS,
  resolveSpatialModel,
  resolveTemplateSpatialModel,
} from "./spatial-model-library";
import {
  SPATIAL_GROUND_PLANE_Y_METERS,
  resolveObjectDimensions,
  resolveSpatialRepresentation,
} from "./spatial-3d-layout";
import {
  createStructureBodyMesh,
  groundObjectOnFloor,
} from "./spatial-3d-scene";

describe("Spatial Model Library", () => {
  it("registers the authoritative physical and context taxonomy", () => {
    expect(SUPPORTED_PHYSICAL_LOCATION_KINDS).toEqual([
      "cabinet",
      "dry_cabinet",
      "rack",
      "shelf",
      "reel_rack",
      "drawer",
      "bin",
      "tray",
      "tube",
      "reel_slot",
      "compartment",
      "slot",
    ]);
    expect(SUPPORTED_CONTEXT_LOCATION_KINDS).toEqual([
      "warehouse",
      "building",
      "facility",
      "room",
      "zone",
      "aisle",
    ]);
  });

  it.each(SUPPORTED_PHYSICAL_LOCATION_KINDS)(
    "resolves %s to valid non-fallback metadata and geometry",
    (kind) => {
      const definition = resolveSpatialModel(kind);
      expect(definition).not.toBeNull();
      expect(definition?.category).toBe("physical");
      expect(definition?.isFallback).toBe(false);
      expect(definition?.geometryGenerator).toBe("canonical-procedural");
      expect(definition?.groundReference).toBe("ground-plane");

      const dimensions = resolveObjectDimensions(null, null, kind);
      expect(dimensions.x).toBeGreaterThan(0);
      expect(dimensions.y).toBeGreaterThan(0);
      expect(dimensions.z).toBeGreaterThan(0);
      expect(definition?.bounds.min.x).toBeLessThan(
        definition?.bounds.max.x ?? 0,
      );

      expect(definition?.bounds.min.y).toBeLessThan(
        definition?.bounds.max.y ?? 0,
      );

      expect(definition?.bounds.min.z).toBeLessThan(
        definition?.bounds.max.z ?? 0,
      );

      const representation = resolveSpatialRepresentation({
        location: { id: `loc-${kind}`, kind },
      });
      expect(representation.source).toBe("kind");
      expect(representation.source).not.toBe("fallback");
      expect(representation.structure).not.toBe("none");

      const mesh = createStructureBodyMesh(
        representation.structure,
        dimensions,
        {
          locationId: `loc-${kind}`,
          locationCode: kind.toUpperCase(),
          locationName: definition?.displayName ?? kind,
          kind,
          hasStock: false,
          isMapped: true,
          isParent: true,
          representationSource: representation.source,
        },
      );

      expect(mesh.children.length).toBeGreaterThan(0);
    },
  );

  it.each(SUPPORTED_PHYSICAL_LOCATION_KINDS)(
    "keeps %s procedural geometry inside its declared centered bounds",
    (kind) => {
      const definition = resolveSpatialModel(kind)!;
      const dimensions = {
        x: definition.dimensionsMm.widthMm / 1000,
        y: definition.dimensionsMm.heightMm / 1000,
        z: definition.dimensionsMm.depthMm / 1000,
      };
      const mesh = createStructureBodyMesh(definition.structure, dimensions, {
        locationId: `bounds-${kind}`,
        locationCode: kind.toUpperCase(),
        locationName: definition.displayName,
        kind,
        hasStock: false,
        isMapped: true,
        isParent: true,
      });
      mesh.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(mesh);
      const epsilon = 0.0005;
      expect(bounds.min.x).toBeGreaterThanOrEqual(-dimensions.x / 2 - epsilon);
      expect(bounds.max.x).toBeLessThanOrEqual(dimensions.x / 2 + epsilon);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-dimensions.y / 2 - epsilon);
      expect(bounds.max.y).toBeLessThanOrEqual(dimensions.y / 2 + epsilon);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-dimensions.z / 2 - epsilon);
      expect(bounds.max.z).toBeLessThanOrEqual(dimensions.z / 2 + epsilon);
    },
  );

  it.each(SUPPORTED_PHYSICAL_LOCATION_KINDS)(
    "grounds %s from its actual procedural bounds without changing dimensions",
    (kind) => {
      const definition = resolveSpatialModel(kind)!;
      const dimensions = {
        x: definition.dimensionsMm.widthMm / 1000,
        y: definition.dimensionsMm.heightMm / 1000,
        z: definition.dimensionsMm.depthMm / 1000,
      };
      const mesh = createStructureBodyMesh(definition.structure, dimensions, {
        locationId: `ground-${kind}`,
        locationCode: kind.toUpperCase(),
        locationName: definition.displayName,
        kind,
        hasStock: false,
        isMapped: true,
        isParent: true,
      });
      const before = new THREE.Box3().setFromObject(mesh);
      const correction = groundObjectOnFloor(
        mesh,
        SPATIAL_GROUND_PLANE_Y_METERS,
        0,
      );
      const after = new THREE.Box3().setFromObject(mesh);
      const beforeSize = before.getSize(new THREE.Vector3());
      const afterSize = after.getSize(new THREE.Vector3());

      expect(before.min.y).toBeLessThan(0);
      expect(after.min.y).toBeCloseTo(SPATIAL_GROUND_PLANE_Y_METERS, 6);
      expect(afterSize.x).toBeCloseTo(beforeSize.x, 6);
      expect(afterSize.y).toBeCloseTo(beforeSize.y, 6);
      expect(afterSize.z).toBeCloseTo(beforeSize.z, 6);
      expect(correction).toBeGreaterThan(0);
    },
  );

  it("does not resolve unknown kinds as physical models", () => {
    expect(resolveSpatialModel("unknown_future_kind")).toBeNull();
    expect(
      resolveSpatialRepresentation({
        location: { id: "unknown", kind: "unknown_future_kind" },
      }).source,
    ).toBe("fallback");
  });

  it("normalizes location kind aliases through the canonical resolver", () => {
    expect(resolveSpatialModel("Dry Cabinet")?.modelId).toBe(
      SPATIAL_MODEL_DEFINITIONS.dry_cabinet?.modelId,
    );
    expect(resolveSpatialModel("reel-rack")?.structure).toBe("reel-rack");
  });

  it.each([
    ["SMD_DRAWER_CABINET", "cabinet", "enclosure"],
    ["OPEN_BIN_MATRIX", "dry_cabinet", "dry-cabinet"],
    ["PALLET_RACK", "reel_rack", "reel-rack"],
    ["GRID_PARTS_TRAY", "tray", "tray"],
  ] as const)(
    "resolves template %s through the canonical %s model family",
    (templateType, rootKind, structure) => {
      const model = resolveTemplateSpatialModel(templateType, rootKind);
      expect(model?.isFallback).toBe(false);
      expect(model?.structure).toBe(structure);
    },
  );
});
