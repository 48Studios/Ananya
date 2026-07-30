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

    expect(() => res.cancel()).toThrow("Completed or released reservation is immutable.");
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
