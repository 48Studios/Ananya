import { describe, it, expect } from "vitest";
import { Reservation } from "./reservation";
import { ReservationStatus } from "./reservation.types";
import {
  InvalidReservationQuantityError,
  InvalidReservationStatusError,
} from "./reservation.errors";

describe("Reservation aggregate", () => {
  it("should create an active reservation", () => {
    const res = Reservation.create({
      componentId: "comp-1",
      locationId: "loc-1",
      quantity: 10,
      unitOfMeasure: "pcs",
      reservedBy: "operator-1",
    });

    expect(res.id).toBeDefined();
    expect(res.status).toBe(ReservationStatus.Active);
    expect(res.quantity).toBe(10);
  });

  it("should transition through lifecycle: fulfill", () => {
    const res = Reservation.create({
      componentId: "comp-1",
      locationId: "loc-1",
      quantity: 5,
      unitOfMeasure: "pcs",
      reservedBy: "operator-1",
    });

    res.fulfill();
    expect(res.status).toBe(ReservationStatus.Fulfilled);

    expect(() => res.cancel()).toThrow("Only active reservations can be cancelled");
  });

  it("should throw error when creating zero quantity reservation", () => {
    expect(() =>
      Reservation.create({
        componentId: "comp-1",
        locationId: "loc-1",
        quantity: 0,
        unitOfMeasure: "pcs",
        reservedBy: "operator-1",
      }),
    ).toThrow("Reservation quantity must be greater than zero");
  });
});
