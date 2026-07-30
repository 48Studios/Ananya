import { DomainError } from "@ananya/core";

export class InvalidPoStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(`Cannot transition Purchase Order from status "${fromStatus}" to "${toStatus}".`);
    this.name = "InvalidPoStatusTransitionError";
  }
}

export class InvalidPoLineQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPoLineQuantityError";
  }
}

export class EmptyPurchaseOrderError extends DomainError {
  constructor() {
    super("Purchase Order must contain at least one line item before submission.");
    this.name = "EmptyPurchaseOrderError";
  }
}

export class PurchaseOrderNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Purchase Order not found: ${id}`);
    this.name = "PurchaseOrderNotFoundError";
  }
}

export class PurchaseOrderCannotBeDeletedError extends DomainError {
  constructor(status: string) {
    super(`Cannot delete Purchase Order with status "${status}". Only DRAFT or CANCELLED purchase orders can be deleted.`);
    this.name = "PurchaseOrderCannotBeDeletedError";
  }
}
