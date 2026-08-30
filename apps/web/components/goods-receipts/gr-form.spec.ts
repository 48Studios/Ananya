import { describe, it, expect } from "vitest";
import type { PurchaseOrderDto, PurchaseOrderStatus } from "@/lib/api/purchase-orders-api";

const RECEIVABLE_STATUSES: Set<PurchaseOrderStatus> = new Set([
  "SUBMITTED",
  "APPROVED",
  "ISSUED",
  "PARTIALLY_RECEIVED",
]);

export function filterReceivablePurchaseOrders(
  pos: PurchaseOrderDto[],
): PurchaseOrderDto[] {
  return pos.filter((p) => {
    if (!RECEIVABLE_STATUSES.has(p.status)) return false;
    if (p.lines && p.lines.length > 0) {
      const hasRemaining = p.lines.some(
        (l) => l.quantityOrdered - l.quantityReceived > 0,
      );
      if (!hasRemaining) return false;
    }
    return true;
  });
}

describe("filterReceivablePurchaseOrders", () => {
  const basePo: PurchaseOrderDto = {
    id: "po-1",
    poNumber: "PO-2026-001",
    supplierId: "sup-1",
    status: "APPROVED",
    currency: "INR",
    subtotal: 100,
    taxTotal: 18,
    grandTotal: 118,
    lines: [
      {
        id: "line-1",
        purchaseOrderId: "po-1",
        componentId: "comp-1",
        unitPrice: 10,
        quantityOrdered: 10,
        quantityReceived: 0,
        taxRate: 18,
        lineTotal: 118,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  it("includes SUBMITTED, APPROVED, ISSUED, and PARTIALLY_RECEIVED purchase orders", () => {
    const statuses: PurchaseOrderStatus[] = [
      "SUBMITTED",
      "APPROVED",
      "ISSUED",
      "PARTIALLY_RECEIVED",
    ];

    statuses.forEach((status) => {
      const pos = [{ ...basePo, status }];
      expect(filterReceivablePurchaseOrders(pos)).toHaveLength(1);
    });
  });

  it("excludes DRAFT, FULFILLED, and CANCELLED purchase orders", () => {
    const excludedStatuses: PurchaseOrderStatus[] = [
      "DRAFT",
      "FULFILLED",
      "CANCELLED",
    ];

    excludedStatuses.forEach((status) => {
      const pos = [{ ...basePo, status }];
      expect(filterReceivablePurchaseOrders(pos)).toHaveLength(0);
    });
  });

  it("excludes purchase orders where all lines are fully received", () => {
    const fullyReceivedPo: PurchaseOrderDto = {
      ...basePo,
      status: "PARTIALLY_RECEIVED",
      lines: [
        {
          id: "line-1",
          purchaseOrderId: "po-1",
          componentId: "comp-1",
          unitPrice: 10,
          quantityOrdered: 10,
          quantityReceived: 10,
          taxRate: 18,
          lineTotal: 118,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
    };

    expect(filterReceivablePurchaseOrders([fullyReceivedPo])).toHaveLength(0);
  });

  it("includes purchase orders with partial remaining quantity", () => {
    const partiallyReceivedPo: PurchaseOrderDto = {
      ...basePo,
      status: "PARTIALLY_RECEIVED",
      lines: [
        {
          id: "line-1",
          purchaseOrderId: "po-1",
          componentId: "comp-1",
          unitPrice: 10,
          quantityOrdered: 10,
          quantityReceived: 4,
          taxRate: 18,
          lineTotal: 118,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
    };

    expect(filterReceivablePurchaseOrders([partiallyReceivedPo])).toHaveLength(1);
  });
});
