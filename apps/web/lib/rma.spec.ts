import { describe, it, expect } from "vitest";
import { buildRmaRows, toRmaRow, toSalesOrderNumberMap } from "./rma";
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
      salesOrderLabel: null,
      salesOrderLinked: true,
      reportedAt: "2026-09-28T09:00:00.000Z",
    });
  });

  it("resolves the originating sales order number", () => {
    const row = toRmaRow(
      baseRequest,
      undefined,
      new Map([["so-1", "SO-2026-0881"]]),
    );

    expect(row.salesOrderLabel).toBe("SO-2026-0881");
    expect(row.salesOrderLinked).toBe(true);
  });

  it("falls back to linked/not linked when the number cannot be resolved", () => {
    expect(toRmaRow(baseRequest).salesOrderLabel).toBeNull();
    expect(toRmaRow(baseRequest).salesOrderLinked).toBe(true);
    expect(
      toRmaRow({ ...baseRequest, salesOrderId: undefined }).salesOrderLinked,
    ).toBe(false);
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

  it("passes the sales order numbers through to every row", () => {
    const rows = buildRmaRows(
      [baseRequest],
      undefined,
      new Map([["so-1", "SO-2026-0881"]]),
    );

    expect(rows[0]?.salesOrderLabel).toBe("SO-2026-0881");
  });
});

describe("toSalesOrderNumberMap", () => {
  it("maps ids to order numbers and skips blanks", () => {
    const map = toSalesOrderNumberMap([
      { id: "so-1", orderNumber: "SO-2026-0881" },
      { id: "so-2", orderNumber: " " },
      { id: "so-3" },
    ]);

    expect(map.get("so-1")).toBe("SO-2026-0881");
    expect(map.size).toBe(1);
  });
});
