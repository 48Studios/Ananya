import { describe, it, expect } from "vitest";
import {
  buildBatchRows,
  toBatchRow,
  toComponentLabelMap,
} from "./batches";
import type { BatchDto } from "./api/batches-api";

const baseBatch: BatchDto = {
  id: "batch-1",
  componentId: "comp-1",
  batchNumber: "LOT-2026-0042",
  manufacturingDate: "2026-01-15T00:00:00.000Z",
  expiryDate: "2027-01-15T00:00:00.000Z",
  supplierBatchNumber: "SUP-991",
  createdAt: "2026-01-16T00:00:00.000Z",
};

const now = new Date("2026-10-04T00:00:00.000Z");

describe("toBatchRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toBatchRow(
      baseBatch,
      new Map([["comp-1", "MTR-15 — Drive motor"]]),
      now,
    );

    expect(row).toEqual({
      id: "batch-1",
      batchNumber: "LOT-2026-0042",
      componentId: "comp-1",
      componentLabel: "MTR-15 — Drive motor",
      supplierBatchNumber: "SUP-991",
      manufacturingDate: "2026-01-15T00:00:00.000Z",
      expiryDate: "2027-01-15T00:00:00.000Z",
      expired: false,
    });
  });

  it("does not claim a SKU, name or on-hand quantity the API never returns", () => {
    const row = toBatchRow(baseBatch, undefined, now);

    expect(Object.keys(row)).not.toContain("componentSku");
    expect(Object.keys(row)).not.toContain("quantityOnHand");
    expect(row.componentLabel).toBeNull();
  });

  it("marks a batch expired only when its expiry date has passed", () => {
    const expired = toBatchRow(
      { ...baseBatch, expiryDate: "2026-09-01T00:00:00.000Z" },
      undefined,
      now,
    );
    const noExpiry = toBatchRow(
      { ...baseBatch, expiryDate: null },
      undefined,
      now,
    );

    expect(expired.expired).toBe(true);
    expect(noExpiry.expired).toBe(false);
    expect(noExpiry.expiryDate).toBeNull();
  });

  it("never renders a blank batch number as if it were recorded", () => {
    expect(toBatchRow({ ...baseBatch, batchNumber: "  " }, undefined, now).batchNumber).toBe(
      "-",
    );
  });
});

describe("buildBatchRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildBatchRows(undefined)).toEqual([]);
    expect(buildBatchRows(null)).toEqual([]);
  });
});

describe("toComponentLabelMap", () => {
  it("combines sku and name, and falls back to whichever exists", () => {
    const map = toComponentLabelMap([
      { id: "comp-1", sku: "MTR-15", name: "Drive motor" },
      { id: "comp-2", name: "Gearbox" },
      { id: "comp-3", sku: "BLT-04" },
      { id: "comp-4" },
    ]);

    expect(map.get("comp-1")).toBe("MTR-15 — Drive motor");
    expect(map.get("comp-2")).toBe("Gearbox");
    expect(map.get("comp-3")).toBe("BLT-04");
    expect(map.has("comp-4")).toBe(false);
  });
});
