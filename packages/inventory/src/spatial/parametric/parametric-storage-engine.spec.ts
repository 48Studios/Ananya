import { describe, expect, it } from "vitest";
import {
  generateStorageCompartments,
  validateParametricConfig,
  diffParametricCompartments,
  assertCompartmentsWithinBounds,
  assertNoCompartmentOverlaps,
  GEOMETRY_TOLERANCE_MM,
  createDefaultSmdCabinetConfig,
  createDefaultOpenBinMatrixConfig,
  createDefaultPalletRackConfig,
  createDefaultGridPartsTrayConfig,
  createDefaultReelRackConfig,
  createDefaultDryCabinetConfig,
} from "./parametric-storage-engine";
import {
  InvalidParametricDimensionError,
  ParametricGeometryOutOfBoundsError,
  ParametricGeometryOverlapError,
} from "./parametric-storage.errors";
import type {
  SmdDrawerCabinetConfig,
  OpenBinMatrixConfig,
  PalletRackConfig,
  GridPartsTrayConfig,
  GeneratedCompartment,
} from "./parametric-template.types";

describe("Parametric Storage Engine", () => {
  describe("Dry Cabinet preset", () => {
    it.each(["drawer", "shelf", "matrix_tray"] as const)("lays out canonical %s children inside its dimension-derived clear volume", (childCategory) => {
      const config = { ...createDefaultDryCabinetConfig(), dimensions: { widthMm: 940, heightMm: 1970, depthMm: 640 }, rows: 3, columns: 2, childCategory };
      const first = generateStorageCompartments(config);
      const second = generateStorageCompartments(config);
      expect(first.compartments).toHaveLength(6);
      expect(first.compartments).toEqual(second.compartments);
      expect(first.compartments.every((item) => item.kind === childCategory)).toBe(true);
      expect(first.outerDimensions).toEqual(config.dimensions);
      expect(first.usableDimensions).toEqual({ widthMm: 892, heightMm: 1922, depthMm: 616 });
      assertCompartmentsWithinBounds(first.compartments, first.outerDimensions);
      assertNoCompartmentOverlaps(first.compartments);
    });

    it("rejects noncanonical direct children", () => {
      const result = validateParametricConfig({ ...createDefaultDryCabinetConfig(), childCategory: "bin" as never });
      expect(result.isValid).toBe(false);
      expect(result.errors.join(" ")).toContain("canonical containment graph");
    });
  });
  describe("Reel Rack template", () => {
    it("generates deterministic Reel Slot positions within custom rack dimensions", () => {
      const config = {
        ...createDefaultReelRackConfig(),
        dimensions: { widthMm: 1250, heightMm: 2050, depthMm: 520 },
        rows: 3,
        columns: 4,
      };
      const first = generateStorageCompartments(config);
      const second = generateStorageCompartments(config);
      expect(first.compartments).toHaveLength(12);
      expect(first.compartments).toEqual(second.compartments);
      expect(first.compartments[0]).toMatchObject({
        kind: "reel_slot",
        code: "R1-C1",
      });
      expect(first.compartments[0]!.dimensions).toEqual(
        expect.objectContaining({ widthMm: expect.any(Number), depthMm: 450 }),
      );
      assertCompartmentsWithinBounds(first.compartments, first.outerDimensions);
      assertNoCompartmentOverlaps(first.compartments);
      for (const slot of first.compartments) {
        expect(slot.position.y - slot.dimensions.heightMm / 2).toBeGreaterThanOrEqual(0);
      }
    });

    it("rejects rows and columns that cannot fit between structural supports", () => {
      const config = { ...createDefaultReelRackConfig(), rows: 100, columns: 100 };
      expect(validateParametricConfig(config).isValid).toBe(false);
      expect(() => generateStorageCompartments(config)).toThrow();
    });
  });
  // ==========================================================================
  // 1. SMD Drawer Cabinet Template
  // ==========================================================================
  describe("SMD Drawer Cabinet Template (6x10 = 60 drawers)", () => {
    it("generates exactly 60 distinct drawer compartments", () => {
      const config = createDefaultSmdCabinetConfig();
      const result = generateStorageCompartments(config);

      expect(result.templateType).toBe("SMD_DRAWER_CABINET");
      expect(result.totalCompartments).toBe(60);
      expect(result.compartments).toHaveLength(60);
    });

    it("assigns standard alphanumeric codes from A01 to F10", () => {
      const config = createDefaultSmdCabinetConfig();
      const result = generateStorageCompartments(config);

      const first = result.compartments[0]!;
      expect(first.slotId).toBe("drawer_slot_r0_c0");
      expect(first.code).toBe("A01");
      expect(first.name).toBe("Drawer A01");
      expect(first.kind).toBe("drawer");
      expect(first.logicalIndex).toEqual({ row: 0, col: 0 });

      const tenth = result.compartments[9]!;
      expect(tenth.code).toBe("A10");
      expect(tenth.slotId).toBe("drawer_slot_r0_c9");

      const last = result.compartments[59]!;
      expect(last.slotId).toBe("drawer_slot_r5_c9");
      expect(last.code).toBe("F10");
      expect(last.name).toBe("Drawer F10");
    });

    it("distinguishes physical bounding dimensions from internal clear free space", () => {
      const config = createDefaultSmdCabinetConfig();
      const result = generateStorageCompartments(config);
      const first = result.compartments[0]!;

      // Physical outer bounding envelope includes carcass face and walls
      expect(first.dimensions.widthMm).toBeGreaterThan(0);
      expect(first.dimensions.heightMm).toBeGreaterThan(0);
      expect(first.dimensions.depthMm).toBeGreaterThan(0);

      // Internal clear free space is smaller due to drawer walls
      expect(first.clearDimensions.widthMm).toBeLessThan(first.dimensions.widthMm);
      expect(first.clearDimensions.heightMm).toBeLessThan(first.dimensions.heightMm);
      expect(first.clearDimensions.depthMm).toBeLessThan(first.dimensions.depthMm);
    });

    it("orients top-to-bottom so Row A has higher vertical Y than Row F", () => {
      const config = createDefaultSmdCabinetConfig();
      const result = generateStorageCompartments(config);

      const rowA01 = result.compartments.find((c) => c.code === "A01")!;
      const rowF01 = result.compartments.find((c) => c.code === "F01")!;

      expect(rowA01.position.y).toBeGreaterThan(rowF01.position.y);
    });

    it("ensures all 60 drawers fit strictly inside cabinet outer dimensions", () => {
      const config = createDefaultSmdCabinetConfig();
      const { compartments, outerDimensions } = generateStorageCompartments(config);

      for (const comp of compartments) {
        const halfW = comp.dimensions.widthMm / 2;
        const halfH = comp.dimensions.heightMm / 2;
        const halfD = comp.dimensions.depthMm / 2;

        expect(comp.position.x - halfW).toBeGreaterThanOrEqual(-0.05);
        expect(comp.position.x + halfW).toBeLessThanOrEqual(outerDimensions.widthMm + 0.05);

        expect(comp.position.y - halfH).toBeGreaterThanOrEqual(-0.05);
        expect(comp.position.y + halfH).toBeLessThanOrEqual(outerDimensions.heightMm + 0.05);

        expect(comp.position.z - halfD).toBeGreaterThanOrEqual(-0.05);
        expect(comp.position.z + halfD).toBeLessThanOrEqual(outerDimensions.depthMm + 0.05);
      }
    });

    it("handles repeating decimal divisions without false bounds or overlap errors (e.g. 100mm / 6 cols)", () => {
      const config: SmdDrawerCabinetConfig = {
        templateType: "SMD_DRAWER_CABINET",
        dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
        wallThicknessMm: 0,
        rows: 6,
        columns: 6,
        dividerThicknessMm: 0,
      };

      // 100 / 6 = 16.666... mm; must generate without throwing OutOfBounds or Overlap errors
      const result = generateStorageCompartments(config);
      expect(result.totalCompartments).toBe(36);
    });
  });

  // ==========================================================================
  // 2. Open Bin Matrix Template
  // ==========================================================================
  describe("Open Bin Matrix Template (5 tiers x 8 bins = 40 bins)", () => {
    it("generates exactly 40 bins with bin kind", () => {
      const config = createDefaultOpenBinMatrixConfig();
      const result = generateStorageCompartments(config);

      expect(result.templateType).toBe("OPEN_BIN_MATRIX");
      expect(result.totalCompartments).toBe(40);
      expect(result.compartments.every((c) => c.kind === "bin")).toBe(true);

      const first = result.compartments[0]!;
      expect(first.slotId).toBe("bin_slot_r0_c0");
      expect(first.code).toBe("A01");
      expect(first.name).toBe("Bin A01");

      const last = result.compartments[39]!;
      expect(last.slotId).toBe("bin_slot_r4_c7");
      expect(last.code).toBe("E08");
    });

    it("supports TIER_BIN_NUMERIC naming pattern", () => {
      const config = createDefaultOpenBinMatrixConfig();
      config.naming = {
        pattern: "TIER_BIN_NUMERIC",
        prefix: "BIN-",
        padDigits: 2,
      };
      const result = generateStorageCompartments(config);

      expect(result.compartments[0]!.code).toBe("BIN-T1-B01");
      expect(result.compartments[7]!.code).toBe("BIN-T1-B08");
      expect(result.compartments[8]!.code).toBe("BIN-T2-B01");
    });
  });

  // ==========================================================================
  // 3. Pallet Rack Template
  // ==========================================================================
  describe("Pallet Rack Template (4 levels x 2 bays = 8 shelf bays)", () => {
    it("generates 8 shelf bays with shelf kind", () => {
      const config = createDefaultPalletRackConfig();
      const result = generateStorageCompartments(config);

      expect(result.templateType).toBe("PALLET_RACK");
      expect(result.totalCompartments).toBe(8);
      expect(result.compartments.every((c) => c.kind === "shelf")).toBe(true);

      const first = result.compartments[0]!;
      expect(first.slotId).toBe("rack_bay_r0_c0");
      expect(first.code).toBe("L1-B1");
      expect(first.name).toBe("Shelf L1-B1");

      const last = result.compartments[7]!;
      expect(last.slotId).toBe("rack_bay_r3_c1");
      expect(last.code).toBe("L4-B2");
    });

    it("calculates level heights and upright post structural bounds", () => {
      const config = createDefaultPalletRackConfig();
      const { compartments, outerDimensions } = generateStorageCompartments(config);

      for (const comp of compartments) {
        expect(comp.dimensions.widthMm).toBeGreaterThan(500); // realistic bay width
        expect(comp.dimensions.heightMm).toBeGreaterThan(300); // realistic level height
        expect(comp.dimensions.depthMm).toBe(outerDimensions.depthMm);
        // For pallet rack, clear storage space equals clear bay opening
        expect(comp.clearDimensions.widthMm).toBe(comp.dimensions.widthMm);
        expect(comp.clearDimensions.heightMm).toBe(comp.dimensions.heightMm);
      }
    });

    it("uses consistent upright post width fallback across validation and generation", () => {
      const config: PalletRackConfig = {
        templateType: "PALLET_RACK",
        dimensions: { widthMm: 2400, heightMm: 3000, depthMm: 1100 },
        wallThicknessMm: 75,
        levels: 3,
        baysPerLevel: 2,
        // uprightPostWidthMm is left undefined; should fall back to wallThicknessMm (75)
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(true);

      const result = generateStorageCompartments(config);
      expect(result.totalCompartments).toBe(6);
    });
  });

  // ==========================================================================
  // 4. Grid Parts Tray Template
  // ==========================================================================
  describe("Grid Parts Tray Template (4 rows x 6 cols = 24 slots)", () => {
    it("generates 24 shallow tray slots", () => {
      const config = createDefaultGridPartsTrayConfig();
      const result = generateStorageCompartments(config);

      expect(result.templateType).toBe("GRID_PARTS_TRAY");
      expect(result.totalCompartments).toBe(24);
      expect(result.compartments.every((c) => c.kind === "compartment")).toBe(true);

      const first = result.compartments[0]!;
      expect(first.slotId).toBe("tray_compartment_r0_c0");
      expect(first.code).toBe("A01");
      expect(first.name).toBe("Compartment A01");

      const last = result.compartments[23]!;
      expect(last.slotId).toBe("tray_compartment_r3_c5");
      expect(last.code).toBe("D06");
    });

    it("lays out the custom 4 by 6 compartment grid inside the clear interior deterministically", () => {
      const config = { ...createDefaultGridPartsTrayConfig(), dimensions: { widthMm: 300, heightMm: 25, depthMm: 200 }, wallThicknessMm: 3, rows: 4, columns: 6, dividerThicknessMm: 2 };
      const result = generateStorageCompartments(config);
      expect(result.compartments).toHaveLength(24);
      expect(result.compartments).toEqual(generateStorageCompartments(config).compartments);
      expect(result.usableDimensions).toEqual({ widthMm: 294, heightMm: 22, depthMm: 197 });
      expect(result.compartments[0]!.dimensions).toEqual({ widthMm: 47.33, heightMm: 22, depthMm: 47.75 });
      expect(result.compartments[23]!.dimensions).toEqual({ widthMm: 47.33, heightMm: 22, depthMm: 47.75 });
      assertCompartmentsWithinBounds(result.compartments, result.outerDimensions);
      assertNoCompartmentOverlaps(result.compartments);
    });

    it.each([
      { rows: 200 },
      { columns: 300 },
      { dimensions: { widthMm: 20, heightMm: 25, depthMm: 200 } },
      { dimensions: { widthMm: 300, heightMm: 2, depthMm: 200 } },
      { dimensions: { widthMm: 300, heightMm: 25, depthMm: 4 } },
      { dividerThicknessMm: -1 },
      { dimensions: { widthMm: 0, heightMm: 25, depthMm: 200 } },
    ])("rejects malformed matrix tray configuration %#", (override) => {
      const config = { ...createDefaultGridPartsTrayConfig(), ...override } as GridPartsTrayConfig;
      expect(validateParametricConfig(config).isValid).toBe(false);
      expect(() => generateStorageCompartments(config)).toThrow(InvalidParametricDimensionError);
    });
  });

  // ==========================================================================
  // 5. Determinism & Purity
  // ==========================================================================
  describe("Determinism", () => {
    it("produces identical results for identical configurations", () => {
      const config = createDefaultSmdCabinetConfig();
      const run1 = generateStorageCompartments(config);
      const run2 = generateStorageCompartments(config);

      expect(run1).toEqual(run2);
    });

    it("generates unique codes and slotIds across all compartments in a configuration", () => {
      const config = createDefaultSmdCabinetConfig();
      const { compartments } = generateStorageCompartments(config);

      const codes = new Set(compartments.map((c) => c.code));
      expect(codes.size).toBe(compartments.length);

      const slotIds = new Set(compartments.map((c) => c.slotId));
      expect(slotIds.size).toBe(compartments.length);
    });
  });

  // ==========================================================================
  // 6. Zero Physical Overlap Invariant & Touching Face Semantics
  // ==========================================================================
  describe("Zero Physical Overlap", () => {
    it("verifies zero overlap across 60 compartments in a dense matrix", () => {
      const config = createDefaultSmdCabinetConfig();
      const { compartments } = generateStorageCompartments(config);

      for (let i = 0; i < compartments.length; i++) {
        const a = compartments[i]!;
        for (let j = i + 1; j < compartments.length; j++) {
          const b = compartments[j]!;

          const deltaX = Math.abs(a.position.x - b.position.x);
          const minSeparationX = (a.dimensions.widthMm + b.dimensions.widthMm) / 2;

          const deltaY = Math.abs(a.position.y - b.position.y);
          const minSeparationY = (a.dimensions.heightMm + b.dimensions.heightMm) / 2;

          // In 2D grid matrix, adjacent cells must be separated along X or along Y
          const separated =
            deltaX >= minSeparationX - 0.05 || deltaY >= minSeparationY - 0.05;
          expect(separated).toBe(true);
        }
      }
    });

    it("verifies that perfectly touching compartments with zero divider gap do NOT count as overlap", () => {
      const config: SmdDrawerCabinetConfig = {
        templateType: "SMD_DRAWER_CABINET",
        dimensions: { widthMm: 600, heightMm: 600, depthMm: 300 },
        wallThicknessMm: 10,
        rows: 2,
        columns: 2,
        dividerThicknessMm: 0, // Zero gap: adjacent compartments touch directly at boundary
      };

      // Touching faces must be valid and not throw an overlap error
      expect(() => generateStorageCompartments(config)).not.toThrow();
    });
  });

  // ==========================================================================
  // 7. Validation & Non-Finite Number Rejection
  // ==========================================================================
  describe("Configuration Validation", () => {
    it("rejects non-positive container dimensions", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: -100, heightMm: 500, depthMm: 200 },
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Width"))).toBe(true);

      expect(() => generateStorageCompartments(config)).toThrow(
        InvalidParametricDimensionError,
      );
    });

    it("rejects non-finite dimension values like Infinity and NaN", () => {
      const configInfinity: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: Infinity, heightMm: 500, depthMm: 200 },
      };
      const validationInf = validateParametricConfig(configInfinity);
      expect(validationInf.isValid).toBe(false);
      expect(validationInf.errors.some((e) => e.includes("finite"))).toBe(true);

      const configNaN: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: NaN, heightMm: 500, depthMm: 200 },
      };
      const validationNaN = validateParametricConfig(configNaN);
      expect(validationNaN.isValid).toBe(false);
    });

    it("rejects non-finite wall thickness or negative wall thickness", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        wallThicknessMm: Infinity,
      };
      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Wall thickness"))).toBe(true);
    });

    it("rejects wall thickness exceeding depth", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: 500, heightMm: 500, depthMm: 20 },
        wallThicknessMm: 25, // 25 >= 20 depth
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("depth"))).toBe(true);
    });

    it("rejects wall thickness exceeding outer dimensions", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
        wallThicknessMm: 60, // 2 * 60 = 120 > 100
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Perimeter walls"))).toBe(true);
    });

    it("rejects non-integer or zero row/column counts", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        rows: 0,
        columns: 3.5,
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Row count"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Column count"))).toBe(true);
    });

    it("rejects configuration when subdivisions exceed available space", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
        wallThicknessMm: 10,
        columns: 20,
        dividerThicknessMm: 5, // 19 * 5 = 95mm divider, internal width is only 80mm
      };

      const validation = validateParametricConfig(config);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("exceed available internal width"))).toBe(true);
    });
  });

  // ==========================================================================
  // 8. Dimensional Change Preservation & Identity Diffing
  // ==========================================================================
  describe("Stable Identity & Diffing Across Edits", () => {
    it("preserves stable slotIds when dimensions change without subdivision changes", () => {
      const configA = createDefaultSmdCabinetConfig(); // 600 x 900
      const configB: SmdDrawerCabinetConfig = {
        ...configA,
        dimensions: { widthMm: 800, heightMm: 1100, depthMm: 400 }, // Resized container
      };

      const resultA = generateStorageCompartments(configA);
      const resultB = generateStorageCompartments(configB);

      const diff = diffParametricCompartments(
        resultA.compartments,
        resultB.compartments,
      );

      // All 60 slots are retained (same slotId: slot_r0_c0 ... slot_r5_c9)
      expect(diff.retained).toHaveLength(60);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      // All 60 were modified in dimensions/position
      expect(diff.modified).toHaveLength(60);
      expect(diff.hasChanges).toBe(true);
      // Since all slots were retained and none added/removed, isStructuralChange is false
      expect(diff.isStructuralChange).toBe(false);

      // Verify specific slot maintained identity
      const slot0A = resultA.compartments[0]!;
      const slot0B = resultB.compartments[0]!;
      expect(slot0A.slotId).toBe(slot0B.slotId);
      expect(slot0A.code).toBe(slot0B.code);
      // Dimensions increased as expected
      expect(slot0B.dimensions.widthMm).toBeGreaterThan(slot0A.dimensions.widthMm);
    });

    it("detects removed compartments when rows/columns decrease (safety invariant)", () => {
      const config60 = createDefaultSmdCabinetConfig(); // 6 rows x 10 cols = 60
      const config40: SmdDrawerCabinetConfig = {
        ...config60,
        rows: 4, // reduced to 4 rows x 10 cols = 40
      };

      const result60 = generateStorageCompartments(config60);
      const result40 = generateStorageCompartments(config40);

      const diff = diffParametricCompartments(
        result60.compartments,
        result40.compartments,
      );

      expect(diff.retained).toHaveLength(40);
      expect(diff.added).toHaveLength(0);
      // Exactly 20 slots (rows 4 and 5) were removed
      expect(diff.removed).toHaveLength(20);
      expect(diff.removed.every((c) => c.slotId.includes("_r4_") || c.slotId.includes("_r5_"))).toBe(true);
      expect(diff.isStructuralChange).toBe(true);
    });

    it("detects added compartments when rows/columns increase", () => {
      const config40: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        rows: 4,
        columns: 10,
      };
      const config60 = createDefaultSmdCabinetConfig(); // 6 rows x 10 cols

      const result40 = generateStorageCompartments(config40);
      const result60 = generateStorageCompartments(config60);

      const diff = diffParametricCompartments(
        result40.compartments,
        result60.compartments,
      );

      expect(diff.retained).toHaveLength(40);
      expect(diff.added).toHaveLength(20);
      expect(diff.removed).toHaveLength(0);
      expect(diff.isStructuralChange).toBe(true);
    });
  });

  // ==========================================================================
  // 9. Naming Patterns & Customizations
  // ==========================================================================
  describe("Naming Patterns", () => {
    it("supports ROW_COL_NUMERIC pattern (R1-C1)", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        naming: {
          pattern: "ROW_COL_NUMERIC",
          prefix: "DRW-",
        },
      };
      const result = generateStorageCompartments(config);

      expect(result.compartments[0]!.code).toBe("DRW-R1-C1");
      expect(result.compartments[1]!.code).toBe("DRW-R1-C2");
      expect(result.compartments[10]!.code).toBe("DRW-R2-C1");
    });

    it("supports SEQUENTIAL pattern (01..60)", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        naming: {
          pattern: "SEQUENTIAL",
          prefix: "BOX-",
          padDigits: 3,
        },
      };
      const result = generateStorageCompartments(config);

      expect(result.compartments[0]!.code).toBe("BOX-001");
      expect(result.compartments[59]!.code).toBe("BOX-060");
    });

    it("supports bottom_to_top rowOrder", () => {
      const config: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        naming: {
          pattern: "ROW_COL_ALPHA_NUM",
          rowOrder: "bottom_to_top",
        },
      };
      const result = generateStorageCompartments(config);

      const rowA01 = result.compartments.find((c) => c.code === "A01")!;
      const rowF01 = result.compartments.find((c) => c.code === "F01")!;

      // With bottom_to_top, Row A is at the bottom (lower Y)
      expect(rowA01.position.y).toBeLessThan(rowF01.position.y);
    });
  });

  // ==========================================================================
  // 10. Geometry Tolerance & Precision Policy Verification
  // ==========================================================================
  describe("Geometry Tolerance & Precision Policy Verification", () => {
    function createMockCompartment(
      id: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ): GeneratedCompartment {
      return {
        slotId: `slot_${id}`,
        code: id,
        name: `Compartment ${id}`,
        kind: "slot",
        logicalIndex: { row: 0, col: 0 },
        position: { x, y, z },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { widthMm: w, heightMm: h, depthMm: d },
        clearDimensions: { widthMm: w, heightMm: h, depthMm: d },
        metadata: {
          templateType: "GRID_PARTS_TRAY",
          origin: "corner",
          row: 0,
          col: 0,
        },
      };
    }

    it("verifies compartments that exactly touch (zero gap) do not count as overlapping along X, Y, and Z", () => {
      // Touching along X: Box A [0, 50], Box B [50, 100]
      const touchX_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const touchX_B = createMockCompartment("B", 75, 25, 25, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([touchX_A, touchX_B])).not.toThrow();

      // Touching along Y: Box A [0, 50], Box B [50, 100]
      const touchY_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const touchY_B = createMockCompartment("B", 25, 75, 25, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([touchY_A, touchY_B])).not.toThrow();

      // Touching along Z: Box A [0, 50], Box B [50, 100]
      const touchZ_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const touchZ_B = createMockCompartment("B", 25, 25, 75, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([touchZ_A, touchZ_B])).not.toThrow();
    });

    it("verifies a genuine intersection smaller than 0.05mm (e.g. 0.02mm) is NOT silently accepted along X, Y, or Z", () => {
      // 0.02 mm intersection along X (representable in 0.01mm stored precision):
      // Box A center = 25 (right edge = 50.00), Box B center = 74.98 (left edge = 49.98).
      // Penetration = 50.00 - 49.98 = 0.02mm (< 0.05mm).
      const overlapX_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const overlapX_B = createMockCompartment("B", 74.98, 25, 25, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([overlapX_A, overlapX_B])).toThrow(
        ParametricGeometryOverlapError,
      );

      // 0.02 mm intersection along Y:
      const overlapY_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const overlapY_B = createMockCompartment("B", 25, 74.98, 25, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([overlapY_A, overlapY_B])).toThrow(
        ParametricGeometryOverlapError,
      );

      // 0.02 mm intersection along Z:
      const overlapZ_A = createMockCompartment("A", 25, 25, 25, 50, 50, 50);
      const overlapZ_B = createMockCompartment("B", 25, 25, 74.98, 50, 50, 50);
      expect(() => assertNoCompartmentOverlaps([overlapZ_A, overlapZ_B])).toThrow(
        ParametricGeometryOverlapError,
      );
    });

    it("applies bounds checking consistently across X, Y, and Z with tolerance policy", () => {
      const outer = { widthMm: 100, heightMm: 100, depthMm: 100 };

      // 0.005 mm overshoot due to rounding is accepted within GEOMETRY_TOLERANCE_MM (0.015mm)
      const roundingArtifact = createMockCompartment("ok", 50, 50, 50, 100.01, 100.01, 100.01);
      expect(() => assertCompartmentsWithinBounds([roundingArtifact], outer)).not.toThrow();

      // 0.02 mm genuine overshoot beyond container boundary is rejected along X
      const outX = createMockCompartment("outX", 50.02, 50, 50, 100, 100, 100);
      expect(() => assertCompartmentsWithinBounds([outX], outer)).toThrow(
        ParametricGeometryOutOfBoundsError,
      );

      // 0.02 mm genuine overshoot along Y
      const outY = createMockCompartment("outY", 50, 50.02, 50, 100, 100, 100);
      expect(() => assertCompartmentsWithinBounds([outY], outer)).toThrow(
        ParametricGeometryOutOfBoundsError,
      );

      // 0.02 mm genuine overshoot along Z
      const outZ = createMockCompartment("outZ", 50, 50, 50.02, 100, 100, 100);
      expect(() => assertCompartmentsWithinBounds([outZ], outer)).toThrow(
        ParametricGeometryOutOfBoundsError,
      );
    });

    it("verifies representative fractional dimensions (100mm / 3, 6, 7, 9 subdivisions) generate without false errors", () => {
      const fractionalCases = [
        { cols: 3, rows: 3 }, // 33.333... mm
        { cols: 6, rows: 6 }, // 16.666... mm
        { cols: 7, rows: 7 }, // 14.2857... mm
        { cols: 9, rows: 9 }, // 11.111... mm
      ];

      for (const { cols, rows } of fractionalCases) {
        const config: SmdDrawerCabinetConfig = {
          templateType: "SMD_DRAWER_CABINET",
          dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
          wallThicknessMm: 0,
          rows,
          columns: cols,
          dividerThicknessMm: 0,
        };

        const result = generateStorageCompartments(config);
        expect(result.totalCompartments).toBe(cols * rows);
      }
    });

    it("documents that sub-tolerance intersections smaller than stored precision (0.01mm) are unrepresentable", () => {
      // Numbers quantized to 2 decimal places cannot store 0.005mm.
      // E.g. Math.round(10.005 * 100) / 100 = 10.01.
      expect(GEOMETRY_TOLERANCE_MM).toBe(0.015);
      expect(Math.round(10.004 * 100) / 100).toBe(10.00);
      expect(Math.round(10.006 * 100) / 100).toBe(10.01);
    });
  });

  // ==========================================================================
  // 11. Compartment Identity, Structural Change & Diff Semantics
  // ==========================================================================
  describe("Compartment Identity & Diff Semantics", () => {
    it("distinguishes pure dimensional resize: same logical compartment, changed geometry, isStructuralChange = false", () => {
      const configA = createDefaultSmdCabinetConfig(); // 600 x 900
      const configB: SmdDrawerCabinetConfig = {
        ...configA,
        dimensions: { widthMm: 800, heightMm: 1200, depthMm: 350 },
      };

      const resA = generateStorageCompartments(configA);
      const resB = generateStorageCompartments(configB);
      const diff = diffParametricCompartments(resA.compartments, resB.compartments);

      expect(diff.retained).toHaveLength(60);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(60);
      expect(diff.meaningChangedSlots).toHaveLength(0);
      expect(diff.isStructuralChange).toBe(false);
    });

    it("distinguishes newly introduced compartments when appending rows/columns", () => {
      const baseConfig = createDefaultSmdCabinetConfig(); // 6x10 = 60
      const appendedConfig: SmdDrawerCabinetConfig = {
        ...baseConfig,
        rows: 7, // 7x10 = 70 (row 6 appended)
      };

      const resA = generateStorageCompartments(baseConfig);
      const resB = generateStorageCompartments(appendedConfig);
      const diff = diffParametricCompartments(resA.compartments, resB.compartments);

      expect(diff.retained).toHaveLength(60);
      expect(diff.added).toHaveLength(10);
      expect(diff.removed).toHaveLength(0);
      expect(diff.added.every((c) => c.slotId.includes("_r6_"))).toBe(true);
      expect(diff.isStructuralChange).toBe(true);
    });

    it("distinguishes prepending rows where added compartments appear and existing slots shift physical coordinates", () => {
      // In a 3-row cabinet (r0=top, r1=mid, r2=bot)
      const base3Row: SmdDrawerCabinetConfig = {
        ...createDefaultSmdCabinetConfig(),
        rows: 3,
        columns: 4,
      };
      // When 1 row is added (now 4 rows: r0, r1, r2, r3)
      const prepended4Row: SmdDrawerCabinetConfig = {
        ...base3Row,
        rows: 4,
      };

      const res3 = generateStorageCompartments(base3Row);
      const res4 = generateStorageCompartments(prepended4Row);
      const diff = diffParametricCompartments(res3.compartments, res4.compartments);

      // The 12 slots from r0..r2 are retained (though their Y coordinates redistributed)
      expect(diff.retained).toHaveLength(12);
      // 4 new slots (r3_c0..r3_c3) are detected as added
      expect(diff.added).toHaveLength(4);
      expect(diff.added.every((c) => c.slotId.includes("_r3_"))).toBe(true);
      // Diff flags structural change so UI requires reconciliation
      expect(diff.isStructuralChange).toBe(true);
      // Retained compartments have modified Y coordinates
      expect(diff.modified.length).toBeGreaterThan(0);
    });

    it("distinguishes removed compartments when reducing column count", () => {
      const baseConfig = createDefaultSmdCabinetConfig(); // 6 rows x 10 cols = 60
      const reducedConfig: SmdDrawerCabinetConfig = {
        ...baseConfig,
        columns: 8, // reduced to 8 cols (6x8 = 48)
      };

      const resA = generateStorageCompartments(baseConfig);
      const resB = generateStorageCompartments(reducedConfig);
      const diff = diffParametricCompartments(resA.compartments, resB.compartments);

      expect(diff.retained).toHaveLength(48);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(12); // cols 8 and 9 across 6 rows
      expect(diff.removed.every((c) => c.slotId.includes("_c8") || c.slotId.includes("_c9"))).toBe(true);
      expect(diff.isStructuralChange).toBe(true);
    });

    it("identifies structural change when reversing rowOrder (slot IDs match, but physical meaning inverted)", () => {
      const configTopDown = createDefaultSmdCabinetConfig(); // rowOrder: top_to_bottom
      const configBottomUp: SmdDrawerCabinetConfig = {
        ...configTopDown,
        naming: {
          ...configTopDown.naming,
          rowOrder: "bottom_to_top",
        },
      };

      const resTopDown = generateStorageCompartments(configTopDown);
      const resBottomUp = generateStorageCompartments(configBottomUp);
      const diff = diffParametricCompartments(resTopDown.compartments, resBottomUp.compartments);

      // Slot IDs match 100%
      expect(diff.retained).toHaveLength(60);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);

      // BUT physical meaning has inverted: r0 was top row, now is bottom row
      expect(diff.meaningChangedSlots.length).toBeGreaterThan(0);
      expect(diff.meaningChangedSlots[0]!.reason).toContain("Row orientation inverted");
      expect(diff.isStructuralChange).toBe(true);
    });

    it("identifies structural change when switching template type", () => {
      const drawerConfig = createDefaultSmdCabinetConfig();
      const binConfig = createDefaultOpenBinMatrixConfig();

      const resDrawer = generateStorageCompartments(drawerConfig);
      const resBin = generateStorageCompartments(binConfig);
      const diff = diffParametricCompartments(resDrawer.compartments, resBin.compartments);

      expect(diff.isStructuralChange).toBe(true);
    });

    it("identifies meaning changed slots when naming code pattern is remapped", () => {
      const configA = createDefaultSmdCabinetConfig(); // A01..F10
      const configB: SmdDrawerCabinetConfig = {
        ...configA,
        naming: {
          pattern: "SEQUENTIAL",
          padDigits: 3,
        },
      };

      const resA = generateStorageCompartments(configA);
      const resB = generateStorageCompartments(configB);
      const diff = diffParametricCompartments(resA.compartments, resB.compartments);

      expect(diff.retained).toHaveLength(60);
      expect(diff.meaningChangedSlots).toHaveLength(60);
      expect(diff.meaningChangedSlots[0]!.reason).toContain("Code changed");
      expect(diff.isStructuralChange).toBe(true);
    });
  });
});
