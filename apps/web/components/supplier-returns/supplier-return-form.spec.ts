import { describe, it, expect } from "vitest";
import type { SupplierDto } from "@/lib/api/suppliers-api";
import type { PurchaseOrderDto } from "@/lib/api/purchase-orders-api";
import { formatCurrency } from "../../lib/formatters";

// Helper functions mirroring the component logic for deterministic testing
export function filterPurchaseOrdersBySupplier(
  pos: PurchaseOrderDto[],
  supplierId?: string,
): PurchaseOrderDto[] {
  if (!supplierId) return pos;
  return pos.filter((po) => po.supplierId === supplierId);
}

export function buildSupplierOptions(suppliers: SupplierDto[]) {
  return suppliers
    .filter((s) => s.isActive !== false)
    .map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: s.code ? `Code: ${s.code}` : undefined,
      chip: s.code || undefined,
    }));
}

export function buildPoOptions(pos: PurchaseOrderDto[]) {
  return pos.map((po) => {
    const totalNum = Number(po.grandTotal) || 0;
    return {
      value: po.id,
      label: po.poNumber,
      sublabel: `${po.status} • Total: ${formatCurrency(totalNum)}`,
      chip: po.status,
    };
  });
}

export function resolveSupplierChangePoClear(
  currentPoId: string,
  newSupplierId: string,
  purchaseOrders: PurchaseOrderDto[],
): string {
  if (!currentPoId) return "";
  const po = purchaseOrders.find((p) => p.id === currentPoId);
  if (po && po.supplierId !== newSupplierId) {
    return "";
  }
  return currentPoId;
}

export function resolvePoSelectionAutoSupplier(
  selectedPoId: string,
  purchaseOrders: PurchaseOrderDto[],
): string | undefined {
  if (!selectedPoId) return undefined;
  const po = purchaseOrders.find((p) => p.id === selectedPoId);
  return po?.supplierId;
}

describe("Supplier Return Form Logic", () => {
  const mockSuppliers: SupplierDto[] = [
    {
      id: "sup-1",
      code: "SUP-001",
      name: "Acme Components Corp",
      paymentTerms: "NET30",
      currency: "INR",
      rating: 5,
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "sup-2",
      code: "SUP-002",
      name: "Global Semi Ltd",
      paymentTerms: "NET60",
      currency: "USD",
      rating: 4,
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "sup-inactive",
      code: "SUP-INACT",
      name: "Inactive Supplier",
      paymentTerms: "PREPAID",
      currency: "INR",
      rating: 1,
      isActive: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const mockPurchaseOrders: PurchaseOrderDto[] = [
    {
      id: "po-1",
      poNumber: "PO-2026-0001",
      supplierId: "sup-1",
      status: "APPROVED",
      currency: "INR",
      subtotal: 1000,
      taxTotal: 180,
      grandTotal: 1180,
      lines: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "po-2",
      poNumber: "PO-2026-0002",
      supplierId: "sup-1",
      status: "ISSUED",
      currency: "INR",
      subtotal: 500,
      taxTotal: 90,
      grandTotal: 590,
      lines: [],
      createdAt: "2026-01-02",
      updatedAt: "2026-01-02",
    },
    {
      id: "po-3",
      poNumber: "PO-2026-0003",
      supplierId: "sup-2",
      status: "FULFILLED",
      currency: "USD",
      subtotal: 200,
      taxTotal: 0,
      grandTotal: 200,
      lines: [],
      createdAt: "2026-01-03",
      updatedAt: "2026-01-03",
    },
  ];

  describe("buildSupplierOptions", () => {
    it("transforms active suppliers into SearchableSelect options and excludes inactive ones", () => {
      const options = buildSupplierOptions(mockSuppliers);
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({
        value: "sup-1",
        label: "Acme Components Corp",
        sublabel: "Code: SUP-001",
        chip: "SUP-001",
      });
      expect(options[1]).toEqual({
        value: "sup-2",
        label: "Global Semi Ltd",
        sublabel: "Code: SUP-002",
        chip: "SUP-002",
      });
    });
  });

  describe("filterPurchaseOrdersBySupplier", () => {
    it("returns all purchase orders when no supplier is selected", () => {
      const filtered = filterPurchaseOrdersBySupplier(mockPurchaseOrders, "");
      expect(filtered).toHaveLength(3);
    });

    it("filters purchase orders to only those matching the selected supplier ID", () => {
      const filteredSup1 = filterPurchaseOrdersBySupplier(mockPurchaseOrders, "sup-1");
      expect(filteredSup1).toHaveLength(2);
      expect(filteredSup1.every((p) => p.supplierId === "sup-1")).toBe(true);

      const filteredSup2 = filterPurchaseOrdersBySupplier(mockPurchaseOrders, "sup-2");
      expect(filteredSup2).toHaveLength(1);
      expect(filteredSup2[0].id).toBe("po-3");
    });
  });

  describe("buildPoOptions", () => {
    it("formats purchase orders with poNumber, status, and formatted grand total", () => {
      const options = buildPoOptions([mockPurchaseOrders[0]]);
      expect(options).toHaveLength(1);
      expect(options[0].value).toBe("po-1");
      expect(options[0].label).toBe("PO-2026-0001");
      expect(options[0].chip).toBe("APPROVED");
      expect(options[0].sublabel).toContain("APPROVED");
      expect(options[0].sublabel).toContain("1,180.00");
    });
  });

  describe("resolveSupplierChangePoClear", () => {
    it("clears PO if selected PO does not belong to the newly selected supplier", () => {
      const remainingPo = resolveSupplierChangePoClear("po-1", "sup-2", mockPurchaseOrders);
      expect(remainingPo).toBe("");
    });

    it("preserves PO if selected PO belongs to the newly selected supplier", () => {
      const remainingPo = resolveSupplierChangePoClear("po-1", "sup-1", mockPurchaseOrders);
      expect(remainingPo).toBe("po-1");
    });
  });

  describe("resolvePoSelectionAutoSupplier", () => {
    it("automatically identifies supplier from the selected purchase order", () => {
      expect(resolvePoSelectionAutoSupplier("po-1", mockPurchaseOrders)).toBe("sup-1");
      expect(resolvePoSelectionAutoSupplier("po-3", mockPurchaseOrders)).toBe("sup-2");
      expect(resolvePoSelectionAutoSupplier("", mockPurchaseOrders)).toBeUndefined();
    });
  });
});
