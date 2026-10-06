import { describe, expect, it } from "vitest";
import {
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
  BUILDER_PRESET_DEFINITIONS,
  SPATIAL_CATEGORY_DEFINITIONS,
  canContainLocation,
  canContainLocationWithinHierarchy,
  createSpatialEnvelope,
  createSpatialModelInstance,
  generateContainmentGrid,
  resolveBuilderRootCategories,
  resolveContainingCategories,
  validateContainmentLayout,
} from "./location-model";

describe("canonical spatial location model", () => {
  it("keeps spatial context outside physical model roots and registers each physical category", () => {
    expect(SPATIAL_CATEGORY_DEFINITIONS.warehouse.root).toBe("no");
    expect(SPATIAL_CATEGORY_DEFINITIONS.room_area.root).toBe("no");
    expect(Object.keys(CANONICAL_SPATIAL_MODEL_DEFINITIONS)).toHaveLength(11);
    expect(resolveBuilderRootCategories("GRID_PARTS_TRAY")).toEqual([
      "matrix_tray",
    ]);
  });

  it("derives containment and reverse candidates from one graph", () => {
    expect(canContainLocation("cabinet", "drawer")).toBe(true);
    expect(canContainLocation("cabinet", "bin")).toBe(false);
    expect(canContainLocationWithinHierarchy("cabinet", "bin")).toBe(true);
    expect(resolveContainingCategories("drawer")).toEqual([
      "cabinet",
      "dry_cabinet",
    ]);
  });

  it("binds every Builder preset to one registered physical root model", () => {
    for (const preset of Object.values(BUILDER_PRESET_DEFINITIONS)) {
      const category = SPATIAL_CATEGORY_DEFINITIONS[preset.rootCategory];
      const model =
        CANONICAL_SPATIAL_MODEL_DEFINITIONS[
          preset.rootCategory as keyof typeof CANONICAL_SPATIAL_MODEL_DEFINITIONS
        ];
      expect(category.classification).toBe("physical");
      expect(category.root).toBe("yes");
      expect(category.modelId).toBe(model.modelId);
      expect(model.displayName).toBe(`${category.displayName} Model`);
    }
    expect(BUILDER_PRESET_DEFINITIONS.SMD_DRAWER_CABINET.rootCategory).toBe(
      "cabinet",
    );
    expect(BUILDER_PRESET_DEFINITIONS.OPEN_BIN_MATRIX.rootCategory).toBe("bin");
    expect(BUILDER_PRESET_DEFINITIONS.DRY_CABINET.rootCategory).toBe("dry_cabinet");
    expect(resolveBuilderRootCategories("DRY_CABINET")).toEqual(["dry_cabinet"]);
    expect(canContainLocation("dry_cabinet", "matrix_tray")).toBe(true);
    expect(canContainLocation("dry_cabinet", "bin")).toBe(false);
  });

  it("keeps custom dimensions on an instance and rejects invalid child layouts", () => {
    const created = createSpatialModelInstance("drawer-1", "Drawer", {
      widthMm: 500,
      heightMm: 100,
      depthMm: 400,
    });
    expect(created.valid).toBe(true);
    if (created.valid) {
      expect(Object.isFrozen(created.instance)).toBe(true);
      expect(Object.isFrozen(created.instance.dimensions)).toBe(true);
    }
    expect(
      createSpatialEnvelope(
        { widthMm: 500, heightMm: 100, depthMm: 400 },
        { widthMm: 480, heightMm: 80, depthMm: 380 },
      ),
    ).not.toBeNull();
    const issues = validateContainmentLayout(
      "drawer",
      { widthMm: 480, heightMm: 80, depthMm: 380 },
      [
        {
          category: "bin",
          dimensions: { widthMm: 100, heightMm: 50, depthMm: 100 },
          position: { x: 0, y: 25, z: 0 },
        },
        {
          category: "matrix_tray",
          dimensions: { widthMm: 100, heightMm: 50, depthMm: 100 },
          position: { x: 0, y: 25, z: 0 },
        },
      ],
    );
    expect(issues.some((issue) => issue.code === "OVERLAP")).toBe(true);
  });

  it("lays Drawer bins out from its clear interior and rejects an oversized grid", () => {
    const result = generateContainmentGrid(
      "drawer",
      { widthMm: 480, heightMm: 80, depthMm: 380 },
      {
        childCategory: "bin",
        childDimensions: { widthMm: 100, heightMm: 50, depthMm: 100 },
        rows: 2,
        columns: 4,
        spacingMm: 10,
      },
    );
    expect(result.items).toHaveLength(8);
    expect(result.issues).toEqual([]);
    const oversized = generateContainmentGrid(
      "drawer",
      { widthMm: 180, heightMm: 80, depthMm: 100 },
      {
        childCategory: "bin",
        childDimensions: { widthMm: 100, heightMm: 50, depthMm: 100 },
        rows: 1,
        columns: 2,
        spacingMm: 10,
      },
    );
    expect(oversized.issues.some((issue) => issue.code === "CONTAINMENT")).toBe(
      true,
    );
  });
});
