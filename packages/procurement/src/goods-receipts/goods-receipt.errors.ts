import { DomainError } from "@ananya/core";

export class InvalidGoodsReceiptStatusError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGoodsReceiptStatusError";
  }
}

export class InvalidReceivingQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReceivingQuantityError";
  }
}

export class GoodsReceiptNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Goods Receipt not found: ${id}`);
    this.name = "GoodsReceiptNotFoundError";
  }
}

export class ExceededRemainingQuantityError extends DomainError {
  constructor(componentId: string, requested: number, remaining: number) {
    super(
      `Cannot receive ${requested} units for component ${componentId}. Only ${remaining} units remain outstanding on the Purchase Order.`,
    );
    this.name = "ExceededRemainingQuantityError";
  }
}
