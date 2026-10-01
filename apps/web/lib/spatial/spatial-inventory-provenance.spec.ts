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
});
