import { describe, expect, it } from "vitest";
import {
  createDefaultGridPartsTrayConfig,
  createDefaultOpenBinMatrixConfig,
  createDefaultPalletRackConfig,
  createDefaultSmdCabinetConfig,
  generateStorageCompartments,
  type GeneratedCompartment,
  type ParametricStorageConfig,
} from "@ananya/inventory";
import {
  clampFrontElevationViewTransform,
  computeFrontElevation,
  computeFrontElevationFit,
  computeFrontElevationLabelLayout,
  computeFrontElevationScale,
  createFrontElevationViewTransform,
  panFrontElevationViewTransform,
  projectFrontElevationSlotToPixels,
  zoomFrontElevationViewTransform,
  FRONT_ELEVATION_MAX_ZOOM,
  FRONT_ELEVATION_MIN_LABEL_FONT_PX,
  FRONT_ELEVATION_MIN_ZOOM,
  FRONT_ELEVATION_PADDING_PX,
} from "./spatial-front-elevation";
import { convertGeneratedToSceneLayout } from "./inventory-builder-state";
import { metersToMm } from "./spatial-3d-layout";

const TOLERANCE_MM = 0.05;

function expectClose(actual: number, expected: number, tolerance = TOLERANCE_MM) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function makeCompartment(
  overrides: Partial<GeneratedCompartment> & { slotId: string },
): GeneratedCompartment {
  return {
    code: overrides.slotId,
    name: `Compartment ${overrides.slotId}`,
    kind: "drawer",
    logicalIndex: { row: 0, col: 0 },
    position: { x: 100, y: 100, z: 50 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
    clearDimensions: { widthMm: 90, heightMm: 90, depthMm: 80 },
    metadata: {
      templateType: "SMD_DRAWER_CABINET",
      origin: "corner",
      row: 0,
      col: 0,
    },
    ...overrides,
  };
}

const DEFAULT_TEMPLATES: ParametricStorageConfig[] = [
  createDefaultSmdCabinetConfig(),
  createDefaultOpenBinMatrixConfig(),
  createDefaultPalletRackConfig(),
  createDefaultGridPartsTrayConfig(),
];

describe("Spatial 2D Front Elevation Projection", () => {
  describe("1. Proportional geometry (single source of truth)", () => {
    it("projects unequal widths and heights proportionally", () => {
      const container = { widthMm: 1000, heightMm: 500, depthMm: 300 };
      const compartments = [
        makeCompartment({
          slotId: "wide_short",
          code: "A01",
          position: { x: 300, y: 400, z: 150 },
          dimensions: { widthMm: 600, heightMm: 100, depthMm: 300 },
        }),
        makeCompartment({
          slotId: "narrow_tall",
          code: "A02",
          position: { x: 800, y: 250, z: 150 },
          dimensions: { widthMm: 200, heightMm: 400, depthMm: 300 },
        }),
      ];

      const projection = computeFrontElevation(compartments, container);
      const wide = projection.slots.find((slot) => slot.slotId === "wide_short")!;
      const narrow = projection.slots.find(
        (slot) => slot.slotId === "narrow_tall",
      )!;

      // Physical envelope is carried through untouched
      expect(wide.widthMm).toBe(600);
      expect(wide.heightMm).toBe(100);
      expect(narrow.widthMm).toBe(200);
      expect(narrow.heightMm).toBe(400);

      // Pixel proportions must equal physical proportions (no equal-cell forcing)
      const fit = computeFrontElevationFit(container, {
        widthPx: 1000,
        heightPx: 500,
      });
      const widePx = projectFrontElevationSlotToPixels(wide, fit);
      const narrowPx = projectFrontElevationSlotToPixels(narrow, fit);

      expect(widePx.widthPx / narrowPx.widthPx).toBeCloseTo(3, 5);
      expect(narrowPx.heightPx / widePx.heightPx).toBeCloseTo(4, 5);
      expect(widePx.widthPx / widePx.heightPx).toBeCloseTo(6, 5);
      expect(narrowPx.heightPx / narrowPx.widthPx).toBeCloseTo(2, 5);
    });

    it("keeps the outer envelope rather than the clear internal space", () => {
      const config = createDefaultSmdCabinetConfig();
      const generated = generateStorageCompartments(config);
      const projection = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );

      for (const compartment of generated.compartments) {
        const slot = projection.slots.find(
          (candidate) => candidate.slotId === compartment.slotId,
        )!;
        expect(slot.widthMm).toBe(compartment.dimensions.widthMm);
        expect(slot.heightMm).toBe(compartment.dimensions.heightMm);
        expect(slot.widthMm).not.toBe(compartment.clearDimensions.widthMm);
      }
    });

    it("orders slots in visual reading order (top-to-bottom, left-to-right)", () => {
      const config = createDefaultSmdCabinetConfig();
      const generated = generateStorageCompartments(config);
      const projection = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );

      for (let index = 1; index < projection.slots.length; index++) {
        const previous = projection.slots[index - 1]!;
        const current = projection.slots[index]!;
        const isLower = current.yMm > previous.yMm;
        const isSameRowFurtherRight =
          current.yMm === previous.yMm && current.xMm >= previous.xMm;
        expect(isLower || isSameRowFurtherRight).toBe(true);
      }

      // Deterministic: same input produces the same ordering
      const again = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );
      expect(again.slots.map((slot) => slot.slotId)).toEqual(
        projection.slots.map((slot) => slot.slotId),
      );
    });
  });

  describe("2. Gaps, dividers and boundaries follow the source geometry", () => {
    it("reproduces SMD cabinet wall, divider and cell boundaries", () => {
      const config = createDefaultSmdCabinetConfig();
      const generated = generateStorageCompartments(config);
      const projection = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );
      const cellWidth =
        (config.dimensions.widthMm -
          2 * config.wallThicknessMm -
          (config.columns - 1) * config.dividerThicknessMm!) /
        config.columns;

      const row0 = projection.slots
        .filter((slot) => slot.slotId.startsWith("drawer_slot_r0_"))
        .sort((a, b) => a.xMm - b.xMm);
      expect(row0).toHaveLength(config.columns);

      // Outer wall boundaries
      expectClose(row0[0]!.xMm, config.wallThicknessMm);
      expectClose(
        row0[config.columns - 1]!.xMm + row0[config.columns - 1]!.widthMm,
        config.dimensions.widthMm - config.wallThicknessMm,
      );

      // Vertical divider gaps are the physical gap between envelopes
      for (let index = 1; index < row0.length; index++) {
        const gap = row0[index]!.xMm - (row0[index - 1]!.xMm + row0[index - 1]!.widthMm);
        expectClose(gap, config.dividerThicknessMm!);
      }

      // Top row starts at the top wall and horizontal dividers are preserved
      const column0 = projection.slots
        .filter((slot) => slot.slotId.endsWith("_c0"))
        .sort((a, b) => a.yMm - b.yMm);
      expectClose(column0[0]!.yMm, config.wallThicknessMm);
      for (let index = 1; index < column0.length; index++) {
        const gap =
          column0[index]!.yMm -
          (column0[index - 1]!.yMm + column0[index - 1]!.heightMm);
        expectClose(gap, config.dividerThicknessMm!);
      }

      // Cell size is preserved (unequal cells in a dense grid stay faithful)
      expectClose(row0[0]!.widthMm, cellWidth);
    });

    it("reproduces pallet rack posts and beams as physical gaps", () => {
      const config = createDefaultPalletRackConfig();
      const generated = generateStorageCompartments(config);
      const projection = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );

      const level0 = projection.slots
        .filter((slot) => slot.slotId.startsWith("rack_bay_r0_"))
        .sort((a, b) => a.xMm - b.xMm);
      expect(level0).toHaveLength(config.baysPerLevel);

      // Upright post at the left edge and between bays
      expectClose(level0[0]!.xMm, config.uprightPostWidthMm!);
      expectClose(
        level0[1]!.xMm - (level0[0]!.xMm + level0[0]!.widthMm),
        config.uprightPostWidthMm!,
      );

      // Beam height separates levels
      const bay0Levels = projection.slots
        .filter((slot) => slot.slotId.endsWith("_c0"))
        .sort((a, b) => a.yMm - b.yMm);
      expect(bay0Levels).toHaveLength(config.levels);
      for (let index = 1; index < bay0Levels.length; index++) {
        const gap =
          bay0Levels[index]!.yMm -
          (bay0Levels[index - 1]!.yMm + bay0Levels[index - 1]!.heightMm);
        expectClose(gap, config.beamHeightMm!);
      }
    });

    it("reproduces open bin tier and bin spacing", () => {
      const config = createDefaultOpenBinMatrixConfig();
      const generated = generateStorageCompartments(config);
      const projection = computeFrontElevation(
        generated.compartments,
        config.dimensions,
      );

      const tier0 = projection.slots
        .filter((slot) => slot.slotId.startsWith("bin_slot_r0_"))
        .sort((a, b) => a.xMm - b.xMm);
      for (let index = 1; index < tier0.length; index++) {
        const gap =
          tier0[index]!.xMm - (tier0[index - 1]!.xMm + tier0[index - 1]!.widthMm);
        expectClose(gap, config.binSpacingMm!);
      }

      const bin0 = projection.slots
        .filter((slot) => slot.slotId.endsWith("_c0"))
        .sort((a, b) => a.yMm - b.yMm);
      for (let index = 1; index < bin0.length; index++) {
        const gap =
          bin0[index]!.yMm - (bin0[index - 1]!.yMm + bin0[index - 1]!.heightMm);
        expectClose(gap, config.tierSpacingMm!);
      }
    });

    it("keeps every compartment inside the container without overlap", () => {
      for (const config of DEFAULT_TEMPLATES) {
        const generated = generateStorageCompartments(config);
        const projection = computeFrontElevation(
          generated.compartments,
          config.dimensions,
        );

        for (const slot of projection.slots) {
          expect(slot.xMm).toBeGreaterThanOrEqual(-TOLERANCE_MM);
          expect(slot.yMm).toBeGreaterThanOrEqual(-TOLERANCE_MM);
          expect(slot.xMm + slot.widthMm).toBeLessThanOrEqual(
            config.dimensions.widthMm + TOLERANCE_MM,
          );
          expect(slot.yMm + slot.heightMm).toBeLessThanOrEqual(
            config.dimensions.heightMm + TOLERANCE_MM,
          );
        }

        for (let a = 0; a < projection.slots.length; a++) {
          for (let b = a + 1; b < projection.slots.length; b++) {
            const first = projection.slots[a]!;
            const second = projection.slots[b]!;
            const overlaps =
              first.xMm < second.xMm + second.widthMm - TOLERANCE_MM &&
              second.xMm < first.xMm + first.widthMm - TOLERANCE_MM &&
              first.yMm < second.yMm + second.heightMm - TOLERANCE_MM &&
              second.yMm < first.yMm + first.heightMm - TOLERANCE_MM;
            expect(overlaps).toBe(false);
          }
        }
      }
    });
  });

  describe("3. Front-facing axis and 3D coordinate agreement", () => {
    it("ignores depth: compartments differing only in Z project identically", () => {
      const container = { widthMm: 500, heightMm: 500, depthMm: 400 };
      const front = makeCompartment({
        slotId: "front",
        position: { x: 250, y: 250, z: 50 },
        dimensions: { widthMm: 200, heightMm: 200, depthMm: 100 },
      });
      const back = makeCompartment({
        slotId: "back",
        position: { x: 250, y: 250, z: 350 },
        dimensions: { widthMm: 200, heightMm: 200, depthMm: 100 },
      });

      const projection = computeFrontElevation([front, back], container);
      const frontSlot = projection.slots.find((slot) => slot.slotId === "front")!;
      const backSlot = projection.slots.find((slot) => slot.slotId === "back")!;

      expect(frontSlot.xMm).toBe(backSlot.xMm);
      expect(frontSlot.yMm).toBe(backSlot.yMm);
      expect(frontSlot.widthMm).toBe(backSlot.widthMm);
      expect(frontSlot.heightMm).toBe(backSlot.heightMm);
    });

    it("flips world Y (up) into screen Y (down)", () => {
      const container = { widthMm: 100, heightMm: 1000, depthMm: 100 };
      const low = makeCompartment({
        slotId: "low",
        position: { x: 50, y: 100, z: 50 },
        dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
      });
      const high = makeCompartment({
        slotId: "high",
        position: { x: 50, y: 950, z: 50 },
        dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
      });

      const projection = computeFrontElevation([low, high], container);
      const lowSlot = projection.slots.find((slot) => slot.slotId === "low")!;
      const highSlot = projection.slots.find((slot) => slot.slotId === "high")!;

      // A physically higher compartment must have a smaller top-edge offset
      expect(highSlot.yMm).toBeLessThan(lowSlot.yMm);
      expect(highSlot.yMm).toBe(0);
      expect(lowSlot.yMm).toBe(850);
      // Reading order therefore starts with the highest compartment
      expect(projection.slots[0]!.slotId).toBe("high");
    });

    it("matches the 3D scene layout coordinates for every default template", () => {
      for (const config of DEFAULT_TEMPLATES) {
        const generated = generateStorageCompartments(config);
        const scene = convertGeneratedToSceneLayout(
          generated.compartments,
          new Map(),
          config.dimensions,
        );
        const projection = computeFrontElevation(
          generated.compartments,
          config.dimensions,
        );

        expect(projection.slots).toHaveLength(scene.length);
        for (const sceneChild of scene) {
          const slot = projection.slots.find(
            (candidate) => candidate.slotId === sceneChild.locationId,
          )!;
          // Scene X is centred on the container; the projection is corner-origin
          expectClose(
            slot.centerXMm,
            metersToMm(sceneChild.position.x) + config.dimensions.widthMm / 2,
          );
          // Scene Y is centered on the parent model, while the front elevation
          // remains corner-origin, so restore the container half-height.
          expectClose(
            slot.centerYMm,
            metersToMm(sceneChild.position.y) +
              config.dimensions.heightMm / 2,
          );
        }
      }
    });
  });

  describe("4. Selection mapping parity and stability", () => {
    it("exposes exactly the same interactive keys as the 3D scene layout", () => {
      for (const config of DEFAULT_TEMPLATES) {
        const generated = generateStorageCompartments(config);
        const scene = convertGeneratedToSceneLayout(
          generated.compartments,
          new Map(),
          config.dimensions,
        );
        const projection = computeFrontElevation(
          generated.compartments,
          config.dimensions,
        );

        const projectionIds = projection.slots.map((slot) => slot.slotId).sort();
        const sceneIds = scene.map((child) => child.locationId).sort();
        expect(projectionIds).toEqual(sceneIds);
      }
    });

    it("preserves slot IDs and mapping keys when geometry changes", () => {
      const baseConfig = createDefaultSmdCabinetConfig();
      const baseGenerated = generateStorageCompartments(baseConfig);
      const baseIds = baseGenerated.compartments.map((slot) => slot.slotId);

      const resizedConfig: ParametricStorageConfig = {
        ...baseConfig,
        dimensions: { widthMm: 900, heightMm: 1200, depthMm: 350 },
      };
      const resized = generateStorageCompartments(resizedConfig);
      const projection = computeFrontElevation(
        resized.compartments,
        resizedConfig.dimensions,
      );

      // Topology is stable: the same slots exist and no stale IDs survive
      expect(projection.slots.map((slot) => slot.slotId)).toEqual(baseIds);
      expect(projection.slots).toHaveLength(baseGenerated.compartments.length);

      // Coordinates were recomputed from the new geometry
      const before = computeFrontElevation(
        baseGenerated.compartments,
        baseConfig.dimensions,
      );
      const firstBefore = before.slots[0]!;
      const firstAfter = projection.slots[0]!;
      expect(firstAfter.widthMm).toBeGreaterThan(firstBefore.widthMm);
      expect(firstAfter.heightMm).toBeGreaterThan(firstBefore.heightMm);

      // Mappings keyed by slotId still resolve against the new projection
      const mappedSlotIds = new Set(baseIds);
      for (const slot of projection.slots) {
        expect(mappedSlotIds.has(slot.slotId)).toBe(true);
      }
    });

    it("drops removed slots without leaving stale visual entries", () => {
      const baseConfig = createDefaultSmdCabinetConfig();
      const generated = generateStorageCompartments(baseConfig);
      const projection = computeFrontElevation(
        generated.compartments,
        baseConfig.dimensions,
      );
      expect(projection.slots).toHaveLength(60);

      const trimmedConfig: ParametricStorageConfig = {
        ...baseConfig,
        rows: 2,
        columns: 3,
      };
      const trimmed = generateStorageCompartments(trimmedConfig);
      const trimmedProjection = computeFrontElevation(
        trimmed.compartments,
        trimmedConfig.dimensions,
      );

      expect(trimmedProjection.slots).toHaveLength(6);
      const remaining = new Set(trimmedProjection.slots.map((slot) => slot.slotId));
      expect(remaining.has("drawer_slot_r5_c9")).toBe(false);
      expect(projection.slots.some((slot) => remaining.has(slot.slotId))).toBe(true);
    });
  });

  describe("5. Viewport fitting preserves aspect ratio", () => {
    it("fits a wide layout into a wide viewport without stretching", () => {
      const container = { widthMm: 2400, heightMm: 600, depthMm: 1100 };
      const fit = computeFrontElevationFit(container, {
        widthPx: 1200,
        heightPx: 400,
      });

      // Width is the binding constraint
      expect(fit.scalePxPerMm).toBeCloseTo(
        (1200 - FRONT_ELEVATION_PADDING_PX * 2) / container.widthMm,
        6,
      );
      expect(fit.drawnWidthPx / fit.drawnHeightPx).toBeCloseTo(
        container.widthMm / container.heightMm,
        6,
      );
      // Drawing stays centred and inside the viewport
      expect(fit.offsetXPx).toBeCloseTo(FRONT_ELEVATION_PADDING_PX, 6);
      expect(fit.offsetYPx).toBeGreaterThan(0);
      expect(fit.offsetXPx * 2 + fit.drawnWidthPx).toBeCloseTo(1200, 6);
    });

    it("fits a tall layout into a tall viewport without stretching", () => {
      const container = { widthMm: 600, heightMm: 3000, depthMm: 300 };
      const fit = computeFrontElevationFit(container, {
        widthPx: 400,
        heightPx: 1000,
      });

      expect(fit.scalePxPerMm).toBeCloseTo(
        (1000 - FRONT_ELEVATION_PADDING_PX * 2) / container.heightMm,
        6,
      );
      expect(fit.drawnWidthPx / fit.drawnHeightPx).toBeCloseTo(
        container.widthMm / container.heightMm,
        6,
      );
      expect(fit.offsetYPx).toBeCloseTo(FRONT_ELEVATION_PADDING_PX, 6);
      expect(fit.offsetXPx).toBeGreaterThan(0);
    });

    it("handles degenerate viewports without NaN", () => {
      const fit = computeFrontElevationFit(
        { widthMm: 600, heightMm: 900, depthMm: 300 },
        { widthPx: 0, heightPx: 0 },
      );
      expect(fit.scalePxPerMm).toBe(0);
      expect(Number.isFinite(fit.offsetXPx)).toBe(true);
      expect(Number.isFinite(fit.offsetYPx)).toBe(true);
    });
  });

  describe("6. All templates and edge cases", () => {
    it("renders every supported template with complete geometry", () => {
      for (const config of DEFAULT_TEMPLATES) {
        const generated = generateStorageCompartments(config);
        const projection = computeFrontElevation(
          generated.compartments,
          config.dimensions,
        );

        expect(projection.isEmpty).toBe(false);
        expect(projection.slots).toHaveLength(generated.totalCompartments);
        expect(projection.bounds).not.toBeNull();
        for (const slot of projection.slots) {
          expect(slot.widthMm).toBeGreaterThan(0);
          expect(slot.heightMm).toBeGreaterThan(0);
          expect(Number.isFinite(slot.xMm)).toBe(true);
          expect(Number.isFinite(slot.yMm)).toBe(true);
        }
      }
    });

    it("renders the rack and dense grid templates specifically", () => {
      const rackConfig = createDefaultPalletRackConfig();
      const rack = generateStorageCompartments(rackConfig);
      const rackProjection = computeFrontElevation(
        rack.compartments,
        rackConfig.dimensions,
      );
      expect(rackProjection.slots).toHaveLength(
        rackConfig.levels * rackConfig.baysPerLevel,
      );

      const trayConfig = createDefaultGridPartsTrayConfig();
      const tray = generateStorageCompartments(trayConfig);
      const trayProjection = computeFrontElevation(
        tray.compartments,
        trayConfig.dimensions,
      );
      expect(trayProjection.slots).toHaveLength(
        trayConfig.rows * trayConfig.columns,
      );

      // Dense matrix: 12 x 20 drawers
      const denseConfig: ParametricStorageConfig = {
        ...createDefaultSmdCabinetConfig(),
        rows: 12,
        columns: 20,
      };
      const dense = generateStorageCompartments(denseConfig);
      const denseProjection = computeFrontElevation(
        dense.compartments,
        denseConfig.dimensions,
      );
      expect(denseProjection.slots).toHaveLength(240);
      const uniqueIds = new Set(denseProjection.slots.map((slot) => slot.slotId));
      expect(uniqueIds.size).toBe(240);
    });

    it("handles an empty layout", () => {
      const projection = computeFrontElevation(
        [],
        createDefaultSmdCabinetConfig().dimensions,
      );
      expect(projection.isEmpty).toBe(true);
      expect(projection.slots).toHaveLength(0);
      expect(projection.bounds).toBeNull();
    });

    it("handles unusually wide and tall containers", () => {
      const wide = computeFrontElevation(
        [
          makeCompartment({
            slotId: "wide",
            position: { x: 5000, y: 50, z: 50 },
            dimensions: { widthMm: 10000, heightMm: 100, depthMm: 100 },
          }),
        ],
        { widthMm: 10000, heightMm: 100, depthMm: 100 },
      );
      expect(wide.slots[0]!.widthMm).toBe(10000);
      expect(wide.slots[0]!.heightMm).toBe(100);

      const tall = computeFrontElevation(
        [
          makeCompartment({
            slotId: "tall",
            position: { x: 50, y: 5000, z: 50 },
            dimensions: { widthMm: 100, heightMm: 10000, depthMm: 100 },
          }),
        ],
        { widthMm: 100, heightMm: 10000, depthMm: 100 },
      );
      expect(tall.slots[0]!.heightMm).toBe(10000);
      expect(tall.slots[0]!.yMm).toBe(0);
    });
  });

  describe("7. Label layout", () => {
    it("hides labels that cannot be legible in tiny compartments", () => {
      const layout = computeFrontElevationLabelLayout({
        code: "A01",
        widthMm: 5,
        heightMm: 4,
        pxPerMm: 1,
      });
      expect(layout.visible).toBe(false);
      expect(layout.codeText).toBe("");
    });

    it("scales and centres labels in comfortably sized compartments", () => {
      const layout = computeFrontElevationLabelLayout({
        code: "A01",
        widthMm: 55.2,
        heightMm: 143.33,
        pxPerMm: 0.63,
      });
      expect(layout.visible).toBe(true);
      expect(layout.codeText).toBe("A01");
      expect(layout.fontSizePx).toBeGreaterThanOrEqual(
        FRONT_ELEVATION_MIN_LABEL_FONT_PX,
      );
      expect(layout.fontSizePx).toBeLessThanOrEqual(
        Math.min(55.2 * 0.63 * 0.3, 143.33 * 0.63 * 0.42),
      );
    });

    it("truncates long codes instead of changing compartment geometry", () => {
      const layout = computeFrontElevationLabelLayout({
        code: "DRAWER-SLOT-LONG-CODE",
        widthMm: 40,
        heightMm: 40,
        pxPerMm: 1,
      });
      expect(layout.visible).toBe(true);
      expect(layout.codeText.endsWith("…")).toBe(true);
      expect(layout.codeText.length).toBeLessThan("DRAWER-SLOT-LONG-CODE".length);
    });

    it("reveals labels for dense layouts when zoomed in", () => {
      const denseConfig: ParametricStorageConfig = {
        ...createDefaultSmdCabinetConfig(),
        rows: 12,
        columns: 20,
      };
      const generated = generateStorageCompartments(denseConfig);
      const projection = computeFrontElevation(
        generated.compartments,
        denseConfig.dimensions,
      );
      const fit = computeFrontElevationFit(denseConfig.dimensions, {
        widthPx: 800,
        heightPx: 600,
      });
      const slot = projection.slots[0]!;

      const atBaseZoom = computeFrontElevationLabelLayout({
        code: slot.code,
        widthMm: slot.widthMm,
        heightMm: slot.heightMm,
        pxPerMm: computeFrontElevationScale(fit, 1),
      });
      const atZoomedIn = computeFrontElevationLabelLayout({
        code: slot.code,
        widthMm: slot.widthMm,
        heightMm: slot.heightMm,
        pxPerMm: computeFrontElevationScale(fit, 3),
      });

      expect(atBaseZoom.visible).toBe(false);
      expect(atZoomedIn.visible).toBe(true);
    });

    it("renders a secondary mapping label only when there is vertical room", () => {
      const roomy = computeFrontElevationLabelLayout({
        code: "A01",
        secondaryLabel: "DRW-A01",
        widthMm: 60,
        heightMm: 60,
        pxPerMm: 1,
      });
      expect(roomy.showSecondary).toBe(true);
      expect(roomy.secondaryText).toBe("DRW-A01");

      const cramped = computeFrontElevationLabelLayout({
        code: "A01",
        secondaryLabel: "DRW-A01",
        widthMm: 60,
        heightMm: 12,
        pxPerMm: 1,
      });
      expect(cramped.visible).toBe(false);
      expect(cramped.showSecondary).toBe(false);
    });
  });

  describe("8. Zoom and pan view transform", () => {
    const container = { widthMm: 600, heightMm: 900, depthMm: 300 };
    const fit = computeFrontElevationFit(container, {
      widthPx: 800,
      heightPx: 600,
    });

    it("starts fitted with no pan", () => {
      const view = createFrontElevationViewTransform();
      expect(view.zoom).toBe(FRONT_ELEVATION_MIN_ZOOM);
      expect(view.offsetXPx).toBe(0);
      expect(view.offsetYPx).toBe(0);
    });

    it("clamps zoom to the supported range", () => {
      const zoomedIn = zoomFrontElevationViewTransform(
        createFrontElevationViewTransform(),
        fit,
        1000,
        400,
        300,
      );
      expect(zoomedIn.zoom).toBe(FRONT_ELEVATION_MAX_ZOOM);

      const zoomedOut = zoomFrontElevationViewTransform(
        zoomedIn,
        fit,
        0.0001,
        400,
        300,
      );
      expect(zoomedOut.zoom).toBe(FRONT_ELEVATION_MIN_ZOOM);
      expect(zoomedOut.offsetXPx).toBe(0);
      expect(zoomedOut.offsetYPx).toBe(0);
    });

    it("keeps the physical point under the anchor fixed while zooming", () => {
      const view = createFrontElevationViewTransform();
      // Close enough to the centre that the pan clamp does not intervene.
      const anchorX = 420;
      const anchorY = 330;

      const screenOf = (
        mmX: number,
        mmY: number,
        transform: ReturnType<typeof createFrontElevationViewTransform>,
      ) => ({
        x:
          fit.offsetXPx +
          fit.drawnWidthPx / 2 +
          transform.offsetXPx +
          (mmX - container.widthMm / 2) * fit.scalePxPerMm * transform.zoom,
        y:
          fit.offsetYPx +
          fit.drawnHeightPx / 2 +
          transform.offsetYPx +
          (mmY - container.heightMm / 2) * fit.scalePxPerMm * transform.zoom,
      });

      // Physical point currently under the anchor
      const mmX =
        (anchorX - fit.offsetXPx - fit.drawnWidthPx / 2 - view.offsetXPx) /
        (fit.scalePxPerMm * view.zoom) +
        container.widthMm / 2;
      const mmY =
        (anchorY - fit.offsetYPx - fit.drawnHeightPx / 2 - view.offsetYPx) /
        (fit.scalePxPerMm * view.zoom) +
        container.heightMm / 2;

      const zoomed = zoomFrontElevationViewTransform(
        view,
        fit,
        2.5,
        anchorX,
        anchorY,
      );
      const after = screenOf(mmX, mmY, zoomed);
      expect(after.x).toBeCloseTo(anchorX, 4);
      expect(after.y).toBeCloseTo(anchorY, 4);
    });

    it("keeps the fitted drawing centred and prevents panning it out of view", () => {
      const fitted = createFrontElevationViewTransform();
      const panAtFit = panFrontElevationViewTransform(fitted, fit, 500, 500);
      expect(panAtFit.offsetXPx).toBe(0);
      expect(panAtFit.offsetYPx).toBe(0);

      const zoomed = zoomFrontElevationViewTransform(
        fitted,
        fit,
        3,
        400,
        300,
      );
      const farPan = panFrontElevationViewTransform(zoomed, fit, 100000, 100000);
      const viewportWidth = fit.offsetXPx * 2 + fit.drawnWidthPx;
      const viewportHeight = fit.offsetYPx * 2 + fit.drawnHeightPx;
      expect(Math.abs(farPan.offsetXPx)).toBeLessThanOrEqual(
        (fit.drawnWidthPx * farPan.zoom - viewportWidth) / 2 + 1e-6,
      );
      expect(Math.abs(farPan.offsetYPx)).toBeLessThanOrEqual(
        (fit.drawnHeightPx * farPan.zoom - viewportHeight) / 2 + 1e-6,
      );
    });

    it("clamps invalid transforms defensively", () => {
      const clamped = clampFrontElevationViewTransform(
        { zoom: Number.NaN, offsetXPx: Number.NaN, offsetYPx: Number.NaN },
        fit,
      );
      expect(clamped.zoom).toBe(FRONT_ELEVATION_MIN_ZOOM);
      expect(clamped.offsetXPx).toBe(0);
      expect(clamped.offsetYPx).toBe(0);
    });
  });
});
