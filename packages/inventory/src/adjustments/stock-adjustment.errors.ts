import { DomainError } from "@ananya/core";

export class InvalidAdjustmentStatusError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAdjustmentStatusError";
  }
}

export class EmptyStockAdjustmentError extends DomainError {
  constructor(
    message: string = "Stock adjustment must contain at least one line item.",
  ) {
    super(message);
    this.name = "EmptyStockAdjustmentError";
  }
}

export class NegativeCountedQuantityError extends DomainError {
  constructor(componentId: string, quantity: number) {
    super(
      `Counted quantity cannot be negative (${quantity}) for component ${componentId}.`,
    );
    this.name = "NegativeCountedQuantityError";
  }
}

export class StockAdjustmentNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Stock Adjustment not found: ${id}`);
    this.name = "StockAdjustmentNotFoundError";
  }
}
