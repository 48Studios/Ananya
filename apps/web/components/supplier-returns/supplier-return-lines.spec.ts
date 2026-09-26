import { describe, it, expect } from "vitest";
import type { ComponentDto } from "@/lib/api/components-api";
import type { LocationDto } from "@/lib/api/locations-api";
import type { PurchaseOrderDto } from "@/lib/api/purchase-orders-api";
import {
  filterComponentsForSupplierReturn,
  findPoLineForComponent,
  buildReturnComponentOptions,
  filterLocationsHoldingComponent,
  buildReturnLocationOptions,
  calculateReturnQuantityCeiling,
  validateReturnQuantity,
  getAutofillUnitPrice,
} from "./supplier-return-lines.helpers";

describe("Supplier Return Line Item Helpers", () => {
  const mockComponents: ComponentDto[] = [
    {
      id: "comp-1",
      sku: "RES-10K-0805",
      name: "10k Resistor 0805",
      unit: "pcs",
      manufacturerPartNumber: "RC0805JR-0710KL",
      categoryId: "cat-passive",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "comp-2",
      sku: "CAP-10UF-0805",
      name: "10uF Capacitor 0805",
      unit: "pcs",
      manufacturerPartNumber: "CL21A106KOQNNNE",
      categoryId: "cat-passive",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "comp-3",
      sku: "MCU-STM32F4",
      name: "STM32F401 Microcontroller",
      unit: "pcs",
      categoryId: "cat-active",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const mockLocations: LocationDto[] = [
    {
      id: "loc-1",
      code: "WH1-A1",
      name: "Main Bin A1",
      kind: "BIN",
      parentId: "wh-1",
      isActive: true,
      metadata: {},
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "loc-2",
      code: "WH1-B2",
      name: "Secondary Bin B2",
      kind: "BIN",
      parentId: "wh-1",
      isActive: true,
      metadata: {},
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "loc-empty",
      code: "WH1-EMPTY",
      name: "Empty Overflow Shelf",
      kind: "SHELF",
      parentId: "wh-1",
      isActive: true,
      metadata: {},
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const mockPurchaseOrder: PurchaseOrderDto = {
    id: "po-100",
    poNumber: "PO-2026-0100",
    supplierId: "sup-1",
    status: "FULFILLED",
    currency: "INR",
    subtotal: 1000,
    taxTotal: 180,
    grandTotal: 1180,
    lines: [
      {
        id: "pol-1",
        purchaseOrderId: "po-100",
        componentId: "comp-1",
        unitPrice: 15.5,
        quantityOrdered: 100,
        quantityReceived: 100,
        taxRate: 18,
        lineTotal: 1550,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "pol-2",
        purchaseOrderId: "po-100",
        componentId: "comp-2",
        unitPrice: 42.0,
        quantityOrdered: 25,
        quantityReceived: 25,
        taxRate: 18,
        lineTotal: 1050,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  describe("filterComponentsForSupplierReturn", () => {
    it("restricts component choices strictly to those listed on the Purchase Order", () => {
      const filtered = filterComponentsForSupplierReturn(
        mockComponents,
        mockPurchaseOrder,
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.id)).toEqual(["comp-1", "comp-2"]);
      expect(filtered.some((c) => c.id === "comp-3")).toBe(false);
    });

    it("returns all components if no Purchase Order is provided or PO has no lines", () => {
      expect(
        filterComponentsForSupplierReturn(mockComponents, null),
      ).toHaveLength(3);
      expect(
        filterComponentsForSupplierReturn(mockComponents, {
          ...mockPurchaseOrder,
          lines: [],
        }),
      ).toHaveLength(3);
    });
  });

  describe("findPoLineForComponent and getAutofillUnitPrice", () => {
    it("autofills unit price from PO line for the given component", () => {
      const price1 = getAutofillUnitPrice("comp-1", mockPurchaseOrder);
      expect(price1).toBe(15.5);

      const price2 = getAutofillUnitPrice("comp-2", mockPurchaseOrder);
      expect(price2).toBe(42.0);
    });

    it("returns null if component is not on PO or PO is absent", () => {
      expect(getAutofillUnitPrice("comp-3", mockPurchaseOrder)).toBeNull();
      expect(getAutofillUnitPrice("comp-1", null)).toBeNull();
    });
  });

  describe("buildReturnComponentOptions", () => {
    it("builds options with SKU, PO quantity, and PO chip", () => {
      const options = buildReturnComponentOptions(
        mockComponents,
        mockPurchaseOrder,
      );
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({
        value: "comp-1",
        label: "10k Resistor 0805",
        sublabel: "SKU: RES-10K-0805 • PO Qty: 100",
        chip: "PO: 100",
      });
      expect(options[1]).toEqual({
        value: "comp-2",
        label: "10uF Capacitor 0805",
        sublabel: "SKU: CAP-10UF-0805 • PO Qty: 25",
        chip: "PO: 25",
      });
    });
  });

  describe("filterLocationsHoldingComponent and buildReturnLocationOptions", () => {
    const stockMap: Record<string, number> = {
      "loc-1": 60,
      "loc-2": 15,
      "loc-empty": 0,
    };

    it("returns empty array if no component is selected", () => {
      const options = buildReturnLocationOptions(mockLocations, "", stockMap);
      expect(options).toEqual([]);
    });

    it("only returns locations that have stock > 0 for the selected component", () => {
      const holding = filterLocationsHoldingComponent(
        mockLocations,
        "comp-1",
        stockMap,
      );
      expect(holding).toHaveLength(2);
      expect(holding.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);

      const options = buildReturnLocationOptions(
        mockLocations,
        "comp-1",
        stockMap,
      );
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({
        value: "loc-1",
        label: "Main Bin A1",
        sublabel: "Code: WH1-A1",
        chip: "60 in stock",
      });
      expect(options[1]).toEqual({
        value: "loc-2",
        label: "Secondary Bin B2",
        sublabel: "Code: WH1-B2",
        chip: "15 in stock",
      });
    });

    it("returns empty array when no location has stock for the component", () => {
      const emptyStockMap: Record<string, number> = {
        "loc-1": 0,
        "loc-2": 0,
      };
      const holding = filterLocationsHoldingComponent(
        mockLocations,
        "comp-1",
        emptyStockMap,
      );
      expect(holding).toHaveLength(0);
    });
  });

  describe("calculateReturnQuantityCeiling", () => {
    it("returns min of PO quantity and location stock when both exist", () => {
      // PO ordered: 100, Location stock: 40 -> max is 40
      expect(calculateReturnQuantityCeiling(100, 40)).toBe(40);
      // PO ordered: 25, Location stock: 50 -> max is 25
      expect(calculateReturnQuantityCeiling(25, 50)).toBe(25);
    });

    it("returns whichever is provided if one is undefined/null", () => {
      expect(calculateReturnQuantityCeiling(100, null)).toBe(100);
      expect(calculateReturnQuantityCeiling(null, 50)).toBe(50);
      expect(calculateReturnQuantityCeiling(undefined, undefined)).toBeUndefined();
    });
  });

  describe("validateReturnQuantity", () => {
    it("rejects non-positive numbers", () => {
      expect(validateReturnQuantity(0, 10, 10)).toBe(
        "Please enter a valid return quantity greater than 0.",
      );
      expect(validateReturnQuantity(-5, 10, 10)).toBe(
        "Please enter a valid return quantity greater than 0.",
      );
    });

    it("rejects quantity exceeding Purchase Order quantity", () => {
      const err = validateReturnQuantity(30, 25, 50);
      expect(err).toBe(
        "Return quantity (30) cannot exceed Purchase Order quantity ordered (25).",
      );
    });

    it("rejects quantity exceeding location available stock", () => {
      const err = validateReturnQuantity(60, 100, 40);
      expect(err).toBe(
        "Insufficient stock at the selected location. Available: 40, requested: 60.",
      );
    });

    it("accepts valid quantity within PO and location ceilings", () => {
      expect(validateReturnQuantity(20, 25, 50)).toBeNull();
      expect(validateReturnQuantity(25, 25, 25)).toBeNull();
    });
  });
});
