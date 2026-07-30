import { DomainError } from "@ananya/core";

export class InvalidTransferStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition Warehouse Transfer from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidTransferStatusTransitionError";
  }
}

export class IdenticalTransferLocationsError extends DomainError {
  constructor() {
    super("Source location and destination location cannot be identical.");
    this.name = "IdenticalTransferLocationsError";
  }
}

export class InvalidTransferQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransferQuantityError";
  }
}

export class ImmutableTransferError extends DomainError {
  constructor() {
    super("Received or Cancelled Warehouse Transfer is immutable.");
    this.name = "ImmutableTransferError";
  }
}
