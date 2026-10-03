import { describe, it, expect } from "vitest";
import { Reservation } from "./reservation";
import { ReservationStatus } from "./reservation.types";

describe("Reservation aggregate", () => {
  it("should create an active reservation with lines", () => {
    const res = Reservation.create({
      reservationNumber: "RES-2026-0001",
      reservationType: "WORK_ORDER",
      referenceDocument: "WO-2026-0012",
      reservedBy: "operator-1",
      lines: [
        {
          componentId: "comp-1",
          locationId: "loc-1",
          reservedQuantity: 10,
          unitOfMeasure: "pcs",
        },
      ],
    });

    expect(res.id).toBeDefined();
    expect(res.status).toBe(ReservationStatus.Active);
    expect(res.lines.length).toBe(1);
    expect(res.lines[0]?.reservedQuantity).toBe(10);
  });

  it("should transition through lifecycle: fulfill and release", () => {
    const res = Reservation.create({
      reservationNumber: "RES-2026-0002",
      reservationType: "PROJECT",
      reservedBy: "operator-1",
      lines: [
        {
          componentId: "comp-1",
          locationId: "loc-1",
          reservedQuantity: 5,
          unitOfMeasure: "pcs",
        },
      ],
    });

    res.fulfill();
    expect(res.status).toBe(ReservationStatus.Fulfilled);

    expect(() => res.cancel()).toThrow(
      "Completed or released reservation is immutable.",
    );
  });

  it("should throw error when adding zero quantity line", () => {
    expect(() =>
      Reservation.create({
        reservationNumber: "RES-2026-0003",
        reservationType: "SALES_ORDER",
        reservedBy: "operator-1",
        lines: [
          {
            componentId: "comp-1",
            locationId: "loc-1",
            reservedQuantity: 0,
            unitOfMeasure: "pcs",
          },
        ],
      }),
    ).toThrow("Reservation quantity must be greater than zero.");
  });
});

/**
 * The reservations API returns these aggregates directly, so `JSON.stringify`
 * output is the wire contract the UI reads.
 */
describe("Reservation API serialization contract", () => {
  it("serializes the public status field and never the private storage field", () => {
    const res = Reservation.create({
      reservationNumber: "RES-2026-0009",
      reservationType: "WORK_ORDER",
      referenceDocument: "WO-2026-0099",
      reservedBy: "operator-9",
      lines: [
        {
          componentId: "comp-9",
          locationId: "loc-9",
          reservedQuantity: 4,
          unitOfMeasure: "pcs",
        },
      ],
    });

    const json = JSON.parse(JSON.stringify(res)) as Record<string, unknown>;

    expect(Object.keys(json).filter((key) => key.startsWith("_"))).toEqual([]);
    expect(json.status).toBe(ReservationStatus.Active);
    expect(json.reservationNumber).toBe("RES-2026-0009");
    expect(json.referenceDocument).toBe("WO-2026-0099");
    expect(Array.isArray(json.lines)).toBe(true);
    expect((json.lines as Array<{ reservedQuantity: number }>)[0]?.reservedQuantity).toBe(4);
    expect(typeof json.createdAt).toBe("string");
  });

  it("serializes a fulfilled status so the UI can gate actions", () => {
    const res = Reservation.create({
      reservationNumber: "RES-2026-0010",
      reservationType: "SALES_ORDER",
      reservedBy: "operator-10",
      lines: [
        {
          componentId: "comp-10",
          locationId: "loc-10",
          reservedQuantity: 1,
        },
      ],
    });
    res.fulfill();

    const json = JSON.parse(JSON.stringify(res)) as Record<string, unknown>;

    expect(json.status).toBe(ReservationStatus.Fulfilled);
  });
});
