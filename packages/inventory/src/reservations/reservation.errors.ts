import { DomainError } from "@ananya/core";

export class InvalidReservationQuantityError extends DomainError {
  constructor(message = "Reservation quantity must be greater than zero.") {
    super(message);
    this.name = "InvalidReservationQuantityError";
  }
}

export class InsufficientAvailableInventoryError extends DomainError {
  constructor(
    componentId: string,
    requested: number,
    available: number,
  ) {
    super(
      `Cannot reserve ${requested} units for component ${componentId}. Available inventory is only ${available}.`,
    );
    this.name = "InsufficientAvailableInventoryError";
  }
}

export class InvalidReservationStatusError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReservationStatusError";
  }
}

export class ImmutableReservationError extends DomainError {
  constructor() {
    super("Completed or released reservation is immutable.");
    this.name = "ImmutableReservationError";
  }
}
