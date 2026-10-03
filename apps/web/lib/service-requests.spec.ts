import { describe, it, expect } from "vitest";
import {
  buildServiceRequestRows,
  toCustomerNameMap,
  toServiceRequestRow,
} from "./service-requests";
import type { ServiceRequestDto } from "./api/service-requests-api";

const baseRequest: ServiceRequestDto = {
  id: "req-1",
  serviceNumber: "SRV-000042",
  customerId: "cust-1",
  title: "Conveyor belt stops under load",
  priority: "HIGH",
  category: "MAINTENANCE",
  status: "OPEN",
  createdAt: "2026-10-03T09:15:00.000Z",
  updatedAt: "2026-10-03T09:15:00.000Z",
};

describe("toServiceRequestRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toServiceRequestRow(baseRequest, new Map([["cust-1", "Acme Industrial"]]));

    expect(row).toEqual({
      id: "req-1",
      serviceNumber: "SRV-000042",
      title: "Conveyor belt stops under load",
      customerName: "Acme Industrial",
      assetLabel: null,
      priority: "HIGH",
      status: "OPEN",
      reportedAt: "2026-10-03T09:15:00.000Z",
    });
  });

  it("uses the serial number as the asset label when one is recorded", () => {
    const row = toServiceRequestRow({
      ...baseRequest,
      serialNumber: "SN-7781-A",
    });

    expect(row.assetLabel).toBe("SN-7781-A");
  });

  it("leaves an unresolved customer null instead of inventing a name", () => {
    const row = toServiceRequestRow(baseRequest);

    expect(row.customerName).toBeNull();
  });

  it("does not render blank strings as if they were recorded values", () => {
    const row = toServiceRequestRow({
      ...baseRequest,
      serviceNumber: "   ",
      title: "",
      serialNumber: "",
    });

    expect(row.serviceNumber).toBe("-");
    expect(row.title).toBe("-");
    expect(row.assetLabel).toBeNull();
  });
});

describe("buildServiceRequestRows", () => {
  it("returns an empty list for a missing or empty response", () => {
    expect(buildServiceRequestRows(undefined)).toEqual([]);
    expect(buildServiceRequestRows(null)).toEqual([]);
    expect(buildServiceRequestRows([])).toEqual([]);
  });

  it("keeps one row per request, in the order the API returned them", () => {
    const rows = buildServiceRequestRows([
      baseRequest,
      { ...baseRequest, id: "req-2", serviceNumber: "SRV-000043" },
    ]);

    expect(rows.map((row) => row.serviceNumber)).toEqual([
      "SRV-000042",
      "SRV-000043",
    ]);
  });
});

describe("toCustomerNameMap", () => {
  it("maps ids to names and skips blank names", () => {
    const map = toCustomerNameMap([
      { id: "cust-1", name: "Acme Industrial" },
      { id: "cust-2", name: "   " },
      { id: "cust-3" },
    ]);

    expect(map.get("cust-1")).toBe("Acme Industrial");
    expect(map.has("cust-2")).toBe(false);
    expect(map.has("cust-3")).toBe(false);
  });

  it("tolerates a missing customer list", () => {
    expect(toCustomerNameMap(undefined).size).toBe(0);
  });
});
