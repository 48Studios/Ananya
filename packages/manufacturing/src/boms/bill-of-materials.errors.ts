import { DomainError } from "@ananya/core";

export class InvalidBomStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition BOM from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidBomStatusTransitionError";
  }
}

export class EmptyBomError extends DomainError {
  constructor() {
    super("BOM must contain at least one line item before release.");
    this.name = "EmptyBomError";
  }
}

export class ImmutableBomError extends DomainError {
  constructor() {
    super("Released BOM is immutable and cannot be modified.");
    this.name = "ImmutableBomError";
  }
}

export class InvalidBomLineQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBomLineQuantityError";
  }
}
