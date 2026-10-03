import { describe, it, expect } from "vitest";
import { buildFinishedGoodsRows, toFinishedGoodsRow } from "./finished-goods";
import type { FinishedGoodsReceiptDto } from "./api/finished-goods-api";

const baseReceipt: FinishedGoodsReceiptDto = {
  id: "fgr-1",
  fgrNumber: "FGR-000014",
  productionOrderId: "wo-1",
  status: "POSTED",
  postedAt: "2026-10-02T17:30:00.000Z",
  lines: [
    {
      id: "line-1",
      fgrId: "fgr-1",
      componentId: "comp-1",
      locationId: "loc-1",
      quantityProduced: 18,
      quantityScrapped: 2,
      createdAt: "2026-10-02T17:30:00.000Z",
      updatedAt: "2026-10-02T17:30:00.000Z",
    },
  ],
  createdAt: "2026-10-02T17:20:00.000Z",
  updatedAt: "2026-10-02T17:30:00.000Z",
};

describe("toFinishedGoodsRow", () => {
  it("summarises the receipt and aggregates its lines", () => {
    const row = toFinishedGoodsRow(baseReceipt, {
      productionNumbers: new Map([["wo-1", "WO-2026-0009"]]),
      componentNames: new Map([["comp-1", "Conveyor frame"]]),
    });

    expect(row).toEqual({
      id: "fgr-1",
      fgrNumber: "FGR-000014",
      productionOrderLabel: "WO-2026-0009",
      lineCount: 1,
      totalProduced: 18,
      totalScrapped: 2,
      componentLabels: ["Conveyor frame"],
      status: "POSTED",
      postedAt: "2026-10-02T17:30:00.000Z",
      createdAt: "2026-10-02T17:20:00.000Z",
    });
  });

  it("does not claim a warehouse location or unit cost that the API never returns", () => {
    const row = toFinishedGoodsRow(baseReceipt);

    expect(Object.keys(row)).not.toContain("warehouseLocation");
    expect(Object.keys(row)).not.toContain("unitCost");
  });

  it("reports an empty receipt honestly", () => {
    const row = toFinishedGoodsRow({ ...baseReceipt, lines: [] });

    expect(row.lineCount).toBe(0);
    expect(row.totalProduced).toBe(0);
    expect(row.totalScrapped).toBe(0);
    expect(row.componentLabels).toEqual([]);
  });

  it("leaves an unresolved work order null", () => {
    expect(toFinishedGoodsRow(baseReceipt).productionOrderLabel).toBeNull();
  });
});

describe("buildFinishedGoodsRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildFinishedGoodsRows(undefined)).toEqual([]);
  });
});
