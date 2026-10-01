import { describe, expect, it } from "vitest";
import {
  mapSpatialInventory,
  formatUnitsBreakdown,
  extractLocationCapacity,
} from "./spatial-inventory-mapper";
import type { LocationOperationalViewChildDto } from "../api/spatial-api";
import type { InventoryProjectionDto } from "../api/inventory-projections-api";
import type { ComponentDto } from "../api/components-api";

function createChild(
  id: string,
  code: string,
  parentId: string,
  metadata?: Record<string, unknown>,
): LocationOperationalViewChildDto {
  return {
    location: {
      id,
      code,
      name: `Location ${code}`,
      kind: "drawer",
      parentId,
      isActive: true,
      metadata: metadata || {},
    },
    node: {
      id: `node-${id}`,
      locationId: id,
      modelId: "model-1",
      parentSpatialNodeId: null,
      anchorId: null,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      isVisible: true,
      metadata: {},
    },
    model: null,
    anchor: null,
  };
}

describe("Spatial Inventory Provenance & Unit-Safe Aggregation", () => {
  const componentMap = new Map<string, ComponentDto>([
    [
      "comp-resistor",
      {
        id: "comp-resistor",
        sku: "RES-10K",
        name: "10k Resistor",
        unit: "pcs",
      } as ComponentDto,
    ],
    [
      "comp-reel",
      {
        id: "comp-reel",
        sku: "REEL-CAP",
        name: "Capacitor Reel",
        unit: "reels",
      } as ComponentDto,
    ],
    [
      "comp-wire",
      {
        id: "comp-wire",
        sku: "WIRE-COPPER",
        name: "Copper Wire",
        unit: "meters",
      } as ComponentDto,
    ],
  ]);

  it("1. Accurately separates direct inventory from nested descendant inventory", () => {
    const parentId = "loc-cabinet";
    const children = [
      createChild("loc-drawer-1", "D01", parentId),
      createChild("loc-drawer-2", "D02", parentId),
    ];

    const descendantLocations = [
      { id: "loc-drawer-1", parentId: "loc-cabinet", name: "Drawer 1", code: "D01" },
      { id: "loc-bin-1a", parentId: "loc-drawer-1", name: "Sub Bin 1A", code: "B01" },
      { id: "loc-drawer-2", parentId: "loc-cabinet", name: "Drawer 2", code: "D02" },
    ];

    const projections: InventoryProjectionDto[] = [
      // Direct at parent cabinet
      {
        id: "p0",
        locationId: parentId,
        componentId: "comp-wire",
        quantity: 50,
        unitOfMeasure: "meters",
        lastUpdated: "2026-10-01T00:00:00Z",
      },
      // Direct at Drawer 1
      {
        id: "p1",
        locationId: "loc-drawer-1",
        componentId: "comp-resistor",
        quantity: 300,
        unitOfMeasure: "pcs",
        lastUpdated: "2026-10-01T00:00:00Z",
      },
      // Descendant in Bin 1A (inside Drawer 1)
      {
        id: "p2",
        locationId: "loc-bin-1a",
        componentId: "comp-reel",
        quantity: 5,
        unitOfMeasure: "reels",
        lastUpdated: "2026-10-01T00:00:00Z",
      },
    ];

    const mapped = mapSpatialInventory(
      parentId,
      children,
      descendantLocations,
      projections,
      componentMap,
    );

    // Parent assertions
    expect(mapped.parentDirectQuantity).toBe(50);
    expect(mapped.parentDirectUnitsByMeasure).toEqual({ meters: 50 });
    expect(mapped.parentProvenanceStatus).toBe("direct-only");

    // Drawer 1 assertions (mixed: direct resistor + descendant reel in sub-bin)
    const d1 = mapped.cellStockMap.get("loc-drawer-1")!;
    expect(d1.directComponentCount).toBe(1);
    expect(d1.descendantComponentCount).toBe(1);
    expect(d1.directUnitsByMeasure).toEqual({ pcs: 300 });
    expect(d1.descendantUnitsByMeasure).toEqual({ reels: 5 });
    expect(d1.totalUnitsByMeasure).toEqual({ pcs: 300, reels: 5 });
    expect(d1.provenanceStatus).toBe("mixed");

    // Drawer 2 assertions (empty)
    const d2 = mapped.cellStockMap.get("loc-drawer-2")!;
    expect(d2.hasStock).toBe(false);
    expect(d2.provenanceStatus).toBe("empty");
    expect(d2.totalUnitsByMeasure).toEqual({});
  });

  it("2. Distinguishes incompatible units without combining into a bogus sum", () => {
    const units = { pcs: 500, reels: 2, meters: 15 };
    const formatted = formatUnitsBreakdown(units);
    expect(formatted).toBe("500 pcs, 2 reels, 15 meters");

    // Single unit format
    expect(formatUnitsBreakdown({ pcs: 1200 })).toBe("1,200 pcs");

    // Empty fallback
    expect(formatUnitsBreakdown({})).toBe("0 units");
    expect(formatUnitsBreakdown(null)).toBe("0 units");
  });

  it("3. Does not infer capacity when capacity is unspecified (reports presence without percentage)", () => {
    const parentId = "loc-cab";
    const children = [
      createChild("loc-drawer", "D01", parentId), // No capacity metadata
    ];

    const projections: InventoryProjectionDto[] = [
      {
        id: "p1",
        locationId: "loc-drawer",
        componentId: "comp-resistor",
        quantity: 450,
        unitOfMeasure: "pcs",
        lastUpdated: "2026-10-01T00:00:00Z",
      },
    ];

    const mapped = mapSpatialInventory(
      parentId,
      children,
      [{ id: "loc-drawer", parentId, name: "Drawer" }],
      projections,
      componentMap,
    );

    const d = mapped.cellStockMap.get("loc-drawer")!;
    expect(d.capacity).toBeNull();
    expect(d.fillRatio).toBeNull(); // ZERO inferred percentage
    expect(d.occupancyLevel).toBe("unspecified"); // Reports presence without speculative percentage
  });

  it("4. Accurately computes occupancy levels when capacity is explicitly configured", () => {
    const parentId = "loc-cab";
    const children = [
      createChild("loc-low", "LOW", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-mod", "MOD", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-high", "HIGH", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-over", "OVER", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-empty", "EMPTY", parentId, { capacity: 1000, capacityUnit: "pcs" }),
    ];

    const projections: InventoryProjectionDto[] = [
      { id: "1", locationId: "loc-low", componentId: "comp-resistor", quantity: 200, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "2", locationId: "loc-mod", componentId: "comp-resistor", quantity: 700, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "3", locationId: "loc-high", componentId: "comp-resistor", quantity: 950, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "4", locationId: "loc-over", componentId: "comp-resistor", quantity: 1200, unitOfMeasure: "pcs", lastUpdated: "" },
    ];

    const mapped = mapSpatialInventory(
      parentId,
      children,
      children.map((c) => ({ id: c.location.id, parentId, name: c.location.name, code: c.location.code })),
      projections,
      componentMap,
    );

    expect(mapped.cellStockMap.get("loc-low")!.occupancyLevel).toBe("low");
    expect(mapped.cellStockMap.get("loc-low")!.fillRatio).toBe(0.2);

    expect(mapped.cellStockMap.get("loc-mod")!.occupancyLevel).toBe("moderate");
    expect(mapped.cellStockMap.get("loc-mod")!.fillRatio).toBe(0.7);

    expect(mapped.cellStockMap.get("loc-high")!.occupancyLevel).toBe("high");
    expect(mapped.cellStockMap.get("loc-high")!.fillRatio).toBe(0.95);

    expect(mapped.cellStockMap.get("loc-over")!.occupancyLevel).toBe("over-capacity");
    expect(mapped.cellStockMap.get("loc-over")!.fillRatio).toBe(1.2);

    expect(mapped.cellStockMap.get("loc-empty")!.occupancyLevel).toBe("empty");
    expect(mapped.cellStockMap.get("loc-empty")!.fillRatio).toBe(0);
  });

  it("5. Extracts capacity metadata safely from location metadata", () => {
    expect(extractLocationCapacity(undefined)).toEqual({ capacity: null, capacityUnit: null });
    expect(extractLocationCapacity(null)).toEqual({ capacity: null, capacityUnit: null });
    expect(extractLocationCapacity({})).toEqual({ capacity: null, capacityUnit: null });
    expect(extractLocationCapacity({ capacity: 500, capacityUnit: "pcs" })).toEqual({
      capacity: 500,
      capacityUnit: "pcs",
    });
    expect(extractLocationCapacity({ maxCapacity: "1200", capacity_unit: "reels" })).toEqual({
      capacity: 1200,
      capacityUnit: "reels",
    });
  });

  it("6. Multi-tier nested hierarchy (A -> B -> C): preserves strict provenance separation and prevents double-counting", () => {
    const rootA = "loc-room-a";
    const childB = createChild("loc-rack-b", "RACK-B", rootA);

    const hierarchy = [
      { id: "loc-room-a", parentId: null, name: "Room A", code: "ROOM-A" },
      { id: "loc-rack-b", parentId: "loc-room-a", name: "Rack B", code: "RACK-B" },
      { id: "loc-shelf-c", parentId: "loc-rack-b", name: "Shelf C", code: "SHELF-C" },
      { id: "loc-bin-d", parentId: "loc-shelf-c", name: "Bin D", code: "BIN-D" },
    ];

    const projections: InventoryProjectionDto[] = [
      // Direct at Root A
      {
        id: "p-a",
        locationId: "loc-room-a",
        componentId: "comp-resistor",
        quantity: 100,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      // Direct at Child B
      {
        id: "p-b",
        locationId: "loc-rack-b",
        componentId: "comp-resistor",
        quantity: 50,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      // Direct at Grandchild C
      {
        id: "p-c",
        locationId: "loc-shelf-c",
        componentId: "comp-resistor",
        quantity: 25,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      // Direct at Great-grandchild D
      {
        id: "p-d",
        locationId: "loc-bin-d",
        componentId: "comp-resistor",
        quantity: 10,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
    ];

    const mapped = mapSpatialInventory(
      rootA,
      [childB],
      hierarchy,
      projections,
      componentMap,
    );

    // Root A direct assertions
    expect(mapped.parentDirectQuantity).toBe(100);
    expect(mapped.parentDirectUnitsByMeasure).toEqual({ pcs: 100 });

    // Child B assertions
    const bSummary = mapped.cellStockMap.get("loc-rack-b")!;
    expect(bSummary.directUnitsByMeasure).toEqual({ pcs: 50 });
    // Descendants under B are C (25) + D (10) = 35 pcs
    expect(bSummary.descendantUnitsByMeasure).toEqual({ pcs: 35 });
    expect(bSummary.totalUnitsByMeasure).toEqual({ pcs: 85 });
    expect(bSummary.totalQuantity).toBe(85);
    expect(bSummary.provenanceStatus).toBe("mixed");

    // Total scene units = 100 (direct at A) + 85 (total in B subtree) = 185
    // CRITICAL: Descendants are counted exactly once with zero double-counting
    expect(mapped.stats.totalUnits).toBe(185);
    expect(mapped.stats.totalUnitsBreakdown).toBe("185 pcs");
  });

  it("7. Incompatible or unknown capacity units: reports presence without implying false percentage", () => {
    const parentId = "loc-warehouse";
    const children = [
      // Capacity configured in kg, but stored stock is in pcs
      createChild("loc-incompatible", "INCOMPAT", parentId, {
        capacity: 100,
        capacityUnit: "kg",
      }),
      // Capacity numeric configured, but unit is unknown (null)
      createChild("loc-no-unit", "NO-UNIT", parentId, {
        capacity: 500,
      }),
      // Capacity in pcs, but compartment contains mixed incompatible units (pcs + reels)
      createChild("loc-mixed-units", "MIXED", parentId, {
        capacity: 1000,
        capacityUnit: "pcs",
      }),
    ];

    const projections: InventoryProjectionDto[] = [
      {
        id: "p1",
        locationId: "loc-incompatible",
        componentId: "comp-resistor",
        quantity: 200,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      {
        id: "p2",
        locationId: "loc-no-unit",
        componentId: "comp-resistor",
        quantity: 250,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      {
        id: "p3",
        locationId: "loc-mixed-units",
        componentId: "comp-resistor",
        quantity: 500,
        unitOfMeasure: "pcs",
        lastUpdated: "",
      },
      {
        id: "p4",
        locationId: "loc-mixed-units",
        componentId: "comp-reel",
        quantity: 3,
        unitOfMeasure: "reels",
        lastUpdated: "",
      },
    ];

    const mapped = mapSpatialInventory(
      parentId,
      children,
      children.map((c) => ({ id: c.location.id, parentId, name: c.location.name, code: c.location.code })),
      projections,
      componentMap,
    );

    // Incompatible unit (kg vs pcs)
    const incomp = mapped.cellStockMap.get("loc-incompatible")!;
    expect(incomp.hasStock).toBe(true);
    expect(incomp.fillRatio).toBeNull();
    expect(incomp.occupancyLevel).toBe("unspecified");

    // Unknown capacity unit
    const noUnit = mapped.cellStockMap.get("loc-no-unit")!;
    expect(noUnit.hasStock).toBe(true);
    expect(noUnit.fillRatio).toBeNull();
    expect(noUnit.occupancyLevel).toBe("unspecified");

    // Mixed incompatible units
    const mixed = mapped.cellStockMap.get("loc-mixed-units")!;
    expect(mixed.hasStock).toBe(true);
    expect(mixed.fillRatio).toBeNull();
    expect(mixed.occupancyLevel).toBe("unspecified");
  });

  it("8. Strict occupancy boundary tests (empty, low, moderate, high, exact 100%, and over-capacity)", () => {
    const parentId = "loc-warehouse";
    const children = [
      createChild("loc-b-49", "B49", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-b-50", "B50", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-b-79", "B79", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-b-80", "B80", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-b-100", "B100", parentId, { capacity: 1000, capacityUnit: "pcs" }),
      createChild("loc-b-101", "B101", parentId, { capacity: 1000, capacityUnit: "pcs" }),
    ];

    const projections: InventoryProjectionDto[] = [
      { id: "1", locationId: "loc-b-49", componentId: "comp-resistor", quantity: 490, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "2", locationId: "loc-b-50", componentId: "comp-resistor", quantity: 500, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "3", locationId: "loc-b-79", componentId: "comp-resistor", quantity: 790, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "4", locationId: "loc-b-80", componentId: "comp-resistor", quantity: 800, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "5", locationId: "loc-b-100", componentId: "comp-resistor", quantity: 1000, unitOfMeasure: "pcs", lastUpdated: "" },
      { id: "6", locationId: "loc-b-101", componentId: "comp-resistor", quantity: 1010, unitOfMeasure: "pcs", lastUpdated: "" },
    ];

    const mapped = mapSpatialInventory(
      parentId,
      children,
      children.map((c) => ({ id: c.location.id, parentId, name: c.location.name, code: c.location.code })),
      projections,
      componentMap,
    );

    // 49% -> Low (<50%)
    expect(mapped.cellStockMap.get("loc-b-49")!.fillRatio).toBe(0.49);
    expect(mapped.cellStockMap.get("loc-b-49")!.occupancyLevel).toBe("low");

    // 50% -> Moderate (50–79%)
    expect(mapped.cellStockMap.get("loc-b-50")!.fillRatio).toBe(0.5);
    expect(mapped.cellStockMap.get("loc-b-50")!.occupancyLevel).toBe("moderate");

    // 79% -> Moderate (50–79%)
    expect(mapped.cellStockMap.get("loc-b-79")!.fillRatio).toBe(0.79);
    expect(mapped.cellStockMap.get("loc-b-79")!.occupancyLevel).toBe("moderate");

    // 80% -> High (80–100%)
    expect(mapped.cellStockMap.get("loc-b-80")!.fillRatio).toBe(0.8);
    expect(mapped.cellStockMap.get("loc-b-80")!.occupancyLevel).toBe("high");

    // 100% -> High (Exact 100%)
    expect(mapped.cellStockMap.get("loc-b-100")!.fillRatio).toBe(1.0);
    expect(mapped.cellStockMap.get("loc-b-100")!.occupancyLevel).toBe("high");

    // 101% -> Over-capacity (>100%)
    expect(mapped.cellStockMap.get("loc-b-101")!.fillRatio).toBe(1.01);
    expect(mapped.cellStockMap.get("loc-b-101")!.occupancyLevel).toBe("over-capacity");
  });
});
