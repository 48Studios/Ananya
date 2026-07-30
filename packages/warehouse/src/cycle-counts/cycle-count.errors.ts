import { DomainError } from "@ananya/core";

export class InvalidCycleCountStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition Cycle Count from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidCycleCountStatusTransitionError";
  }
}

export class InvalidCountedQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCountedQuantityError";
  }
}

export class ImmutableCycleCountError extends DomainError {
  constructor() {
    super("Approved or Cancelled Cycle Count is immutable.");
    this.name = "ImmutableCycleCountError";
  }
}
