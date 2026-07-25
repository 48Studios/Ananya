import { DomainError } from "@ananya/core";

export class InvalidProductionOrderStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition Production Order from status "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "InvalidProductionOrderStatusTransitionError";
  }
}

export class InvalidProductionQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProductionQuantityError";
  }
}

export class ProductionOrderNotInProgressError extends DomainError {
  constructor() {
    super("Production Order must be IN_PROGRESS for this operation.");
    this.name = "ProductionOrderNotInProgressError";
  }
}
