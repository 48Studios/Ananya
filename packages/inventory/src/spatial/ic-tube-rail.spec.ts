import { describe, expect, it } from "vitest";
import {
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
  SPATIAL_CATEGORY_DEFINITIONS,
  SPATIAL_LOCATION_CATEGORIES,
  canContainLocation,
  canContainLocationWithinHierarchy,
  createSpatialModelInstance,
  normalizeLocationCategory,
  resolveBuilderRootCategories,
  resolveContainingCategories,
  validateContainmentLayout,
} from "./location-model";
import {
  checkSpatialMappingCompatibility,
  resolveTemplateTypesForRootKind,
} from "./spatial-compatibility";

describe("IC Tube / Rail canonical category", () => {
  it.each(["ic_tube_rail", "IC Tube / Rail", "tube", "rail", "ic-tube"])(
    "normalizes %s to ic_tube_rail",
    (kind) => {
      expect(normalizeLocationCategory(kind)).toBe("ic_tube_rail");
    },
  );

  it("is a terminal physical model with no clear interior", () => {
    const definition = SPATIAL_CATEGORY_DEFINITIONS.ic_tube_rail;
    expect(definition).toMatchObject({
      category: "ic_tube_rail",
      modelId: "ic_tube_rail-model",
      displayName: "IC Tube / Rail",
      classification: "physical",
      container: "no",
    });
    expect(definition.allowedChildren).toEqual([]);
    expect(CANONICAL_SPATIAL_MODEL_DEFINITIONS.ic_tube_rail).toMatchObject({
      modelId: "ic_tube_rail-model",
      hasClearInterior: false,
    });
  });

  it.each(SPATIAL_LOCATION_CATEGORIES)("cannot contain %s", (child) => {
    expect(canContainLocation("ic_tube_rail", child)).toBe(false);
    expect(canContainLocationWithinHierarchy("ic_tube_rail", child)).toBe(false);
  });

  it("is directly contained only by Shelf and Drawer", () => {
    expect(resolveContainingCategories("ic_tube_rail")).toEqual([
      "shelf",
      "drawer",
    ]);
    expect(canContainLocation("shelf", "ic_tube_rail")).toBe(true);
    expect(canContainLocation("drawer", "ic_tube_rail")).toBe(true);
    for (const parent of ["cabinet", "rack", "dry_cabinet", "bin", "matrix_tray", "reel_rack"]) {
      expect(canContainLocation(parent, "ic_tube_rail")).toBe(false);
    }
    // Reachable deeper through Rack → Shelf and Cabinet → Drawer/Shelf.
    expect(canContainLocationWithinHierarchy("rack", "ic_tube_rail")).toBe(true);
    expect(canContainLocationWithinHierarchy("cabinet", "ic_tube_rail")).toBe(true);
  });

  it("keeps persisted custom dimensions on a frozen instance", () => {
    const created = createSpatialModelInstance("rail-1", "ic_tube_rail", {
      widthMm: 60,
      heightMm: 30,
      depthMm: 540,
    });
    expect(created.valid).toBe(true);
    if (!created.valid) return;
    expect(created.instance).toEqual({
      locationId: "rail-1",
      category: "ic_tube_rail",
      modelId: "ic_tube_rail-model",
      dimensions: { widthMm: 60, heightMm: 30, depthMm: 540 },
    });
    expect(Object.isFrozen(created.instance.dimensions)).toBe(true);
    expect(
      createSpatialModelInstance("rail-1", "ic_tube_rail", {
        widthMm: 0,
        heightMm: 30,
        depthMm: 540,
      }).valid,
    ).toBe(false);
  });

  it("rejects any child layout inside a rail", () => {
    const issues = validateContainmentLayout(
      "ic_tube_rail",
      { widthMm: 50, heightMm: 25, depthMm: 520 },
      [
        {
          category: "compartment",
          dimensions: { widthMm: 10, heightMm: 10, depthMm: 10 },
          position: { x: 0, y: 5, z: 0 },
        },
      ],
    );
    expect(issues.some((issue) => issue.code === "CONTAINMENT")).toBe(true);
  });

  it.each(["compartment", "bin", "ic_tube_rail", "reel_slot"])(
    "rejects mapping %s into an IC Tube / Rail",
    (candidateKind) => {
      const verdict = checkSpatialMappingCompatibility({
        rootKind: "ic_tube_rail",
        candidateKind,
        slotKind: "slot",
      });
      expect(verdict.compatible).toBe(false);
      expect(verdict.code).toBe("SLOT_KIND");
    },
  );

  it.each([
    ["shelf", "slot"],
    ["drawer", "drawer"],
  ] as const)("allows mapping a rail into a %s", (rootKind, slotKind) => {
    expect(
      checkSpatialMappingCompatibility({
        rootKind,
        candidateKind: "ic_tube_rail",
        slotKind,
      }).compatible,
    ).toBe(true);
  });

  it("is root-capable in the taxonomy but has no Builder preset", () => {
    expect(SPATIAL_CATEGORY_DEFINITIONS.ic_tube_rail.root).toBe("yes");
    expect(resolveBuilderRootCategories()).toContain("ic_tube_rail");
    expect(resolveTemplateTypesForRootKind("ic_tube_rail")).toEqual([]);
  });
});
