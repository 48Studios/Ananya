import { DomainError } from "@ananya/core";

export class InvalidStockCountStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition Stock Count from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidStockCountStatusTransitionError";
  }
}

export class InvalidCountQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCountQuantityError";
  }
}

export class ImmutableStockCountError extends DomainError {
  constructor() {
    super("Posted or Cancelled Stock Count is immutable.");
    this.name = "ImmutableStockCountError";
  }
}
