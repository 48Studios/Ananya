import { describe, expect, it } from "vitest";
import { computeSpatialLayout } from "./spatial-layout";
import { mapSpatialInventory } from "./spatial-inventory-mapper";
import type {
  LocationOperationalViewChildDto,
  SpatialNodeDto,
  SpatialAnchorDto,
} from "../api/spatial-api";
import type { InventoryProjectionDto } from "../api/inventory-projections-api";
import type { ComponentDto } from "../api/components-api";

function makeChild(
  id: string,
  code: string,
  parentId: string,
  isMapped = false,
  nodeTransform?: { posX: number; posY: number },
  anchorOffset?: { posX: number; posY: number },
): LocationOperationalViewChildDto {
  return {
    location: {
      id,
      code,
      name: `Drawer ${code}`,
      kind: "drawer",
      parentId,
      isActive: true,
    },
    node: isMapped
      ? ({
          id: `node-${id}`,
          locationId: id,
          modelId: "model-1",
          parentSpatialNodeId: "node-parent",
          anchorId: anchorOffset ? `anchor-${id}` : null,
          positionX: nodeTransform?.posX ?? 0,
          positionY: nodeTransform?.posY ?? 0,
          positionZ: 0,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          isVisible: true,
          metadata: {},
        } as unknown as SpatialNodeDto)
      : null,
    model: null,
    anchor: anchorOffset
      ? ({
          id: `anchor-${id}`,
          modelId: "model-1",
          code,
          name: `Anchor ${code}`,
          anchorType: "DRAWER",
          localPositionX: anchorOffset.posX,
          localPositionY: anchorOffset.posY,
          localPositionZ: 0,
          localRotationX: 0,
          localRotationY: 0,
          localRotationZ: 0,
          boundingWidthMm: 50,
          boundingHeightMm: 30,
          boundingDepthMm: 120,
          metadata: {},
        } as unknown as SpatialAnchorDto)
      : null,
  };
}

describe("2D Spatial Layout & Inventory Mapping", () => {
  describe("computeSpatialLayout", () => {
    it("handles empty children without throwing", () => {
      const layout = computeSpatialLayout([]);
      expect(layout.cells).toHaveLength(0);
      expect(layout.type).toBe("grid");
    });

    it("arranges matrix pattern codes into row-based layout (A01..B05)", () => {
      const children = [
        makeChild("c1", "A01", "p1"),
        makeChild("c2", "A02", "p1"),
        makeChild("c3", "B01", "p1"),
        makeChild("c4", "B02", "p1"),
      ];

      const layout = computeSpatialLayout(children);
      expect(layout.type).toBe("matrix");
      expect(layout.rows).toBeDefined();
      expect(layout.rows).toHaveLength(2);

      const rowA = layout.rows?.find((r) => r.rowLabel === "A");
      const rowB = layout.rows?.find((r) => r.rowLabel === "B");
      expect(rowA).toBeDefined();
      expect(rowB).toBeDefined();
      expect(rowA?.cells.map((c) => c.child.location.code)).toEqual(["A01", "A02"]);
      expect(rowB?.cells.map((c) => c.child.location.code)).toEqual(["B01", "B02"]);
    });

    it("prefers explicit spatial positions when provided", () => {
      const children = [
        makeChild("c1", "BIN-Z", "p1", true, { posX: 100, posY: 50 }),
        makeChild("c2", "BIN-A", "p1", true, { posX: 200, posY: 50 }),
      ];

      const layout = computeSpatialLayout(children);
      expect(layout.cells[0]?.source).toBe("explicit");
      expect(layout.cells).toHaveLength(2);
    });

    it("prefers anchor positions when nodes lack explicit coords", () => {
      const children = [
        makeChild("c1", "BIN-1", "p1", true, undefined, { posX: 10, posY: 20 }),
        makeChild("c2", "BIN-2", "p1", true, undefined, { posX: 30, posY: 20 }),
      ];

      const layout = computeSpatialLayout(children);
      expect(layout.cells[0]?.source).toBe("anchor");
      expect(layout.cells).toHaveLength(2);
    });

    it("falls back to deterministic natural alphanumeric sorting for unstructured codes", () => {
      const children = [
        makeChild("c1", "SHELF-10", "p1"),
        makeChild("c2", "SHELF-2", "p1"),
        makeChild("c3", "SHELF-1", "p1"),
      ];

      const layout = computeSpatialLayout(children);
      expect(layout.type).toBe("grid");
      expect(layout.cells.map((c) => c.child.location.code)).toEqual([
        "SHELF-1",
        "SHELF-2",
        "SHELF-10",
      ]);
    });

    it("preserves and displays unmapped child locations alongside mapped ones", () => {
      const children = [
        makeChild("c1", "DRAWER-01", "p1", true), // mapped
        makeChild("c2", "DRAWER-02", "p1", false), // unmapped
      ];

      const layout = computeSpatialLayout(children);
      expect(layout.cells).toHaveLength(2);
      expect(layout.cells.some((c) => !c.child.node)).toBe(true);
    });
  });

  describe("mapSpatialInventory (Direct vs Descendant Hierarchy)", () => {
    const parentId = "loc-cabinet";
    const child1 = makeChild("loc-d1", "D01", parentId, true);
    const child2 = makeChild("loc-d2", "D02", parentId, true);
    const children = [child1, child2];

    const descendantLocations = [
      { id: "loc-cabinet", name: "Cabinet A", parentId: null },
      { id: "loc-d1", name: "Drawer D01", parentId: "loc-cabinet" },
      { id: "loc-d2", name: "Drawer D02", parentId: "loc-cabinet" },
      { id: "loc-sub-bin-1", name: "Sub-Bin 1", parentId: "loc-d1" }, // Grandchild of cabinet
    ];

    const compMap = new Map<string, ComponentDto>([
      [
        "comp-1",
        {
          id: "comp-1",
          sku: "RES-0805-10K",
          name: "10K Resistor",
          unit: "pcs",
        } as unknown as ComponentDto,
      ],
      [
        "comp-2",
        {
          id: "comp-2",
          sku: "CAP-0603-100NF",
          name: "100nF Capacitor",
          unit: "pcs",
        } as unknown as ComponentDto,
      ],
      [
        "comp-3",
        {
          id: "comp-3",
          sku: "IC-NE555",
          name: "Timer IC",
          unit: "pcs",
        } as unknown as ComponentDto,
      ],
    ]);

    it("keeps parent direct inventory distinct and does NOT leak into child cells", () => {
      const projections: InventoryProjectionDto[] = [
        {
          id: "p-direct",
          componentId: "comp-1",
          locationId: parentId, // Direct at cabinet level
          quantity: 50,
          unitOfMeasure: "pcs",
          lastUpdated: new Date().toISOString(),
        },
      ];

      const result = mapSpatialInventory(
        parentId,
        children,
        descendantLocations,
        projections,
        compMap,
      );

      // Parent direct stock
      expect(result.parentDirectQuantity).toBe(50);
      expect(result.parentDirectProjections).toHaveLength(1);
      expect(result.parentDirectComponents[0]?.sku).toBe("RES-0805-10K");

      // Child cells must remain empty
      const d1 = result.cellStockMap.get("loc-d1")!;
      const d2 = result.cellStockMap.get("loc-d2")!;
      expect(d1.totalQuantity).toBe(0);
      expect(d1.hasStock).toBe(false);
      expect(d2.totalQuantity).toBe(0);
      expect(d2.hasStock).toBe(false);
    });

    it("associates direct child inventory with the child cell", () => {
      const projections: InventoryProjectionDto[] = [
        {
          id: "p-d1",
          componentId: "comp-2",
          locationId: "loc-d1",
          quantity: 1200,
          unitOfMeasure: "pcs",
          lastUpdated: new Date().toISOString(),
        },
      ];

      const result = mapSpatialInventory(
        parentId,
        children,
        descendantLocations,
        projections,
        compMap,
      );

      const d1 = result.cellStockMap.get("loc-d1")!;
      expect(d1.totalQuantity).toBe(1200);
      expect(d1.hasStock).toBe(true);
      expect(d1.directProjections).toHaveLength(1);
      expect(d1.descendantProjections).toHaveLength(0);
      expect(d1.components[0]?.isDirect).toBe(true);
      expect(d1.components[0]?.sku).toBe("CAP-0603-100NF");

      // D2 is empty
      const d2 = result.cellStockMap.get("loc-d2")!;
      expect(d2.hasStock).toBe(false);
    });

    it("associates grandchild inventory with child cell without flattening into parent", () => {
      // Inventory is in Sub-Bin 1 (grandchild of Cabinet A, child of Drawer D01)
      const projections: InventoryProjectionDto[] = [
        {
          id: "p-sub",
          componentId: "comp-3",
          locationId: "loc-sub-bin-1",
          quantity: 450,
          unitOfMeasure: "pcs",
          lastUpdated: new Date().toISOString(),
        },
      ];

      const result = mapSpatialInventory(
        parentId,
        children,
        descendantLocations,
        projections,
        compMap,
      );

      // Parent direct stock is 0
      expect(result.parentDirectQuantity).toBe(0);

      // Drawer D01 contains this via descendant stock
      const d1 = result.cellStockMap.get("loc-d1")!;
      expect(d1.totalQuantity).toBe(450);
      expect(d1.hasStock).toBe(true);
      expect(d1.directProjections).toHaveLength(0);
      expect(d1.descendantProjections).toHaveLength(1);
      expect(d1.components[0]?.isDirect).toBe(false);
      expect(d1.components[0]?.subLocationName).toBe("Sub-Bin 1");
      expect(d1.components[0]?.subLocationId).toBe("loc-sub-bin-1");
    });

    it("correctly computes occupancy and mapping statistics", () => {
      const projections: InventoryProjectionDto[] = [
        {
          id: "p-1",
          componentId: "comp-1",
          locationId: "loc-d1",
          quantity: 100,
          unitOfMeasure: "pcs",
          lastUpdated: new Date().toISOString(),
        },
      ];

      const result = mapSpatialInventory(
        parentId,
        children,
        descendantLocations,
        projections,
        compMap,
      );

      expect(result.stats.totalLocations).toBe(2);
      expect(result.stats.occupiedLocations).toBe(1);
      expect(result.stats.emptyLocations).toBe(1);
      expect(result.stats.mappedLocations).toBe(2);
      expect(result.stats.unmappedLocations).toBe(0);
      expect(result.stats.totalUnits).toBe(100);
    });
  });
});
