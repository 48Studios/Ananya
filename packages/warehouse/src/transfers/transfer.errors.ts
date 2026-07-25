import { DomainError } from "@ananya/core";

export class InvalidTransferStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition Warehouse Transfer from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidTransferStatusTransitionError";
  }
}

export class IdenticalTransferBinsError extends DomainError {
  constructor() {
    super("Source bin and destination bin cannot be identical for transfer.");
    this.name = "IdenticalTransferBinsError";
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
    super("Completed or Cancelled Warehouse Transfer is immutable.");
    this.name = "ImmutableTransferError";
  }
}
