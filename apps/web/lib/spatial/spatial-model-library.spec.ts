import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BUILDER_PRESET_DEFINITIONS,
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
} from "@ananya/inventory";
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
      "rack",
      "shelf",
      "cabinet",
      "dry_cabinet",
      "bin",
      "drawer",
      "compartment",
      "reel_rack",
      "reel_slot",
      "matrix_tray",
      "ic_tube_rail",
    ]);
    expect(SUPPORTED_CONTEXT_LOCATION_KINDS).toEqual([
      "warehouse",
      "room_area",
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

  it("reports the canonical model id for every live category, never a procedural id", () => {
    // Single source of truth: model identity comes from the domain model
    // foundation, exactly as category identity does. The web model table may
    // describe dimensions/structure, but it must not mint a competing id — a
    // location would otherwise report two different model ids depending on
    // whether a consumer read `SPATIAL_MODEL_DEFINITIONS` or
    // `CANONICAL_SPATIAL_MODEL_DEFINITIONS`.
    for (const category of SUPPORTED_PHYSICAL_LOCATION_KINDS) {
      const local = SPATIAL_MODEL_DEFINITIONS[category];
      expect(local, `table row ${category}`).toBeDefined();
      expect(local!.modelId).toBe(
        CANONICAL_SPATIAL_MODEL_DEFINITIONS[
          category as keyof typeof CANONICAL_SPATIAL_MODEL_DEFINITIONS
        ].modelId,
      );
      expect(local!.modelId).not.toContain("procedural-");
      // The public resolver must agree with the table entry.
      expect(resolveSpatialModel(category)?.modelId).toBe(local!.modelId);
    }
  });

  it("keeps legacy read-compatibility rows off the canonical identity namespace", () => {
    // Alias rows (`tray`, `tube`, `room`) map to a canonical category, so the
    // resolver returns the canonical row and never the legacy one; the legacy
    // row therefore keeps a local id that cannot be observed for a live kind.
    for (const legacy of ["tray", "tube", "room"]) {
      const resolved = resolveSpatialModel(legacy)!;
      // The legacy row's own id differs from the canonical id the resolver
      // reports for the same spelling.
      expect(SPATIAL_MODEL_DEFINITIONS[legacy]?.modelId).not.toBe(
        resolved.modelId,
      );
      expect(resolved).not.toBe(SPATIAL_MODEL_DEFINITIONS[legacy]);
    }
    // `slot` has NO canonical category, so it is the single identity for that
    // kind: it is reachable and keeps a local id (nothing to compete with).
    expect(resolveSpatialModel("slot")).toBe(SPATIAL_MODEL_DEFINITIONS.slot);
    expect(SPATIAL_MODEL_DEFINITIONS.slot?.modelId).toContain("procedural-");
  });

  it("resolves a Builder template model to the same identity as the model resolver", () => {
    // The Builder preview must not mint its own model id either: a location
    // rendered as a Builder root and the same location rendered directly have
    // to report one model identity.
    for (const preset of Object.values(BUILDER_PRESET_DEFINITIONS)) {
      const viaTemplate = resolveTemplateSpatialModel(preset.type);
      const viaResolver = resolveSpatialModel(preset.rootCategory);
      expect(viaTemplate?.modelId).toBe(viaResolver?.modelId);
      expect(viaTemplate?.modelId).toBe(
        CANONICAL_SPATIAL_MODEL_DEFINITIONS[
          preset.rootCategory as keyof typeof CANONICAL_SPATIAL_MODEL_DEFINITIONS
        ].modelId,
      );
    }
    // A template whose root kind does not match the requested root resolves to
    // null (unchanged contract).
    expect(resolveTemplateSpatialModel("SMD_DRAWER_CABINET", "rack")).toBeNull();
    expect(resolveTemplateSpatialModel("unknown-template")).toBeNull();
  });

  it("normalizes location kind aliases through the canonical resolver", () => {
    expect(resolveSpatialModel("Dry Cabinet")?.modelId).toBe(
      SPATIAL_MODEL_DEFINITIONS.dry_cabinet?.modelId,
    );
    expect(resolveSpatialModel("reel-rack")?.structure).toBe("reel-rack");
  });

  it("resolves every alias of a category to exactly one canonical identity", () => {
    const matrixTray = SPATIAL_MODEL_DEFINITIONS.matrix_tray!;
    const icTubeRail = SPATIAL_MODEL_DEFINITIONS.ic_tube_rail!;
    const roomArea = SPATIAL_MODEL_DEFINITIONS.room_area!;

    // `tray` is a legacy alias for the canonical Matrix Tray category; it must
    // resolve to the canonical model identity, not the legacy `tray` row.
    for (const alias of ["tray", "Tray", "matrix_tray", "Matrix Tray"]) {
      const model = resolveSpatialModel(alias);
      expect(model?.modelId).toBe(matrixTray.modelId);
      expect(model?.kind).toBe(matrixTray.kind);
      expect(model?.structure).toBe("matrix-tray");
      expect(model?.isFallback).toBe(false);
    }

    // Every IC Tube / Rail spelling resolves to the same canonical model.
    for (const alias of [
      "tube",
      "Tube",
      "rail",
      "ic_tube",
      "ic_tube_rail",
      "IC Tube / Rail",
      "ic-tube/rail",
    ]) {
      const model = resolveSpatialModel(alias);
      expect(model?.modelId).toBe(icTubeRail.modelId);
      expect(model?.kind).toBe(icTubeRail.kind);
      expect(model?.structure).toBe("tube");
    }

    // Room aliases resolve to the canonical context category.
    for (const alias of ["room", "area", "room_area", "Room / Area"]) {
      const model = resolveSpatialModel(alias);
      expect(model?.modelId).toBe(roomArea.modelId);
      expect(model?.kind).toBe("room_area");
      expect(model?.category).toBe("context");
    }
  });

  it("never lets a legacy row shadow the canonical category resolution", () => {
    // Attack the old model-table-first lookup: `tray`/`tube` rows exist in the
    // table, but they must not be selectable by any input.
    expect(resolveSpatialModel("tray")?.modelId).not.toBe(
      SPATIAL_MODEL_DEFINITIONS.tray?.modelId,
    );
    expect(resolveSpatialModel("tube")?.modelId).not.toBe(
      SPATIAL_MODEL_DEFINITIONS.tube?.modelId,
    );
  });

  it("resolves a Dry Cabinet model instance from persisted dimensions", () => {
    const representation = resolveSpatialRepresentation({
      location: { id: "dry-cabinet-custom", kind: "dry_cabinet" },
      model: {
        id: "dry-cabinet-model-custom",
        code: "MSD-CUSTOM",
        name: "Custom MSD cabinet",
        format: "PROCEDURAL",
        widthMm: 940,
        heightMm: 1970,
        depthMm: 640,
        isActive: true,
        metadata: {},
      },
    });
    expect(representation.source).toBe("model");
    expect(representation.modelInstance).toMatchObject({
      category: "dry_cabinet",
      modelId: "dry_cabinet-model",
      dimensions: { widthMm: 940, heightMm: 1970, depthMm: 640 },
    });
    expect(representation.dimensions.x).toBeCloseTo(0.94, 10);
    expect(representation.dimensions.y).toBeCloseTo(1.97, 10);
    expect(representation.dimensions.z).toBeCloseTo(0.64, 10);
    expect(representation.structure).toBe("dry-cabinet");
  });

  it("resolves Rack and Shelf instances from their canonical category and persisted dimensions", () => {
    const rack = resolveSpatialRepresentation({
      location: { id: "rack-custom", kind: "rack" },
      model: {
        id: "rack-model-custom",
        code: "RACK-CUSTOM",
        name: "Rack custom model",
        format: "PROCEDURAL",
        widthMm: 1200,
        heightMm: 2200,
        depthMm: 600,
        isActive: true,
        metadata: {},
      },
    });
    const shelf = resolveSpatialRepresentation({
      location: { id: "shelf-custom", kind: "shelf" },
      model: {
        id: "shelf-model-custom",
        code: "SHELF-CUSTOM",
        name: "Shelf custom model",
        format: "PROCEDURAL",
        widthMm: 1100,
        heightMm: 40,
        depthMm: 550,
        isActive: true,
        metadata: {},
      },
    });

    expect(rack.modelInstance?.category).toBe("rack");
    expect(rack.dimensions).toEqual({ x: 1.2, y: 2.2, z: 0.6 });
    expect(shelf.modelInstance?.category).toBe("shelf");
    expect(shelf.dimensions).toEqual({ x: 1.1, y: 0.04, z: 0.55 });
    expect(resolveSpatialModel("shelf")?.structure).toBe("shelf");
  });

  it("renders Shelf as a physical deck within exact custom dimensions", () => {
    const dimensions = { x: 1.1, y: 0.04, z: 0.55 };
    const mesh = createStructureBodyMesh("shelf", dimensions, {
      locationId: "shelf-custom",
      locationCode: "SHELF-CUSTOM",
      locationName: "Shelf custom",
      kind: "shelf",
      hasStock: false,
      isMapped: true,
    });
    mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(dimensions.x, 6);
    expect(size.y).toBeCloseTo(dimensions.y, 6);
    expect(size.z).toBeCloseTo(dimensions.z, 6);
    expect(mesh.children.some((child) => child instanceof THREE.Mesh)).toBe(true);
  });

  it("renders the Rack frame and authored shelf support levels within exact bounds", () => {
    const dimensions = { x: 1.2, y: 2.2, z: 0.6 };
    const mesh = createStructureBodyMesh(
      "rack",
      dimensions,
      {
        locationId: "rack-custom",
        locationCode: "RACK-CUSTOM",
        locationName: "Rack custom",
        kind: "rack",
        hasStock: false,
        isMapped: true,
      },
      { postWidthMm: 50, beamHeightMm: 40, shelfLevels: 4 },
    );
    mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const structuralMembers = mesh.children.filter(
      (child) => child instanceof THREE.Mesh,
    );
    expect(size.x).toBeCloseTo(dimensions.x, 6);
    expect(size.y).toBeCloseTo(dimensions.y, 6);
    expect(size.z).toBeCloseTo(dimensions.z, 6);
    // Four posts, four perimeter rails, and two support beams at each level.
    expect(structuralMembers).toHaveLength(16);
  });

  it.each([
    ["reel-rack", { x: 1.25, y: 2.05, z: 0.52 }],
    ["reel-slot", { x: 0.16, y: 0.18, z: 0.14 }],
  ] as const)("renders custom %s geometry at its declared physical bounds", (structure, dimensions) => {
    const mesh = createStructureBodyMesh(structure, dimensions, {
      locationId: `custom-${structure}`,
      locationCode: structure.toUpperCase(),
      locationName: structure,
      kind: structure,
      hasStock: false,
      isMapped: true,
    }, { reelRows: 3, reelSlotSpacingMm: 12 });
    mesh.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(dimensions.x, 6);
    expect(size.y).toBeCloseTo(dimensions.y, 6);
    expect(size.z).toBeCloseTo(dimensions.z, 6);
    expect(mesh.children.filter((child) => child instanceof THREE.Mesh).length).toBeGreaterThan(2);
  });

  it.each([
    ["matrix-tray", { x: 0.3, y: 0.025, z: 0.2 }],
    ["compartment", { x: 0.045, y: 0.02, z: 0.035 }],
  ] as const)("renders canonical %s geometry at custom dimensions", (structure, dimensions) => {
    const mesh = createStructureBodyMesh(structure, dimensions, {
      locationId: `custom-${structure}`, locationCode: structure,
      locationName: structure, kind: structure, hasStock: false, isMapped: true,
    }, { wallThicknessMm: 2, gridRows: 4, gridColumns: 6, gridDividerThicknessMm: 2 });
    mesh.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(dimensions.x, 6);
    expect(size.y).toBeCloseTo(dimensions.y, 6);
    expect(size.z).toBeCloseTo(dimensions.z, 6);
    expect(mesh.children.filter((child) => child instanceof THREE.Mesh).length).toBeGreaterThan(4);
  });

  it.each([
    ["SMD_DRAWER_CABINET", "cabinet", "enclosure"],
    ["OPEN_BIN_MATRIX", "bin", "tray"],
    ["PALLET_RACK", "rack", "rack"],
    ["GRID_PARTS_TRAY", "matrix_tray", "matrix-tray"],
    ["REEL_RACK", "reel_rack", "reel-rack"],
  ] as const)(
    "resolves preset %s through its canonical %s root model",
    (templateType, rootKind, structure) => {
      const model = resolveTemplateSpatialModel(templateType, rootKind);
      expect(model).toBeTruthy();
      expect(model?.isFallback).toBe(false);
      expect(model?.structure).toBe(structure);
    },
  );

  it("rejects a preset model lookup for a different physical root category", () => {
    expect(
      resolveTemplateSpatialModel("OPEN_BIN_MATRIX", "cabinet"),
    ).toBeNull();
  });
});
