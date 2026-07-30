import { DomainError } from "@ananya/core";

export class ManufacturerCodeAlreadyExistsError extends DomainError {
  constructor(code: string) {
    super(`Manufacturer with code '${code}' already exists.`);
  }
}

export class ManufacturerNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Manufacturer not found: ${id}`);
  }
}

export class InvalidManufacturerCodeError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidManufacturerNameError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class ManufacturerReferencedByComponentsError extends DomainError {
  constructor(id: string) {
    super(`Cannot delete manufacturer '${id}' because it is referenced by active inventory components.`);
  }
}
