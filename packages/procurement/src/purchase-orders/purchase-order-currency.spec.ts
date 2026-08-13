import { describe, it, expect } from "vitest";
import { PurchaseOrder } from "./purchase-order";

describe("Purchase Order Currency Resolution", () => {
  it("defaults to INR when created without explicit currency", () => {
    const po = PurchaseOrder.create({
      poNumber: "PO-2026-TEST",
      supplierId: "sup-123",
    });

    expect(po.currency).toBe("INR");
    expect(po.currency).not.toBe("USD");
  });

  it("preserves explicit currency when provided during creation", () => {
    const poEur = PurchaseOrder.create({
      poNumber: "PO-2026-EUR",
      supplierId: "sup-123",
      currency: "EUR",
    });

    expect(poEur.currency).toBe("EUR");

    const poUsd = PurchaseOrder.create({
      poNumber: "PO-2026-USD",
      supplierId: "sup-123",
      currency: "USD",
    });

    expect(poUsd.currency).toBe("USD");
  });

  it("trims and uppercase normalizes explicit currency", () => {
    const po = PurchaseOrder.create({
      poNumber: "PO-2026-NORM",
      supplierId: "sup-123",
      currency: "   eur   ",
    });

    expect(po.currency).toBe("EUR");
  });

  it("defaults to INR when empty string currency is provided", () => {
    const po = PurchaseOrder.create({
      poNumber: "PO-2026-EMPTY",
      supplierId: "sup-123",
      currency: "   ",
    });

    expect(po.currency).toBe("INR");
  });

  it("preserves explicit GBP currency", () => {
    const poGbp = PurchaseOrder.create({
      poNumber: "PO-2026-GBP",
      supplierId: "sup-123",
      currency: "GBP",
    });

    expect(poGbp.currency).toBe("GBP");
  });
});
