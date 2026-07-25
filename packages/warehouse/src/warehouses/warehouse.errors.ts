import { DomainError } from "@ananya/core";

export class InvalidWarehouseCodeError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWarehouseCodeError";
  }
}

export class InvalidBinCapacityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBinCapacityError";
  }
}

export class BinDisabledError extends DomainError {
  constructor(binCode: string) {
    super(`Bin "${binCode}" is currently disabled and cannot be used.`);
    this.name = "BinDisabledError";
  }
}
