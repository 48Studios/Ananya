import { describe, it, expect } from "vitest";
import {
  buildWarehousePolicyRows,
  describeRules,
  toLocationNameMap,
  toWarehouseNameMap,
  toWarehousePolicyRow,
} from "./warehouse-policies";
import type { WarehousePolicyDto } from "./api/warehouse-policies-api";

const policy: WarehousePolicyDto = {
  id: "pol-1",
  warehouseId: "wh-1",
  allowNegativeInventory: false,
  enforceBinCapacity: true,
  directedPutaway: true,
  directedPicking: false,
  defaultReceivingBinId: "loc-1",
  defaultProductionBinId: null,
  defaultShippingBinId: "loc-2",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const labels = {
  warehouseNames: new Map([["wh-1", "Main Assembly WH"]]),
  locationNames: new Map([
    ["loc-1", "RCV-01 — Receiving dock"],
    ["loc-2", "SHP-01 — Shipping dock"],
  ]),
};

describe("toWarehousePolicyRow", () => {
  it("reads the rules and bin ids the API actually returns", () => {
    expect(toWarehousePolicyRow(policy, labels)).toEqual({
      id: "pol-1",
      warehouseId: "wh-1",
      warehouseLabel: "Main Assembly WH",
      directedPicking: false,
      directedPutaway: true,
      enforceBinCapacity: true,
      allowNegativeInventory: false,
      defaultReceivingBin: "RCV-01 — Receiving dock",
      defaultProductionBin: null,
      defaultShippingBin: "SHP-01 — Shipping dock",
      defaultReceivingBinId: "loc-1",
      defaultProductionBinId: null,
      defaultShippingBinId: "loc-2",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("does not invent a policy name or a picking/putaway rule enum", () => {
    const row = toWarehousePolicyRow(policy, labels);

    expect(Object.keys(row)).not.toContain("policyName");
    expect(Object.keys(row)).not.toContain("pickingRule");
    expect(Object.keys(row)).not.toContain("putawayRule");
  });

  it("leaves the warehouse label null when it cannot be resolved", () => {
    expect(toWarehousePolicyRow(policy).warehouseLabel).toBeNull();
  });

  it("falls back to the raw bin id when no location label resolves", () => {
    const row = toWarehousePolicyRow(policy);

    expect(row.defaultReceivingBin).toBe("loc-1");
    expect(row.defaultProductionBin).toBeNull();
  });

  it("describes only the rules that are switched on", () => {
    expect(describeRules(toWarehousePolicyRow(policy, labels))).toEqual([
      "Directed putaway",
      "Enforce bin capacity",
    ]);
    expect(describeRules(toWarehousePolicyRow(policy))).not.toContain(
      "Directed picking",
    );
  });
});

describe("buildWarehousePolicyRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildWarehousePolicyRows(undefined)).toEqual([]);
    expect(buildWarehousePolicyRows(null)).toEqual([]);
  });
});

describe("label maps", () => {
  it("resolves warehouse and location labels, skipping blanks", () => {
    expect(
      toWarehouseNameMap([
        { id: "wh-1", name: "Main Assembly WH" },
        { id: "wh-2", code: "WH-02" },
        { id: "wh-3", name: "  " },
      ]).get("wh-2"),
    ).toBe("WH-02");
    expect(
      toLocationNameMap([
        { id: "loc-1", code: "RCV-01", name: "Receiving dock" },
        { id: "loc-2", code: "SHP-01" },
      ]).get("loc-1"),
    ).toBe("RCV-01 — Receiving dock");
  });
});
