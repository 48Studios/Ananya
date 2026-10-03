import { describe, it, expect } from "vitest";
import {
  buildWarrantyClaimRows,
  toProductNameMap,
  toWarrantyClaimRow,
} from "./warranty";
import type { WarrantyClaimDto } from "./api/warranty-claims-api";

const baseClaim: WarrantyClaimDto = {
  id: "wc-1",
  warrantyNumber: "WC-2026-0001",
  customerId: "cust-1",
  productId: "comp-1",
  serialNumber: "SN-8891",
  purchaseDate: "2025-06-01T00:00:00.000Z",
  expiryDate: "2026-06-01T00:00:00.000Z",
  claimReason: "Motor overheats after 20 minutes",
  decision: "UNDER_REVIEW",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};

describe("toWarrantyClaimRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toWarrantyClaimRow(baseClaim, {
      customerNames: new Map([["cust-1", "Acme Industrial"]]),
      productNames: new Map([["comp-1", "Drive motor 1.5kW"]]),
    });

    expect(row).toEqual({
      id: "wc-1",
      claimNumber: "WC-2026-0001",
      customerName: "Acme Industrial",
      productLabel: "Drive motor 1.5kW",
      serialNumber: "SN-8891",
      claimReason: "Motor overheats after 20 minutes",
      decision: "UNDER_REVIEW",
      purchaseDate: "2025-06-01T00:00:00.000Z",
      expiryDate: "2026-06-01T00:00:00.000Z",
      reportedAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("leaves unresolved customer and product null instead of inventing names", () => {
    const row = toWarrantyClaimRow(baseClaim);

    expect(row.customerName).toBeNull();
    expect(row.productLabel).toBeNull();
  });

  it("keeps the real decision vocabulary", () => {
    expect(toWarrantyClaimRow({ ...baseClaim, decision: "EXPIRED" }).decision).toBe(
      "EXPIRED",
    );
  });

  it("never renders a blank claim number as if it were recorded", () => {
    expect(
      toWarrantyClaimRow({ ...baseClaim, warrantyNumber: "   " }).claimNumber,
    ).toBe("-");
  });
});

describe("buildWarrantyClaimRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildWarrantyClaimRows(undefined)).toEqual([]);
  });
});

describe("toProductNameMap", () => {
  it("prefers the component name and falls back to its sku", () => {
    const map = toProductNameMap([
      { id: "comp-1", name: "Drive motor 1.5kW", sku: "MTR-15" },
      { id: "comp-2", name: "  ", sku: "MTR-22" },
      { id: "comp-3" },
    ]);

    expect(map.get("comp-1")).toBe("Drive motor 1.5kW");
    expect(map.get("comp-2")).toBe("MTR-22");
    expect(map.has("comp-3")).toBe(false);
  });
});
