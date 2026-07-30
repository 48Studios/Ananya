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

export class DuplicateBomComponentLineError extends DomainError {
  constructor(componentId: string) {
    super(`Component ${componentId} is already listed as a line item in this BOM.`);
    this.name = "DuplicateBomComponentLineError";
  }
}

export class CircularBomDependencyError extends DomainError {
  constructor(componentId: string) {
    super(`Finished product ${componentId} cannot be added as a component of its own BOM.`);
    this.name = "CircularBomDependencyError";
  }
}

export class ActiveBomAlreadyExistsError extends DomainError {
  constructor(componentId: string, activeRevision: string) {
    super(`Finished product ${componentId} already has an active RELEASED BOM revision (${activeRevision}). Obsolete the active revision before releasing a new one.`);
    this.name = "ActiveBomAlreadyExistsError";
  }
}

export class BomNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Bill of Materials not found: ${id}`);
    this.name = "BomNotFoundError";
  }
}
