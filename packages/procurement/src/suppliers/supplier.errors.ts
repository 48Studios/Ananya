import { DomainError } from "@ananya/core";

export class InvalidSupplierCodeError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupplierCodeError";
  }
}

export class InvalidSupplierNameError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupplierNameError";
  }
}

export class DuplicateSupplierCodeError extends DomainError {
  constructor(code: string) {
    super(`Supplier with code "${code}" already exists.`);
    this.name = "DuplicateSupplierCodeError";
  }
}

export class SupplierNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Supplier not found: ${id}`);
    this.name = "SupplierNotFoundError";
  }
}

export class SupplierHasPurchaseOrdersError extends DomainError {
  constructor(id: string) {
    super(
      `Cannot delete supplier '${id}' because active purchase orders or transactions reference it.`,
    );
    this.name = "SupplierHasPurchaseOrdersError";
  }
}
