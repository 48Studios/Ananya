import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createDefaultGridPartsTrayConfig,
  createDefaultOpenBinMatrixConfig,
  createDefaultPalletRackConfig,
  createDefaultSmdCabinetConfig,
  generateStorageCompartments,
  type PalletRackConfig,
  type SmdDrawerCabinetConfig,
  type SpatialLayoutWithMappings,
} from "@ananya/inventory";
import {
  createInitialBuilderState,
  updateParametricConfig,
  setTemplateType,
  commitAsBaseline,
  mapSlotToLocation,
  unmapSlot,
  switchWorkspaceMode,
  convertGeneratedToSceneLayout,
  acknowledgeStaleMapping,
  selectContainer,
  selectCompartment,
  PARENT_CONFLICT_STALE_PREFIX,
  isChildInteractionEnabled,
  setSelectedParentLocation,
  unmapIncompatibleHierarchySlots,
  getDescendantLocationIds,
  parseBuilderUrlParams,
  formatWorkspaceMappingsForApi,
  resetWorkspaceToDraft,
  loadLayoutIntoWorkspace,
  buildBuilderUrlSearchParams,
  syncStateFromUrl,
} from "./inventory-builder-state";
import {
  computeFrontElevation,
  type FrontElevationSlot,
} from "./spatial-front-elevation";
import { mmToMeters } from "./spatial-3d-layout";
import type { LocationDto } from "../api/locations-api";

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Phase 2: Inventory Builder Workspace & Parametric Controls", () => {
  const mockLocation: LocationDto = {
    id: "loc-drawer-a01",
    code: "DRW-A01",
    name: "SMD Drawer A01 (0805 Resistors)",
    kind: "drawer",
    parentId: "loc-cabinet-01",
    isActive: true,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  /**
   * Parent-first: child slots can only be selected or mapped once the top-level
   * container has an assigned Ananya location.
   */
  const withAssignedParent = (
    state: ReturnType<typeof createInitialBuilderState>,
    parentId = "loc-cabinet-01",
  ) => setSelectedParentLocation(state, parentId, []);

  // --------------------------------------------------------------------------
  // 1. Template Selection and Configuration Validation
  // --------------------------------------------------------------------------
  describe("Template Selection & Validation", () => {
    it("initializes with default SMD Drawer Cabinet configuration (60 compartments)", () => {
      const state = createInitialBuilderState();

      expect(state.mode).toBe("build");
      expect(state.config.templateType).toBe("SMD_DRAWER_CABINET");
      expect(state.generatedResult).not.toBeNull();
      expect(state.generatedResult?.totalCompartments).toBe(60);
      expect(state.validationErrors).toHaveLength(0);
      expect(state.diff?.hasChanges).toBe(false);
    });

    it("switches template types and re-generates corresponding compartments", () => {
      let state = createInitialBuilderState();

      // Switch to Open Bin Matrix (40 bins)
      state = setTemplateType(state, "OPEN_BIN_MATRIX");
      expect(state.config.templateType).toBe("OPEN_BIN_MATRIX");
      expect(state.generatedResult?.totalCompartments).toBe(40);
      expect(state.generatedResult?.compartments[0]?.kind).toBe("bin");

      // Switch to Pallet Rack (8 shelf bays)
      state = setTemplateType(state, "PALLET_RACK");
      expect(state.config.templateType).toBe("PALLET_RACK");
      expect(state.generatedResult?.totalCompartments).toBe(8);
      expect(state.generatedResult?.compartments[0]?.kind).toBe("shelf");

      // Switch to Grid Parts Tray (24 slots)
      state = setTemplateType(state, "GRID_PARTS_TRAY");
      expect(state.config.templateType).toBe("GRID_PARTS_TRAY");
      expect(state.generatedResult?.totalCompartments).toBe(24);
      expect(state.generatedResult?.compartments[0]?.kind).toBe("slot");
    });

    it("captures validation errors gracefully without crashing or losing previous result", () => {
      const state = createInitialBuilderState();
      const invalidConfig: SmdDrawerCabinetConfig = {
        ...(state.config as SmdDrawerCabinetConfig),
        templateType: "SMD_DRAWER_CABINET",
        dimensions: { widthMm: -100, heightMm: 500, depthMm: 200 }, // Invalid width
        wallThicknessMm: 100, // Invalid: exceeds width
      };

      const updated = updateParametricConfig(state, invalidConfig);

      expect(updated.validationErrors.length).toBeGreaterThan(0);
      expect(updated.validationErrors.some((e) => e.includes("Width"))).toBe(
        true,
      );
      // Previous generatedResult is preserved to prevent blank screens
      expect(updated.generatedResult).toBe(state.generatedResult);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Switching Between Duplex Modes
  // --------------------------------------------------------------------------
  describe("Duplex Workspace Modes (Build vs Map)", () => {
    it("switches cleanly between build-new and map-existing modes preserving state", () => {
      let state = withAssignedParent(createInitialBuilderState());

      // Associate a slot in build mode
      const slot0 = state.generatedResult!.compartments[0]!;
      state = mapSlotToLocation(state, slot0.slotId, mockLocation);

      // Switch to Map mode
      state = switchWorkspaceMode(state, "map");
      expect(state.mode).toBe("map");
      expect(state.mappings.size).toBe(1);
      expect(state.mappings.get(slot0.slotId)?.locationId).toBe(
        mockLocation.id,
      );

      // Switch back to Build mode
      state = switchWorkspaceMode(state, "build");
      expect(state.mode).toBe("build");
      expect(state.mappings.size).toBe(1);
      expect(state.generatedResult?.totalCompartments).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Displaying Geometry Changes Even When isStructuralChange is False
  // --------------------------------------------------------------------------
  describe("Geometry Change Surfacing", () => {
    it("surfaces dimensional modifications for review when isStructuralChange is false", () => {
      const state = createInitialBuilderState();
      const currentConfig = state.config as SmdDrawerCabinetConfig;

      // Resize outer cabinet without adding or removing slots (600x900 -> 800x1200)
      const resizedConfig: SmdDrawerCabinetConfig = {
        ...currentConfig,
        dimensions: {
          widthMm: 800,
          heightMm: 1200,
          depthMm: 400,
        },
      };

      const updated = updateParametricConfig(state, resizedConfig);

      expect(updated.diff).not.toBeNull();
      // Invariant: isStructuralChange is false because slot count and IDs are identical
      expect(updated.diff?.isStructuralChange).toBe(false);
      // Invariant: All 60 slots are retained
      expect(updated.diff?.retained).toHaveLength(60);
      expect(updated.diff?.added).toHaveLength(0);
      expect(updated.diff?.removed).toHaveLength(0);

      // CRITICAL REQUIREMENT: Geometry changes MUST still be surfaced for operator review!
      const modifiedSlots = updated.diff?.modified ?? [];
      expect(modifiedSlots).toHaveLength(60);
      expect(updated.diff?.hasChanges).toBe(true);

      const mod0 = modifiedSlots[0]!;
      expect(mod0.current.dimensions.widthMm).toBeGreaterThan(
        mod0.previous.dimensions.widthMm,
      );
      expect(mod0.current.dimensions.heightMm).toBeGreaterThan(
        mod0.previous.dimensions.heightMm,
      );
    });

    it("allows committing a new baseline to reset diff changes", () => {
      const state = createInitialBuilderState();
      const resizedConfig: SmdDrawerCabinetConfig = {
        ...(state.config as SmdDrawerCabinetConfig),
        templateType: "SMD_DRAWER_CABINET",
        dimensions: { widthMm: 800, heightMm: 1200, depthMm: 400 },
      };

      const updated = updateParametricConfig(state, resizedConfig);
      expect(updated.diff?.hasChanges).toBe(true);

      const committed = commitAsBaseline(updated);
      expect(committed.diff?.hasChanges).toBe(false);
      expect(committed.diff?.modified).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Distinguishing Generated Compartments from Mapped Locations
  // --------------------------------------------------------------------------
  describe("Generated vs Mapped Compartment Distinction", () => {
    it("distinguishes unmapped draft compartments from mapped locations in 3D scene layout", () => {
      let state = withAssignedParent(createInitialBuilderState());
      const slot0 = state.generatedResult!.compartments[0]!;
      const slot1 = state.generatedResult!.compartments[1]!;

      // Map slot 0, leave slot 1 unmapped
      state = mapSlotToLocation(state, slot0.slotId, mockLocation);

      const sceneLayout = convertGeneratedToSceneLayout(
        state.generatedResult!.compartments,
        state.mappings,
      );

      const sceneSlot0 = sceneLayout.find(
        (c) => c.locationId === slot0.slotId,
      )!;
      const sceneSlot1 = sceneLayout.find(
        (c) => c.locationId === slot1.slotId,
      )!;

      // Slot 0 is mapped
      expect(sceneSlot0.isMapped).toBe(true);
      expect(sceneSlot0.locationName).toContain(mockLocation.name);
      expect(sceneSlot0.rawChild.location.metadata?.isDraftSlot).toBe(false);

      // Slot 1 is purely generated draft
      expect(sceneSlot1.isMapped).toBe(false);
      expect(sceneSlot1.rawChild.location.metadata?.isDraftSlot).toBe(true);
    });

    it("allows unmapping an existing slot cleanly", () => {
      let state = withAssignedParent(createInitialBuilderState());
      const slot0 = state.generatedResult!.compartments[0]!;

      state = mapSlotToLocation(state, slot0.slotId, mockLocation);
      expect(state.mappings.has(slot0.slotId)).toBe(true);

      state = unmapSlot(state, slot0.slotId);
      expect(state.mappings.has(slot0.slotId)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Invariant: Pure Client-Side State (Zero Backend Mutations)
  // --------------------------------------------------------------------------
  describe("Safety Invariants: Zero Backend Mutations", () => {
    it("verifies that all state functions are pure in-memory transitions", () => {
      const state0 = withAssignedParent(createInitialBuilderState());
      const state1 = updateParametricConfig(state0, {
        ...state0.config,
        dimensions: { widthMm: 700, heightMm: 1000, depthMm: 350 },
      });
      const state2 = mapSlotToLocation(
        state1,
        "drawer_slot_r0_c0",
        mockLocation,
      );
      const state3 = unmapSlot(state2, "drawer_slot_r0_c0");

      // Verify states are immutable copies and have no side effects
      expect(state0.mappings.size).toBe(0);
      expect(state2.mappings.size).toBe(1);
      expect(state3.mappings.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Navigation and Routing Registration
  // --------------------------------------------------------------------------
  describe("Navigation & Routing Integration", () => {
    it("registers Inventory Builder in navigation config under Warehouses & Storage", () => {
      const navConfig = read("lib/navigation/navigation-config.tsx");
      expect(navConfig).toContain('id: "inv-inventory-builder"');
      expect(navConfig).toContain('title: "Inventory Builder"');
      expect(navConfig).toContain('href: "/inventory/locations/spatial-builder"');
    });

    it("declares the builder entry route at apps/web/app/spatial/builder/page.tsx", () => {
      const builderPage = read("app/inventory/locations/spatial-builder/page.tsx");
      expect(builderPage).toContain("InventoryBuilderWorkspace");
      expect(builderPage).toContain("useSearchParams");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Phase 2.1 Correctness Fixes Regression Tests
  // --------------------------------------------------------------------------
  describe("Phase 2.1 Correctness Fixes", () => {
    // 1. Correct 3D coordinate alignment (P0)
    describe("1. 3D Coordinate Alignment & Carcass Containment (P0)", () => {
      const templates = [
        { name: "SMD_DRAWER_CABINET", config: createDefaultSmdCabinetConfig() },
        { name: "OPEN_BIN_MATRIX", config: createDefaultOpenBinMatrixConfig() },
        { name: "PALLET_RACK", config: createDefaultPalletRackConfig() },
        { name: "GRID_PARTS_TRAY", config: createDefaultGridPartsTrayConfig() },
      ];

      for (const { name, config } of templates) {
        it(`aligns and contains bounding boxes inside parent carcass for ${name}`, () => {
          const gen = generateStorageCompartments(config);
          const scene = convertGeneratedToSceneLayout(
            gen.compartments,
            new Map(),
            config.dimensions,
          );

          expect(scene.length).toBe(gen.compartments.length);

          const W = mmToMeters(config.dimensions.widthMm);
          const H = mmToMeters(config.dimensions.heightMm);
          const D = mmToMeters(config.dimensions.depthMm);

          const halfW = W / 2;
          const halfD = D / 2;
          const eps = 1e-4; // 0.1 mm tolerance

          for (const child of scene) {
            const minX = child.position.x - child.dimensions.x / 2;
            const maxX = child.position.x + child.dimensions.x / 2;
            const minY = child.position.y - child.dimensions.y / 2;
            const maxY = child.position.y + child.dimensions.y / 2;
            const minZ = child.position.z - child.dimensions.z / 2;
            const maxZ = child.position.z + child.dimensions.z / 2;

            // X must span inside [-W/2, W/2]
            expect(minX).toBeGreaterThanOrEqual(-halfW - eps);
            expect(maxX).toBeLessThanOrEqual(halfW + eps);

            // Y must span inside [0, H]
            expect(minY).toBeGreaterThanOrEqual(-eps);
            expect(maxY).toBeLessThanOrEqual(H + eps);

            // Z must span inside [-D/2, D/2]
            expect(minZ).toBeGreaterThanOrEqual(-halfD - eps);
            expect(maxZ).toBeLessThanOrEqual(halfD + eps);
          }
        });
      }

      it("correctly handles asymmetric dimensions and preserves Y-axis floor semantics", () => {
        const asymmetricConfig: SmdDrawerCabinetConfig = {
          templateType: "SMD_DRAWER_CABINET",
          dimensions: { widthMm: 1200, heightMm: 800, depthMm: 350 },
          rows: 4,
          columns: 6,
          naming: {
            pattern: "ROW_COL_ALPHA_NUM",
            rowOrder: "top_to_bottom",
          },
          wallThicknessMm: 10,
          dividerThicknessMm: 2,
        };

        const gen = generateStorageCompartments(asymmetricConfig);
        const scene = convertGeneratedToSceneLayout(
          gen.compartments,
          new Map(),
          asymmetricConfig.dimensions,
        );

        const W = mmToMeters(1200);
        const H = mmToMeters(800);
        const D = mmToMeters(350);
        const halfW = W / 2;
        const halfD = D / 2;
        const eps = 1e-4;

        for (const child of scene) {
          const minX = child.position.x - child.dimensions.x / 2;
          const maxX = child.position.x + child.dimensions.x / 2;
          const minY = child.position.y - child.dimensions.y / 2;
          const maxY = child.position.y + child.dimensions.y / 2;
          const minZ = child.position.z - child.dimensions.z / 2;
          const maxZ = child.position.z + child.dimensions.z / 2;

          expect(minX).toBeGreaterThanOrEqual(-halfW - eps);
          expect(maxX).toBeLessThanOrEqual(halfW + eps);
          expect(minY).toBeGreaterThanOrEqual(-eps);
          expect(maxY).toBeLessThanOrEqual(H + eps);
          expect(minZ).toBeGreaterThanOrEqual(-halfD - eps);
          expect(maxZ).toBeLessThanOrEqual(halfD + eps);
        }
      });
    });

    // 2. Enforce unique location mappings (P0)
    describe("2. Unique Location Mappings (P0)", () => {
      it("enforces 1:1 bijection by unmapping prior slot when location is reassigned", () => {
        let state = withAssignedParent(createInitialBuilderState());
        const slotA = state.generatedResult!.compartments[0]!.slotId;
        const slotB = state.generatedResult!.compartments[1]!.slotId;

        // Map mockLocation to slot A
        state = mapSlotToLocation(state, slotA, mockLocation);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.get(slotA)?.locationId).toBe(mockLocation.id);

        // Reassign mockLocation to slot B: must unmap from slot A
        state = mapSlotToLocation(state, slotB, mockLocation);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.has(slotA)).toBe(false);
        expect(state.mappings.get(slotB)?.locationId).toBe(mockLocation.id);
      });

      it("replaces location on slot when slot is re-mapped to a different location", () => {
        let state = withAssignedParent(createInitialBuilderState());
        const slotA = state.generatedResult!.compartments[0]!.slotId;

        const loc2: LocationDto = {
          ...mockLocation,
          id: "loc-drawer-a02",
          code: "DRW-A02",
          name: "Drawer A02",
        };

        state = mapSlotToLocation(state, slotA, mockLocation);
        expect(state.mappings.get(slotA)?.locationId).toBe(mockLocation.id);

        state = mapSlotToLocation(state, slotA, loc2);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.get(slotA)?.locationId).toBe(loc2.id);
      });
    });

    // 3. Correct preview orientation (P1)
    describe("3. 2D Front Elevation Physical Vertical Orientation (P1)", () => {
      const topMost = (slots: FrontElevationSlot[]) =>
        slots.reduce((highest, slot) =>
          slot.centerYMm > highest.centerYMm ? slot : highest,
        );
      const bottomMost = (slots: FrontElevationSlot[]) =>
        slots.reduce((lowest, slot) =>
          slot.centerYMm < lowest.centerYMm ? slot : lowest,
        );

      it("projects the physically highest level at the top for Pallet Rack (bottom_to_top levels)", () => {
        const rackConfig = createDefaultPalletRackConfig();
        const gen = generateStorageCompartments(rackConfig);
        const projection = computeFrontElevation(
          gen.compartments,
          rackConfig.dimensions,
        );

        // Visual reading order starts with the physically highest compartment
        expect(projection.slots[0]!.centerYMm).toBeGreaterThan(
          projection.slots[projection.slots.length - 1]!.centerYMm,
        );

        // For Pallet Rack, Level 4 (index 3) is at the top physically, Level 1 (index 0) is at the bottom
        expect(topMost(projection.slots).slotId).toBe("rack_bay_r3_c0");
        expect(bottomMost(projection.slots).slotId).toBe("rack_bay_r0_c0");
      });

      it("projects the physically highest row at the top for SMD Cabinet (top_to_bottom drawers)", () => {
        const cabConfig = createDefaultSmdCabinetConfig();
        const gen = generateStorageCompartments(cabConfig);
        const projection = computeFrontElevation(
          gen.compartments,
          cabConfig.dimensions,
        );

        // Row 0 is at the top physically in top_to_bottom
        expect(topMost(projection.slots).slotId).toBe("drawer_slot_r0_c0");
        expect(bottomMost(projection.slots).slotId).toBe(
          `drawer_slot_r${cabConfig.rows - 1}_c0`,
        );
      });
    });

    // 4. Protect draft mappings (P1)
    describe("4. Draft Mapping Protection & Stale Detection (P1)", () => {
      it("marks mapping as stale when physical meaning/rowOrder changes, but preserves association", () => {
        let state = withAssignedParent(createInitialBuilderState());
        const slotA = state.generatedResult!.compartments[0]!.slotId; // "drawer_slot_r0_c0"
        state = mapSlotToLocation(state, slotA, mockLocation);

        // Reverse row orientation from top_to_bottom to bottom_to_top
        const invertedConfig: SmdDrawerCabinetConfig = {
          ...(state.config as SmdDrawerCabinetConfig),
          naming: {
            ...(state.config as SmdDrawerCabinetConfig).naming,
            rowOrder: "bottom_to_top",
          },
        };

        state = updateParametricConfig(state, invertedConfig);

        // Mapping is preserved, but marked as stale with reason!
        expect(state.mappings.has(slotA)).toBe(true);
        const mappingRecord = state.mappings.get(slotA)!;
        expect(mappingRecord.isStale).toBe(true);
        expect(mappingRecord.staleReason).toContain("Row orientation inverted");

        // Stale mapping is marked as unmapped / draft in 3D scene until acknowledged
        const scene = convertGeneratedToSceneLayout(
          state.generatedResult!.compartments,
          state.mappings,
          state.config.dimensions,
        );
        const sceneSlot = scene.find((c) => c.locationId === slotA)!;
        expect(sceneSlot.isMapped).toBe(false);
        expect(sceneSlot.rawChild.location.metadata?.isStaleMapping).toBe(true);

        // Operator acknowledges the change
        state = acknowledgeStaleMapping(state, slotA);
        expect(state.mappings.get(slotA)?.isStale).toBe(false);
      });

      it("does NOT mark mapping as stale on pure dimensional adjustments", () => {
        let state = withAssignedParent(createInitialBuilderState());
        const slotA = state.generatedResult!.compartments[0]!.slotId;
        state = mapSlotToLocation(state, slotA, mockLocation);

        // Resize outer cabinet dimensions without changing row order or topology
        const resizedConfig: SmdDrawerCabinetConfig = {
          ...(state.config as SmdDrawerCabinetConfig),
          dimensions: { widthMm: 800, heightMm: 1200, depthMm: 400 },
        };

        state = updateParametricConfig(state, resizedConfig);

        expect(state.mappings.has(slotA)).toBe(true);
        expect(state.mappings.get(slotA)?.isStale).toBeFalsy();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. Phase 2.2 Corrective Fixes Regression Tests
  // --------------------------------------------------------------------------
  describe("Phase 2.2 Corrective Fixes", () => {
    // Master data hierarchy fixture
    const hierarchyLocations: LocationDto[] = [
      {
        id: "loc-warehouse-main",
        code: "WH-MAIN",
        name: "Main Production Warehouse",
        kind: "warehouse",
        parentId: null,
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "loc-cabinet-01",
        code: "CAB-01",
        name: "SMD Cabinet 01",
        kind: "cabinet",
        parentId: "loc-warehouse-main",
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "loc-drawer-a01",
        code: "DRW-A01",
        name: "Drawer A01 (0805 Resistors)",
        kind: "drawer",
        parentId: "loc-cabinet-01",
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "loc-sub-bin-01",
        code: "BIN-A01-1",
        name: "Sub-bin A01-1",
        kind: "bin",
        parentId: "loc-drawer-a01",
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "loc-cabinet-02",
        code: "CAB-02",
        name: "Through-Hole Cabinet 02",
        kind: "cabinet",
        parentId: "loc-warehouse-main",
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "loc-drawer-b01",
        code: "DRW-B01",
        name: "Drawer B01 (Electrolytic Caps)",
        kind: "drawer",
        parentId: "loc-cabinet-02",
        isActive: true,
        metadata: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    // ========================================================================
    // 1. Location Hierarchy & Mapping Eligibility (HIGH)
    // ========================================================================
    describe("1. Location Hierarchy & Mapping Eligibility (HIGH)", () => {
      it("scopes eligible descendants to selected parent container and handles cycles safely", () => {
        // Cabinet 01 descendants: drawer-a01 and sub-bin-01 (grandchild)
        const cab01Descendants = getDescendantLocationIds(
          hierarchyLocations,
          "loc-cabinet-01",
        );
        expect(cab01Descendants.has("loc-drawer-a01")).toBe(true);
        expect(cab01Descendants.has("loc-sub-bin-01")).toBe(true);
        // Excludes parent itself
        expect(cab01Descendants.has("loc-cabinet-01")).toBe(false);
        // Excludes sibling hierarchy
        expect(cab01Descendants.has("loc-cabinet-02")).toBe(false);
        expect(cab01Descendants.has("loc-drawer-b01")).toBe(false);
        // Excludes ancestor
        expect(cab01Descendants.has("loc-warehouse-main")).toBe(false);

        // Cycle tolerance test
        const cyclicLocations: LocationDto[] = [
          { ...hierarchyLocations[0]!, id: "node-a", parentId: "node-b" },
          { ...hierarchyLocations[1]!, id: "node-b", parentId: "node-a" },
        ];
        const cycleResult = getDescendantLocationIds(cyclicLocations, "node-a");
        expect(cycleResult.has("node-b")).toBe(true);
      });

      it("rejects attempting to map the selected parent itself as an individual slot", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const parentLoc = hierarchyLocations.find(
          (l) => l.id === "loc-cabinet-01",
        )!;

        // Attempting to map parent itself must be rejected
        state = mapSlotToLocation(state, slot0, parentLoc, hierarchyLocations);
        expect(state.mappings.has(slot0)).toBe(false);
      });

      it("rejects mapping incompatible structural container kinds (warehouse, room, zone)", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const warehouseLoc = hierarchyLocations.find(
          (l) => l.id === "loc-warehouse-main",
        )!;

        // Attempting to map macro warehouse kind must be rejected
        state = mapSlotToLocation(
          state,
          slot0,
          warehouseLoc,
          hierarchyLocations,
        );
        expect(state.mappings.has(slot0)).toBe(false);
      });

      it("prevents mapping locations belonging to unrelated parent hierarchies", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const unrelatedDrawer = hierarchyLocations.find(
          (l) => l.id === "loc-drawer-b01",
        )!; // Belongs to cab-02

        // Mapping unrelated drawer under cab-01 must be rejected
        state = mapSlotToLocation(
          state,
          slot0,
          unrelatedDrawer,
          hierarchyLocations,
        );
        expect(state.mappings.has(slot0)).toBe(false);

        // Mapping related drawer under cab-01 succeeds
        const relatedDrawer = hierarchyLocations.find(
          (l) => l.id === "loc-drawer-a01",
        )!;
        state = mapSlotToLocation(
          state,
          slot0,
          relatedDrawer,
          hierarchyLocations,
        );
        expect(state.mappings.has(slot0)).toBe(true);
        expect(state.mappings.get(slot0)?.locationId).toBe("loc-drawer-a01");
      });

      it("handles changing parents while mappings exist: flags hierarchy mismatches explicitly", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const drawerA01 = hierarchyLocations.find(
          (l) => l.id === "loc-drawer-a01",
        )!;

        // 1. Map drawerA01 under cabinet-01
        state = mapSlotToLocation(state, slot0, drawerA01, hierarchyLocations);
        expect(state.mappings.get(slot0)?.isStale).toBeFalsy();

        // 2. Change parent to cabinet-02 (unrelated hierarchy)
        state = setSelectedParentLocation(
          state,
          "loc-cabinet-02",
          hierarchyLocations,
        );
        expect(state.selectedParentLocationId).toBe("loc-cabinet-02");

        // CRITICAL INVARIANT: Incompatible mapping is NOT silently retained as valid!
        const record = state.mappings.get(slot0)!;
        expect(record.isStale).toBe(true);
        expect(record.staleReason).toContain("Hierarchy mismatch");
        expect(record.staleReason).toContain("loc-cabinet-02");

        // 3. User can explicitly resolve by unmapping incompatible slots
        const resolvedState = unmapIncompatibleHierarchySlots(
          state,
          hierarchyLocations,
        );
        expect(resolvedState.mappings.has(slot0)).toBe(false);

        // 4. Alternatively: switching parent back to cabinet-01 restores valid status
        const restoredState = setSelectedParentLocation(
          state,
          "loc-cabinet-01",
          hierarchyLocations,
        );
        expect(restoredState.mappings.get(slot0)?.isStale).toBe(false);
      });

      it("handles empty or null parent selection gracefully", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const drawerA01 = hierarchyLocations.find(
          (l) => l.id === "loc-drawer-a01",
        )!;

        state = mapSlotToLocation(state, slot0, drawerA01, hierarchyLocations);

        // Reset parent to null
        state = setSelectedParentLocation(state, null, hierarchyLocations);
        expect(state.selectedParentLocationId).toBeNull();
        expect(state.mappings.get(slot0)?.isStale).toBe(true);
        expect(state.mappings.get(slot0)?.staleReason).toContain(
          "No parent container selected",
        );

        // When parent is null, getDescendantLocationIds returns empty set
        expect(getDescendantLocationIds(hierarchyLocations, null).size).toBe(0);
      });

      it("enforces 1:1 location-to-slot bijection on duplicate and slot reassignment", () => {
        let state = createInitialBuilderState("map", "loc-cabinet-01");
        const slot0 = state.generatedResult!.compartments[0]!.slotId;
        const slot1 = state.generatedResult!.compartments[1]!.slotId;
        const drawerA01 = hierarchyLocations.find(
          (l) => l.id === "loc-drawer-a01",
        )!;
        const binA01_1 = hierarchyLocations.find(
          (l) => l.id === "loc-sub-bin-01",
        )!;

        // Assign drawerA01 to slot 0
        state = mapSlotToLocation(state, slot0, drawerA01, hierarchyLocations);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.get(slot0)?.locationId).toBe("loc-drawer-a01");

        // Reassign same drawerA01 to slot 1: slot 0 must be vacated
        state = mapSlotToLocation(state, slot1, drawerA01, hierarchyLocations);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.has(slot0)).toBe(false);
        expect(state.mappings.get(slot1)?.locationId).toBe("loc-drawer-a01");

        // Map binA01_1 to slot 1: drawerA01 is replaced on slot 1
        state = mapSlotToLocation(state, slot1, binA01_1, hierarchyLocations);
        expect(state.mappings.size).toBe(1);
        expect(state.mappings.get(slot1)?.locationId).toBe("loc-sub-bin-01");
      });
    });

    // ========================================================================
    // 2. Stale Mapping Acknowledgment & Configuration Signatures (MEDIUM)
    // ========================================================================
    describe("2. Stale Mapping Acknowledgment & Configuration Signatures (MEDIUM)", () => {
      it("executes the exact 5-step lifecycle: acknowledge topology change -> resize width preserves approval -> new meaning change re-invalidates", () => {
        let state = withAssignedParent(createInitialBuilderState("build"));
        const slotA = state.generatedResult!.compartments[0]!.slotId;
        const slotB = state.generatedResult!.compartments[1]!.slotId;

        // Map two slots
        state = mapSlotToLocation(state, slotA, mockLocation);
        const locB: LocationDto = {
          ...mockLocation,
          id: "loc-drawer-a02",
          code: "DRW-A02",
          name: "SMD Drawer A02",
        };
        state = mapSlotToLocation(state, slotB, locB);

        // Step 1: Change row orientation -> mappings become stale
        const invertedConfig: SmdDrawerCabinetConfig = {
          ...(state.config as SmdDrawerCabinetConfig),
          naming: {
            ...(state.config as SmdDrawerCabinetConfig).naming,
            rowOrder: "bottom_to_top",
          },
        };
        state = updateParametricConfig(state, invertedConfig);

        expect(state.mappings.get(slotA)?.isStale).toBe(true);
        expect(state.mappings.get(slotA)?.staleReason).toContain(
          "Row orientation inverted",
        );
        expect(state.mappings.get(slotB)?.isStale).toBe(true);

        // Step 2: Acknowledge stale mapping for slotA ONLY -> it becomes reviewed
        state = acknowledgeStaleMapping(state, slotA);
        expect(state.mappings.get(slotA)?.isStale).toBe(false);
        expect(state.mappings.get(slotA)?.staleReason).toBeUndefined();
        expect(
          state.mappings.get(slotA)?.acknowledgedChangeSignature,
        ).toBeDefined();

        // Step 5 verification: slotB remains unacknowledged and stale!
        expect(state.mappings.get(slotB)?.isStale).toBe(true);

        // Step 3: Change only cabinet width (600mm -> 800mm) -> prior acknowledgment remains valid!
        const widerConfig: SmdDrawerCabinetConfig = {
          ...invertedConfig,
          dimensions: {
            ...invertedConfig.dimensions,
            widthMm: 800,
          },
        };
        state = updateParametricConfig(state, widerConfig);

        // Invariant: slotA remains reviewed because the signature of its meaning change matches!
        expect(state.mappings.get(slotA)?.isStale).toBe(false);
        expect(state.mappings.get(slotA)?.staleReason).toBeUndefined();
        // slotB still remains stale
        expect(state.mappings.get(slotB)?.isStale).toBe(true);

        // Step 4: Make another meaning-changing edit (e.g. change naming pattern) -> affected mapping becomes stale again!
        const newNamingConfig: SmdDrawerCabinetConfig = {
          ...widerConfig,
          naming: {
            ...widerConfig.naming,
            pattern: "ROW_COL_NUMERIC", // Code changes from DRW-A01 to DRW-R1-C1
          },
        };
        state = updateParametricConfig(state, newNamingConfig);

        // Invariant: New meaning change invalidates prior acknowledgment!
        expect(state.mappings.get(slotA)?.isStale).toBe(true);
        expect(state.mappings.get(slotA)?.staleReason).toContain(
          "Code changed",
        );
        expect(
          state.mappings.get(slotA)?.acknowledgedChangeSignature,
        ).toBeUndefined();
      });
    });

    // ========================================================================
    // 3. URL and Browser History Synchronization (MEDIUM)
    // ========================================================================
    describe("3. URL and Browser History Synchronization (MEDIUM)", () => {
      it("supports direct links with mode and parent-location query parameters", () => {
        const searchParams = new URLSearchParams(
          "mode=map&location=loc-cabinet-01",
        );
        const { mode, locationId } = parseBuilderUrlParams(searchParams);

        expect(mode).toBe("map");
        expect(locationId).toBe("loc-cabinet-01");

        const initialState = createInitialBuilderState();
        const { state: syncedState, changed } = syncStateFromUrl(
          initialState,
          searchParams,
          hierarchyLocations,
        );

        expect(changed).toBe(true);
        expect(syncedState.mode).toBe("map");
        expect(syncedState.selectedParentLocationId).toBe("loc-cabinet-01");
      });

      it("preserves unrelated query parameters when updating mode or parent location", () => {
        // Initial URL with unrelated parameters
        const initialQs = "filter=active&sort=desc&view=table";
        const state = createInitialBuilderState("map", "loc-cabinet-01");

        const updatedParams = buildBuilderUrlSearchParams(initialQs, state);

        // Preserves original query params
        expect(updatedParams.get("filter")).toBe("active");
        expect(updatedParams.get("sort")).toBe("desc");
        expect(updatedParams.get("view")).toBe("table");

        // Sets builder state params
        expect(updatedParams.get("mode")).toBe("map");
        expect(updatedParams.get("location")).toBe("loc-cabinet-01");

        // Switching back to build mode with no parent cleans up mode and location but preserves others
        const cleanState = createInitialBuilderState("build", null);
        const cleanParams = buildBuilderUrlSearchParams(
          updatedParams,
          cleanState,
        );

        expect(cleanParams.get("filter")).toBe("active");
        expect(cleanParams.get("sort")).toBe("desc");
        expect(cleanParams.has("mode")).toBe(false);
        expect(cleanParams.has("location")).toBe(false);
      });

      it("simulates browser Back/Forward navigation transitions restoring UI state without loops", () => {
        const state = createInitialBuilderState("build", null);

        // Step 1: User transitions to Step 2 URL: mode=map&location=loc-cabinet-01
        const urlStep2 = new URLSearchParams(
          "mode=map&location=loc-cabinet-01",
        );
        const step2 = syncStateFromUrl(state, urlStep2, hierarchyLocations);
        expect(step2.changed).toBe(true);
        expect(step2.state.mode).toBe("map");
        expect(step2.state.selectedParentLocationId).toBe("loc-cabinet-01");

        // Step 2: User transitions to Step 3 URL: mode=map&location=loc-cabinet-02
        const urlStep3 = new URLSearchParams(
          "mode=map&location=loc-cabinet-02",
        );
        const step3 = syncStateFromUrl(
          step2.state,
          urlStep3,
          hierarchyLocations,
        );
        expect(step3.changed).toBe(true);
        expect(step3.state.selectedParentLocationId).toBe("loc-cabinet-02");

        // Step 3: User hits Back in browser -> URL reverts to Step 2
        const stepBack = syncStateFromUrl(
          step3.state,
          urlStep2,
          hierarchyLocations,
        );
        expect(stepBack.changed).toBe(true);
        expect(stepBack.state.selectedParentLocationId).toBe("loc-cabinet-01");

        // Step 4: No change when URL matches current state
        const idempotent = syncStateFromUrl(
          stepBack.state,
          urlStep2,
          hierarchyLocations,
        );
        expect(idempotent.changed).toBe(false);
      });
    });

    // ========================================================================
    // 4. Strengthened Pallet-Rack Structural Geometry Tests (LOW)
    // ========================================================================
    describe("4. Pallet-Rack Structural Geometry Clearances (LOW)", () => {
      const GEOMETRY_TOLERANCE_MM = 0.015;

      it("verifies compartment clearances against upright posts and structural beams for default pallet rack", () => {
        const config = createDefaultPalletRackConfig();
        const gen = generateStorageCompartments(config);

        expect(gen.compartments).toHaveLength(8); // 4 levels x 2 bays

        const postWidth = config.uprightPostWidthMm ?? 80;
        const beamHeight = config.beamHeightMm ?? 50;
        const W = config.dimensions.widthMm;
        const H = config.dimensions.heightMm;

        for (const comp of gen.compartments) {
          const minX = comp.position.x - comp.dimensions.widthMm / 2;
          const maxX = comp.position.x + comp.dimensions.widthMm / 2;
          const minY = comp.position.y - comp.dimensions.heightMm / 2;
          const maxY = comp.position.y + comp.dimensions.heightMm / 2;

          // Outer post clearances:
          // Left post occupies [0, postWidth]
          expect(minX).toBeGreaterThanOrEqual(
            postWidth - GEOMETRY_TOLERANCE_MM,
          );
          // Right post occupies [W - postWidth, W]
          expect(maxX).toBeLessThanOrEqual(
            W - postWidth + GEOMETRY_TOLERANCE_MM,
          );

          // Beam clearances:
          // Ground beam occupies [0, beamHeight]
          expect(minY).toBeGreaterThanOrEqual(
            beamHeight - GEOMETRY_TOLERANCE_MM,
          );
          // Top beam occupies [H - beamHeight, H]
          expect(maxY).toBeLessThanOrEqual(
            H - beamHeight + GEOMETRY_TOLERANCE_MM,
          );
        }

        // Intermediate post clearance between adjacent bays on each level
        for (let l = 0; l < config.levels; l++) {
          const levelBays = gen.compartments
            .filter((c) => c.logicalIndex.row === l)
            .sort((a, b) => a.position.x - b.position.x);

          expect(levelBays).toHaveLength(2);
          const bay0 = levelBays[0]!;
          const bay1 = levelBays[1]!;

          const bay0MaxX = bay0.position.x + bay0.dimensions.widthMm / 2;
          const bay1MinX = bay1.position.x - bay1.dimensions.widthMm / 2;
          const intermediateGap = bay1MinX - bay0MaxX;

          // The gap between bay 0 and bay 1 must accommodate the upright post width!
          expect(intermediateGap).toBeGreaterThanOrEqual(
            postWidth - GEOMETRY_TOLERANCE_MM,
          );
        }
      });

      it("verifies clearances for asymmetric/non-default pallet rack configurations with fractional dimensions", () => {
        const asymmetricConfig: PalletRackConfig = {
          templateType: "PALLET_RACK",
          dimensions: {
            widthMm: 3650,
            heightMm: 4200,
            depthMm: 1100,
          },
          levels: 3,
          baysPerLevel: 3,
          uprightPostWidthMm: 90,
          beamHeightMm: 65,
          naming: {
            pattern: "LEVEL_BAY_NUMERIC",
            rowOrder: "bottom_to_top",
          },
          wallThicknessMm: 0,
        };

        const gen = generateStorageCompartments(asymmetricConfig);
        expect(gen.compartments).toHaveLength(9); // 3 levels x 3 bays

        const postWidth = asymmetricConfig.uprightPostWidthMm!;
        const beamHeight = asymmetricConfig.beamHeightMm!;
        const W = asymmetricConfig.dimensions.widthMm;
        const H = asymmetricConfig.dimensions.heightMm;

        for (const comp of gen.compartments) {
          const minX = comp.position.x - comp.dimensions.widthMm / 2;
          const maxX = comp.position.x + comp.dimensions.widthMm / 2;
          const minY = comp.position.y - comp.dimensions.heightMm / 2;
          const maxY = comp.position.y + comp.dimensions.heightMm / 2;

          expect(minX).toBeGreaterThanOrEqual(
            postWidth - GEOMETRY_TOLERANCE_MM,
          );
          expect(maxX).toBeLessThanOrEqual(
            W - postWidth + GEOMETRY_TOLERANCE_MM,
          );
          expect(minY).toBeGreaterThanOrEqual(
            beamHeight - GEOMETRY_TOLERANCE_MM,
          );
          expect(maxY).toBeLessThanOrEqual(
            H - beamHeight + GEOMETRY_TOLERANCE_MM,
          );
        }

        // Verify all 3 bays per level have structural post gaps between them
        for (let l = 0; l < asymmetricConfig.levels; l++) {
          const levelBays = gen.compartments
            .filter((c) => c.logicalIndex.row === l)
            .sort((a, b) => a.position.x - b.position.x);

          expect(levelBays).toHaveLength(3);
          for (let b = 0; b < levelBays.length - 1; b++) {
            const currentBayMaxX =
              levelBays[b]!.position.x + levelBays[b]!.dimensions.widthMm / 2;
            const nextBayMinX =
              levelBays[b + 1]!.position.x -
              levelBays[b + 1]!.dimensions.widthMm / 2;
            const gap = nextBayMinX - currentBayMaxX;

            expect(gap).toBeGreaterThanOrEqual(
              postWidth - GEOMETRY_TOLERANCE_MM,
            );
          }
        }
      });

      it("verifies 3D carcass scene layout clears upright post bounding envelopes", () => {
        const config = createDefaultPalletRackConfig();
        const gen = generateStorageCompartments(config);
        const scene = convertGeneratedToSceneLayout(
          gen.compartments,
          new Map(),
          config.dimensions,
        );

        const postWidthM = mmToMeters(config.uprightPostWidthMm ?? 80);
        const halfWM = mmToMeters(config.dimensions.widthMm / 2);
        const eps = 1e-4; // 0.1 mm tolerance

        for (const child of scene) {
          const childMinX = child.position.x - child.dimensions.x / 2;
          const childMaxX = child.position.x + child.dimensions.x / 2;

          // In carcass frame [-W/2, W/2]:
          // Left post occupies [-halfWM, -halfWM + postWidthM]
          expect(childMinX).toBeGreaterThanOrEqual(-halfWM + postWidthM - eps);
          // Right post occupies [halfWM - postWidthM, halfWM]
          expect(childMaxX).toBeLessThanOrEqual(halfWM - postWidthM + eps);
        }
      });
    });

    // ========================================================================
    // 5. Top-Level Container Selection & Assignment (Phase 3.5)
    // ========================================================================
    describe("5. Top-Level Container Selection & Assignment", () => {
      it("selects the top-level container distinctly from compartments", () => {
        let state = createInitialBuilderState("build", "loc-cabinet-01");
        expect(state.selectedContainer).toBe(false);
        expect(state.selectedSlotId).toBe("drawer_slot_r0_c0");

        state = selectContainer(state);
        expect(state.selectedContainer).toBe(true);
        expect(state.selectedSlotId).toBeNull();

        // Selecting a compartment clears the container selection
        state = selectCompartment(state, "drawer_slot_r2_c3");
        expect(state.selectedContainer).toBe(false);
        expect(state.selectedSlotId).toBe("drawer_slot_r2_c3");
      });

      it("allows container selection on a brand-new unsaved layout", () => {
        let state = createInitialBuilderState();
        // No persisted layout yet: preview already exists and the container is selectable
        expect(state.loadedLayoutId).toBeNull();
        expect(state.generatedResult?.totalCompartments).toBe(60);

        state = selectContainer(state);
        expect(state.selectedContainer).toBe(true);
      });

      it("preserves container selection across geometry changes and draft resets", () => {
        let state = selectContainer(
          createInitialBuilderState("build", "loc-cabinet-01"),
        );

        state = updateParametricConfig(state, {
          ...state.config,
          dimensions: { widthMm: 750, heightMm: 900, depthMm: 300 },
        });
        expect(state.selectedContainer).toBe(true);
        expect(state.selectedSlotId).toBeNull();

        state = resetWorkspaceToDraft(state, "loc-cabinet-01");
        expect(state.selectedContainer).toBe(false);
      });

      it("assigns the container location without creating a compartment mapping", () => {
        let state = createInitialBuilderState("build", null);
        expect(state.mappings.size).toBe(0);

        state = setSelectedParentLocation(
          state,
          "loc-cabinet-01",
          hierarchyLocations,
        );

        // The container lives on parentLocationId, never in slot mappings
        expect(state.selectedParentLocationId).toBe("loc-cabinet-01");
        expect(state.mappings.size).toBe(0);
        expect(
          formatWorkspaceMappingsForApi(state.mappings, state.generatedResult),
        ).toEqual([]);
      });

      it("rejects assigning a container location that is already mapped to a compartment", () => {
        // Map drawer A01 to a compartment first
        let state = createInitialBuilderState("build", "loc-cabinet-01");
        const slotId = state.generatedResult!.compartments[0]!.slotId;
        state = mapSlotToLocation(
          state,
          slotId,
          hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
          hierarchyLocations,
        );
        expect(state.mappings.get(slotId)?.locationId).toBe("loc-drawer-a01");

        // Assigning that same location as the top-level container surfaces an
        // explicit parent conflict (never a silent dual assignment)
        state = setSelectedParentLocation(
          state,
          "loc-drawer-a01",
          hierarchyLocations,
        );
        const conflicted = state.mappings.get(slotId)!;
        expect(conflicted.isStale).toBe(true);
        expect(
          conflicted.staleReason?.startsWith(PARENT_CONFLICT_STALE_PREFIX),
        ).toBe(true);
        expect(conflicted.locationId).toBe("loc-drawer-a01");
      });

      it("rejects mapping the assigned container location to a compartment afterwards", () => {
        const state = createInitialBuilderState("build", "loc-cabinet-01");
        const slotId = state.generatedResult!.compartments[0]!.slotId;

        const after = mapSlotToLocation(
          state,
          slotId,
          hierarchyLocations.find((l) => l.id === "loc-cabinet-01")!,
          hierarchyLocations,
        );

        // Unchanged: the container cannot also be a compartment slot
        expect(after.mappings.size).toBe(0);
        expect(after).toBe(state);
      });

      // ========================================================================
      // 6. Parent-First Workflow Gate (shared across 2D and 3D)
      // ========================================================================
      describe("6. Parent-First Workflow Gate", () => {
        it("derives child interaction from the single authoritative draft condition", () => {
          const unassigned = createInitialBuilderState("build", null);
          expect(isChildInteractionEnabled(unassigned)).toBe(false);
          expect(unassigned.selectedContainer).toBe(true);
          expect(unassigned.selectedSlotId).toBeNull();

          const assigned = withAssignedParent(createInitialBuilderState());
          expect(isChildInteractionEnabled(assigned)).toBe(true);
        });

        it("does not select or map child compartments while no parent is assigned", () => {
          const state = createInitialBuilderState("build", null);
          const slotId = state.generatedResult!.compartments[0]!.slotId;

          // Child selection is rejected outright
          const afterSelect = selectCompartment(state, slotId);
          expect(afterSelect).toBe(state);

          // Child mapping is rejected outright
          const afterMap = mapSlotToLocation(
            afterSelect,
            slotId,
            hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
            hierarchyLocations,
          );
          expect(afterMap.mappings.size).toBe(0);
          expect(afterMap).toBe(afterSelect);
        });

        it("enables child selection and mapping immediately after assigning a parent", () => {
          let state = createInitialBuilderState("build", null);
          state = setSelectedParentLocation(
            state,
            "loc-cabinet-01",
            hierarchyLocations,
          );
          expect(isChildInteractionEnabled(state)).toBe(true);

          const slotId = state.generatedResult!.compartments[0]!.slotId;
          state = selectCompartment(state, slotId);
          expect(state.selectedSlotId).toBe(slotId);
          expect(state.selectedContainer).toBe(false);

          state = mapSlotToLocation(
            state,
            slotId,
            hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
            hierarchyLocations,
          );
          expect(state.mappings.get(slotId)?.locationId).toBe("loc-drawer-a01");
        });

        it("disables child interaction again when the parent is removed without discarding mappings", () => {
          // Assign parent, map a slot, then clear the container assignment
          let state = withAssignedParent(createInitialBuilderState());
          const slotId = state.generatedResult!.compartments[0]!.slotId;
          state = mapSlotToLocation(
            state,
            slotId,
            hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
            hierarchyLocations,
          );
          expect(state.mappings.size).toBe(1);

          state = setSelectedParentLocation(state, null, hierarchyLocations);

          // Gate closes, container becomes the active target, selection is cleared
          expect(isChildInteractionEnabled(state)).toBe(false);
          expect(state.selectedContainer).toBe(true);
          expect(state.selectedSlotId).toBeNull();

          // The mapping is preserved but explicitly flagged for review
          const preserved = state.mappings.get(slotId)!;
          expect(preserved.locationId).toBe("loc-drawer-a01");
          expect(preserved.isStale).toBe(true);
          expect(preserved.staleReason).toContain(
            "No parent container selected",
          );

          // Child selection and mapping are rejected again
          expect(selectCompartment(state, slotId)).toBe(state);
          expect(
            mapSlotToLocation(
              state,
              slotId,
              hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
              hierarchyLocations,
            ),
          ).toBe(state);
        });

        it("normalises URL synchronisation without a location back to the container target", () => {
          const assigned = withAssignedParent(createInitialBuilderState());
          const slotId = assigned.generatedResult!.compartments[0]!.slotId;
          const withSlot = selectCompartment(assigned, slotId);
          expect(withSlot.selectedSlotId).toBe(slotId);

          const { state: synced, changed } = syncStateFromUrl(
            withSlot,
            new URLSearchParams(""),
            hierarchyLocations,
          );

          expect(changed).toBe(true);
          expect(synced.selectedParentLocationId).toBeNull();
          expect(synced.selectedContainer).toBe(true);
          expect(synced.selectedSlotId).toBeNull();
        });
      });

      it("loading a persisted layout restores compartment focus without a stale container selection", () => {
        const config = createDefaultSmdCabinetConfig();
        const generated = generateStorageCompartments(config);
        const layout: SpatialLayoutWithMappings = {
          id: "layout-1",
          parentLocationId: "loc-cabinet-01",
          code: "LAYOUT-1",
          name: "Persisted Layout",
          description: null,
          templateType: config.templateType,
          engineVersion: "1.0.0",
          config,
          revision: 1,
          status: "DRAFT",
          totalCompartments: generated.totalCompartments,
          metadata: {},
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          mappings: [],
        };

        let state = selectContainer(
          createInitialBuilderState("build", "loc-cabinet-01"),
        );
        state = loadLayoutIntoWorkspace(state, layout, hierarchyLocations);

        expect(state.selectedContainer).toBe(false);
        expect(state.selectedSlotId).toBe("drawer_slot_r0_c0");
        expect(state.selectedParentLocationId).toBe("loc-cabinet-01");
      });

      it("keeps descendant-only eligibility rules for compartments", () => {
        const inactiveDrawer: LocationDto = {
          ...hierarchyLocations.find((l) => l.id === "loc-drawer-a01")!,
          id: "loc-drawer-inactive",
          code: "DRW-INACTIVE",
          isActive: false,
        };
        const locationsWithInactive = [...hierarchyLocations, inactiveDrawer];

        const state = createInitialBuilderState("build", "loc-cabinet-01");
        const slotId = state.generatedResult!.compartments[0]!.slotId;

        // Unrelated hierarchy is rejected
        const unrelated = mapSlotToLocation(
          state,
          slotId,
          hierarchyLocations.find((l) => l.id === "loc-drawer-b01")!,
          locationsWithInactive,
        );
        expect(unrelated.mappings.size).toBe(0);

        // Inactive descendant remains a descendant (activity is enforced at publish)
        const inactiveMapped = mapSlotToLocation(
          state,
          slotId,
          inactiveDrawer,
          locationsWithInactive,
        );
        expect(inactiveMapped.mappings.get(slotId)?.locationId).toBe(
          "loc-drawer-inactive",
        );
      });
    });
  });
});
