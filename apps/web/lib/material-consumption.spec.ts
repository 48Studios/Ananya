import { describe, it, expect } from "vitest";
import {
  buildConsumptionRows,
  toConsumptionRow,
  toProductionNumberMap,
} from "./material-consumption";
import type { MaterialConsumptionDto } from "./api/material-consumption-api";

const baseConsumption: MaterialConsumptionDto = {
  id: "mc-1",
  consumptionNumber: "MC-000021",
  productionOrderId: "wo-1",
  status: "DRAFT",
  postedAt: null,
  lines: [
    {
      id: "line-1",
      consumptionId: "mc-1",
      componentId: "comp-1",
      locationId: "loc-1",
      quantityPlanned: 10,
      quantityConsumed: 9.5,
      consumedAt: "2026-10-02T08:00:00.000Z",
      createdAt: "2026-10-02T08:00:00.000Z",
      updatedAt: "2026-10-02T08:00:00.000Z",
    },
    {
      id: "line-2",
      consumptionId: "mc-1",
      componentId: "comp-2",
      locationId: "loc-1",
      quantityPlanned: 2,
      quantityConsumed: 2,
      consumedAt: "2026-10-02T08:05:00.000Z",
      createdAt: "2026-10-02T08:05:00.000Z",
      updatedAt: "2026-10-02T08:05:00.000Z",
    },
  ],
  createdAt: "2026-10-02T07:55:00.000Z",
  updatedAt: "2026-10-02T08:05:00.000Z",
};

describe("toConsumptionRow", () => {
  it("summarises the header and aggregates the issued lines", () => {
    const row = toConsumptionRow(baseConsumption, {
      productionNumbers: new Map([["wo-1", "WO-2026-0009"]]),
      componentNames: new Map([
        ["comp-1", "MTR-15"],
        ["comp-2", "BLT-04"],
      ]),
    });

    expect(row).toEqual({
      id: "mc-1",
      consumptionNumber: "MC-000021",
      productionOrderLabel: "WO-2026-0009",
      lineCount: 2,
      totalConsumed: 11.5,
      componentLabels: ["MTR-15", "BLT-04"],
      status: "DRAFT",
      postedAt: null,
      createdAt: "2026-10-02T07:55:00.000Z",
    });
  });

  it("reports zero lines instead of a fabricated component or quantity", () => {
    const row = toConsumptionRow({
      ...baseConsumption,
      lines: [],
    });

    expect(row.lineCount).toBe(0);
    expect(row.totalConsumed).toBe(0);
    expect(row.componentLabels).toEqual([]);
  });

  it("leaves the work-order label null when it cannot be resolved", () => {
    expect(toConsumptionRow(baseConsumption).productionOrderLabel).toBeNull();
  });

  it("keeps a posted timestamp when the document is posted", () => {
    const row = toConsumptionRow({
      ...baseConsumption,
      status: "POSTED",
      postedAt: "2026-10-02T09:00:00.000Z",
    });

    expect(row.status).toBe("POSTED");
    expect(row.postedAt).toBe("2026-10-02T09:00:00.000Z");
  });
});

describe("buildConsumptionRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildConsumptionRows(undefined)).toEqual([]);
    expect(buildConsumptionRows(null)).toEqual([]);
  });
});

describe("toProductionNumberMap", () => {
  it("maps work-order ids to their production numbers and skips blanks", () => {
    const map = toProductionNumberMap([
      { id: "wo-1", productionNumber: "WO-2026-0009" },
      { id: "wo-2", productionNumber: "  " },
      { id: "wo-3" },
    ]);

    expect(map.get("wo-1")).toBe("WO-2026-0009");
    expect(map.size).toBe(1);
  });
});
