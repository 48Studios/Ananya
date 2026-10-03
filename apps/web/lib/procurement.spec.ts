import { describe, it, expect } from "vitest";
import {
  buildPurchaseInvoiceRows,
  toPurchaseInvoiceRow,
} from "./purchase-invoices";
import {
  buildSupplierReturnRows,
  toSupplierReturnRow,
} from "./supplier-returns";
import {
  toComponentLabelMap,
  toPurchaseOrderNumberMap,
  toSupplierNameMap,
} from "./procurement-labels";
import type { PurchaseInvoiceDto } from "./api/purchase-invoices-api";
import type { SupplierReturnDto } from "./api/supplier-returns-api";

const invoice: PurchaseInvoiceDto = {
  id: "inv-1",
  invoiceNumber: "PINV-2026-0004",
  vendorInvoiceNumber: "V-8891",
  supplierId: "sup-1",
  purchaseOrderId: "po-1",
  status: "MATCHED",
  matchStatus: "PRICE_VARIANCE",
  totalAmount: 1250.5,
  dueDate: "2026-11-01T00:00:00.000Z",
  lines: [
    {
      id: "line-1",
      purchaseInvoiceId: "inv-1",
      componentId: "comp-1",
      componentLabel: "MTR-15 — Drive motor",
      quantityBilled: 5,
      unitPrice: 250.1,
      lineTotal: 1250.5,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const supplierReturn: SupplierReturnDto = {
  id: "sret-1",
  returnNumber: "SRET-2026-0002",
  supplierId: "sup-1",
  purchaseOrderId: "po-1",
  rmaNumber: "RMA-991",
  totalAmount: 480,
  status: "DISPATCHED",
  dispatchedAt: "2026-10-02T00:00:00.000Z",
  lines: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

const labels = {
  supplierNames: new Map([["sup-1", "Acme Industrial"]]),
  poNumbers: new Map([["po-1", "PO-2026-0042"]]),
};

describe("toPurchaseInvoiceRow", () => {
  it("resolves the supplier and PO labels and keeps the real amounts", () => {
    expect(toPurchaseInvoiceRow(invoice, labels)).toEqual({
      id: "inv-1",
      invoiceNumber: "PINV-2026-0004",
      vendorInvoiceNumber: "V-8891",
      supplierLabel: "Acme Industrial",
      poLabel: "PO-2026-0042",
      totalAmount: 1250.5,
      status: "MATCHED",
      matchStatus: "PRICE_VARIANCE",
      dueDate: "2026-11-01T00:00:00.000Z",
      lineCount: 1,
      componentLabels: ["MTR-15 — Drive motor"],
    });
  });

  it("leaves unresolved labels null instead of showing a UUID", () => {
    const row = toPurchaseInvoiceRow(invoice);

    expect(row.supplierLabel).toBeNull();
    expect(row.poLabel).toBeNull();
  });

  it("treats a missing amount as zero rather than NaN", () => {
    expect(
      toPurchaseInvoiceRow({
        ...invoice,
        totalAmount: undefined as unknown as number,
      }).totalAmount,
    ).toBe(0);
  });
});

describe("toSupplierReturnRow", () => {
  it("uses the real timestamps and resolved labels", () => {
    const row = toSupplierReturnRow(supplierReturn, labels);

    expect(row).toMatchObject({
      id: "sret-1",
      returnNumber: "SRET-2026-0002",
      supplierLabel: "Acme Industrial",
      poLabel: "PO-2026-0042",
      rmaNumber: "RMA-991",
      totalAmount: 480,
      status: "DISPATCHED",
      dispatchedAt: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
      lineCount: 0,
    });
    expect(Object.keys(row)).not.toContain("returnDate");
  });

  it("falls back to a supplier name carried on the response", () => {
    const row = toSupplierReturnRow({
      ...supplierReturn,
      supplierName: "Fallback Supplier",
    });

    expect(row.supplierLabel).toBe("Fallback Supplier");
  });

  it("is null when neither an id nor a name resolves", () => {
    const row = toSupplierReturnRow({ ...supplierReturn, purchaseOrderId: null });

    expect(row.supplierLabel).toBeNull();
    expect(row.poLabel).toBeNull();
  });
});

describe("build rows", () => {
  it("return empty lists for missing responses", () => {
    expect(buildPurchaseInvoiceRows(undefined)).toEqual([]);
    expect(buildSupplierReturnRows(null)).toEqual([]);
  });
});

describe("procurement label maps", () => {
  it("resolves supplier names, PO numbers and component labels", () => {
    expect(
      toSupplierNameMap([
        { id: "sup-1", name: "Acme Industrial" },
        { id: "sup-2", code: "SUP-02" },
        { id: "sup-3" },
      ]).get("sup-2"),
    ).toBe("SUP-02");
    expect(
      toPurchaseOrderNumberMap([
        { id: "po-1", poNumber: "PO-2026-0042" },
        { id: "po-2", poNumber: " " },
      ]).size,
    ).toBe(1);
    expect(
      toComponentLabelMap([{ id: "comp-1", sku: "MTR-15", name: "Drive motor" }]).get(
        "comp-1",
      ),
    ).toBe("MTR-15 — Drive motor");
  });
});
