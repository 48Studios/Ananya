import { describe, expect, it } from "vitest";
import {
  CANONICAL_SPATIAL_MODEL_DEFINITIONS,
  BUILDER_PRESET_DEFINITIONS,
  SPATIAL_CATEGORY_DEFINITIONS,
  canBePhysicalContainer,
  canContainLocation,
  canContainLocationWithinHierarchy,
  canRootPhysicalEquipment,
  classifyLocationHierarchyRelationship,
  createSpatialEnvelope,
  createSpatialModelInstance,
  explainPhysicalContainmentRejection,
  generateContainmentGrid,
  isContextRootCategory,
  isPhysicalRootCategory,
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

  it("identifies context roots capable of owning physical equipment", () => {
    // The three space categories that root physical equipment in the product.
    for (const category of ["warehouse", "room_area", "aisle"] as const) {
      expect(isContextRootCategory(category)).toBe(true);
      expect(canRootPhysicalEquipment(category)).toBe(true);
    }
    // Legacy aliases resolve to their canonical context category.
    expect(isContextRootCategory("room")).toBe(true);
    expect(isContextRootCategory("area")).toBe(true);
    expect(isContextRootCategory(" Room ")).toBe(true);
    // Every physical category is not a context root.
    for (const category of [
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
    ] as const) {
      expect(isContextRootCategory(category)).toBe(false);
      expect(canRootPhysicalEquipment(category)).toBe(false);
    }
    // Unknown / empty values are not context roots.
    for (const value of ["pallet", "zone", "", null, undefined]) {
      expect(isContextRootCategory(value)).toBe(false);
    }
  });

  it("keeps the context-root predicate independent of the containment graph", () => {
    // Context roots own NO allowedChildren: the predicate must not have added
    // physical children, or existing containment verdicts would change.
    for (const category of ["warehouse", "room_area", "aisle"] as const) {
      expect(SPATIAL_CATEGORY_DEFINITIONS[category].allowedChildren).toEqual([]);
      expect(canContainLocation(category, "cabinet")).toBe(false);
      expect(canContainLocation(category, "rack")).toBe(false);
      expect(canContainLocation(category, "shelf")).toBe(false);
    }
  });

  it("classifies location hierarchy relationships for the read-only audit", () => {
    // Canonical direct edges.
    const canonical = classifyLocationHierarchyRelationship("cabinet", "drawer");
    expect(canonical.kind).toBe("canonical");
    expect(canonical.canonical).toBe(true);
    expect(canonical.violation).toBe(false);

    // Context roots that own physical equipment.
    for (const parent of ["warehouse", "room_area", "aisle"]) {
      const context = classifyLocationHierarchyRelationship(parent, "cabinet");
      expect(context.kind).toBe("context-root");
      expect(context.contextRoot).toBe(true);
      expect(context.violation).toBe(false);
    }

    // Documented legacy compatibility pair (archived tray layout).
    const legacy = classifyLocationHierarchyRelationship("tray", "bin");
    expect(legacy.kind).toBe("legacy-compatible");
    expect(legacy.legacyCompatible).toBe(true);
    expect(legacy.violation).toBe(false);

    // Genuine violations: physical → non-child, inverted nesting, unknown kinds.
    const inverted = classifyLocationHierarchyRelationship("drawer", "cabinet");
    expect(inverted.kind).toBe("violation");
    expect(inverted.violation).toBe(true);
    expect(inverted.reason).toContain("not a canonical parent");

    const unknownParent = classifyLocationHierarchyRelationship("pallet", "bin");
    expect(unknownParent.kind).toBe("violation");
    expect(unknownParent.reason).toContain("Parent kind");

    const missing = classifyLocationHierarchyRelationship(null, "bin");
    expect(missing.kind).toBe("violation");
    expect(missing.reason).toContain("Parent kind");
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

/**
 * RFC-0069 Phase 2 — the canonical physical-containment predicate.
 *
 * `canBePhysicalContainer` is the SINGLE authority for whether one persisted
 * location may physically contain another. It must combine the canonical direct
 * graph with context-root ownership, and must NOT modify `allowedChildren`.
 */
describe("canBePhysicalContainer (RFC-0069)", () => {
  describe("isPhysicalRootCategory", () => {
    it("is true only for physical categories with root: yes", () => {
      const physicalRoots = [
        "rack",
        "shelf",
        "cabinet",
        "dry_cabinet",
        "bin",
        "drawer",
        "reel_rack",
        "matrix_tray",
      ];
      for (const category of physicalRoots) {
        expect(isPhysicalRootCategory(category)).toBe(true);
      }
      // Physical but NOT root: these must never sit directly in a context root.
      for (const category of ["compartment", "reel_slot"]) {
        expect(isPhysicalRootCategory(category)).toBe(false);
      }
      // Context categories are not physical roots.
      for (const category of ["warehouse", "room_area", "aisle"]) {
        expect(isPhysicalRootCategory(category)).toBe(false);
      }
      // Unknown / empty.
      for (const value of ["pallet", "zone", "", null, undefined]) {
        expect(isPhysicalRootCategory(value)).toBe(false);
      }
    });

    it("derives from the canonical definition, not a hard-coded list", () => {
      // Guard: the predicate's verdict must equal the canonical root flag for
      // every category, so it can never drift from the taxonomy.
      for (const category of [
        "warehouse",
        "room_area",
        "aisle",
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
      ] as const) {
        const definition = SPATIAL_CATEGORY_DEFINITIONS[category];
        expect(isPhysicalRootCategory(category)).toBe(
          definition.classification === "physical" && definition.root === "yes",
        );
      }
    });
  });

  describe("canonical direct containment", () => {
    it("accepts every canonical allowedChildren edge", () => {
      expect(canBePhysicalContainer("rack", "shelf")).toBe(true);
      expect(canBePhysicalContainer("cabinet", "drawer")).toBe(true);
      expect(canBePhysicalContainer("cabinet", "shelf")).toBe(true);
      expect(canBePhysicalContainer("dry_cabinet", "drawer")).toBe(true);
      expect(canBePhysicalContainer("dry_cabinet", "shelf")).toBe(true);
      expect(canBePhysicalContainer("dry_cabinet", "matrix_tray")).toBe(true);
      expect(canBePhysicalContainer("drawer", "bin")).toBe(true);
      expect(canBePhysicalContainer("drawer", "matrix_tray")).toBe(true);
      expect(canBePhysicalContainer("drawer", "compartment")).toBe(true);
      expect(canBePhysicalContainer("drawer", "ic_tube_rail")).toBe(true);
      expect(canBePhysicalContainer("shelf", "bin")).toBe(true);
      expect(canBePhysicalContainer("shelf", "matrix_tray")).toBe(true);
      expect(canBePhysicalContainer("shelf", "compartment")).toBe(true);
      expect(canBePhysicalContainer("shelf", "ic_tube_rail")).toBe(true);
      expect(canBePhysicalContainer("bin", "compartment")).toBe(true);
      expect(canBePhysicalContainer("matrix_tray", "compartment")).toBe(true);
      expect(canBePhysicalContainer("reel_rack", "reel_slot")).toBe(true);
    });
  });

  describe("context-root ownership", () => {
    it("lets a context root own a physical root category", () => {
      for (const contextRoot of ["warehouse", "room_area", "aisle"]) {
        for (const physicalRoot of [
          "rack",
          "cabinet",
          "shelf",
          "matrix_tray",
          "bin",
          "drawer",
          "dry_cabinet",
          "reel_rack",
        ]) {
          expect(canBePhysicalContainer(contextRoot, physicalRoot)).toBe(true);
        }
      }
    });

    it("lets a context root own another context root (facility → room → aisle)", () => {
      expect(canBePhysicalContainer("warehouse", "room_area")).toBe(true);
      expect(canBePhysicalContainer("warehouse", "aisle")).toBe(true);
      expect(canBePhysicalContainer("room_area", "aisle")).toBe(true);
    });

    it("resolves legacy context aliases through canonical normalization", () => {
      expect(canBePhysicalContainer("room", "cabinet")).toBe(true);
      expect(canBePhysicalContainer("area", "rack")).toBe(true);
      expect(canBePhysicalContainer("warehouse", " Room ")).toBe(true);
    });
  });

  describe("invalid relationships", () => {
    it("rejects a context root containing a non-root physical category", () => {
      // A compartment / reel_slot must sit inside a rack/shelf/drawer/bin, never
      // directly in a space.
      for (const contextRoot of ["warehouse", "room_area", "aisle"]) {
        expect(canBePhysicalContainer(contextRoot, "compartment")).toBe(false);
        expect(canBePhysicalContainer(contextRoot, "reel_slot")).toBe(false);
      }
    });

    it("rejects non-canonical physical pairings", () => {
      expect(canBePhysicalContainer("cabinet", "bin")).toBe(false);
      expect(canBePhysicalContainer("shelf", "shelf")).toBe(false);
      expect(canBePhysicalContainer("bin", "bin")).toBe(false);
      expect(canBePhysicalContainer("drawer", "drawer")).toBe(false);
      expect(canBePhysicalContainer("rack", "bin")).toBe(false);
      expect(canBePhysicalContainer("reel_rack", "drawer")).toBe(false);
      // A physical container cannot own a context category.
      expect(canBePhysicalContainer("cabinet", "room_area")).toBe(false);
      expect(canBePhysicalContainer("rack", "warehouse")).toBe(false);
    });

    it("rejects unknown kinds on either side", () => {
      expect(canBePhysicalContainer("pallet", "bin")).toBe(false);
      expect(canBePhysicalContainer("cabinet", "pallet")).toBe(false);
      expect(canBePhysicalContainer(null, "bin")).toBe(false);
      expect(canBePhysicalContainer("cabinet", undefined)).toBe(false);
    });
  });

  it("explains every rejection with a stable code", () => {
    expect(explainPhysicalContainmentRejection("cabinet", "drawer")).toBeNull();
    expect(
      explainPhysicalContainmentRejection("warehouse", "rack"),
    ).toBeNull();

    expect(
      explainPhysicalContainmentRejection("cabinet", "bin")?.code,
    ).toBe("NOT_PHYSICAL_ROOT");
    expect(
      explainPhysicalContainmentRejection("warehouse", "compartment")?.code,
    ).toBe("NOT_PHYSICAL_ROOT");
    expect(
      explainPhysicalContainmentRejection("cabinet", "room_area")?.code,
    ).toBe("CONTEXT_CHILD_NOT_ROOT");
    expect(
      explainPhysicalContainmentRejection("pallet", "bin")?.code,
    ).toBe("PARENT_UNKNOWN");
    expect(
      explainPhysicalContainmentRejection("cabinet", "pallet")?.code,
    ).toBe("CHILD_UNKNOWN");
  });

  it("never modifies allowedChildren", () => {
    // The whole point of the separate predicate: context roots must still have
    // NO canonical children, or existing containment verdicts would change.
    for (const contextRoot of ["warehouse", "room_area", "aisle"] as const) {
      expect(SPATIAL_CATEGORY_DEFINITIONS[contextRoot].allowedChildren).toEqual(
        [],
      );
    }
    // Direct-graph verdicts are unchanged by the new predicate.
    expect(canContainLocation("warehouse", "rack")).toBe(false);
    expect(canContainLocation("warehouse", "cabinet")).toBe(false);
    expect(canContainLocation("cabinet", "bin")).toBe(false);
    expect(canContainLocation("shelf", "shelf")).toBe(false);
  });
});
