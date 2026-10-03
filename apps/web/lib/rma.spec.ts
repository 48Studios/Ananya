import { describe, it, expect } from "vitest";
import { buildRmaRows, toRmaRow } from "./rma";
import type { RmaRequestDto } from "./api/rma-requests-api";

const baseRequest: RmaRequestDto = {
  id: "rma-1",
  rmaNumber: "RMA-2026-0003",
  customerId: "cust-1",
  salesOrderId: "so-1",
  itemDescription: "Servo drive, 3kW",
  serialNumber: "SN-2231",
  reason: "Intermittent fault on power-up",
  status: "RECEIVED",
  disposition: "REPAIR",
  createdAt: "2026-09-28T09:00:00.000Z",
  updatedAt: "2026-09-29T09:00:00.000Z",
};

describe("toRmaRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toRmaRow(baseRequest, new Map([["cust-1", "Acme Industrial"]]));

    expect(row).toEqual({
      id: "rma-1",
      rmaNumber: "RMA-2026-0003",
      customerName: "Acme Industrial",
      itemDescription: "Servo drive, 3kW",
      serialNumber: "SN-2231",
      reason: "Intermittent fault on power-up",
      status: "RECEIVED",
      disposition: "REPAIR",
      salesOrderLinked: true,
      reportedAt: "2026-09-28T09:00:00.000Z",
    });
  });

  it("reports an order as not linked instead of inventing a number", () => {
    const row = toRmaRow({ ...baseRequest, salesOrderId: undefined });

    expect(row.salesOrderLinked).toBe(false);
  });

  it("leaves the disposition null until inspection records one", () => {
    const row = toRmaRow({ ...baseRequest, disposition: undefined });

    expect(row.disposition).toBeNull();
  });

  it("leaves an unresolved customer null", () => {
    expect(toRmaRow(baseRequest).customerName).toBeNull();
  });

  it("keeps the real RMA status vocabulary", () => {
    expect(toRmaRow({ ...baseRequest, status: "PROCESSED" }).status).toBe(
      "PROCESSED",
    );
  });
});

describe("buildRmaRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildRmaRows(null)).toEqual([]);
  });
});
