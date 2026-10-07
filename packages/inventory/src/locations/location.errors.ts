import { DomainError } from "@ananya/core";

export class LocationCodeAlreadyExistsError extends DomainError {
  constructor(code: string) {
    super(`Location with code '${code}' already exists.`);
  }
}

export class ParentLocationNotFoundError extends DomainError {
  constructor(parentId: string) {
    super(`Parent location not found: ${parentId}`);
  }
}

export class InactiveParentLocationError extends DomainError {
  constructor(parentId: string) {
    super(`Cannot create a location under inactive parent: ${parentId}`);
  }
}

export class LocationNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Location not found: ${id}`);
  }
}

export class InvalidLocationCodeError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidLocationNameError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidLocationKindError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class LocationHasChildrenError extends DomainError {
  constructor(id: string) {
    super(`Cannot delete location '${id}' because it has child locations.`);
  }
}

export class CannotParentToSelfError extends DomainError {
  constructor(id: string) {
    super(`Location '${id}' cannot be set as its own parent.`);
  }
}

/**
 * Raised when a re-parent would make a location a descendant of itself, i.e.
 * create a cycle in the `parentId` chain. Does not enforce physical
 * parent/child category compatibility — only structural acyclicity.
 */
export class LocationHierarchyCycleError extends DomainError {
  constructor(id: string, parentId: string) {
    super(
      `Cannot set parent '${parentId}' for location '${id}' because it would create a cycle in the location hierarchy.`,
    );
  }
}

/**
 * Physical-containment error family (RFC-0069 Phase 2).
 *
 * These are the `containerId` analogues of the `parentId` family above. They are
 * deliberately SEPARATE classes: organizational (`parentId`) and physical
 * (`containerId`) containment are independent relations and must never share a
 * verdict or an error.
 */

/** The referenced physical container does not exist. */
export class ContainerLocationNotFoundError extends DomainError {
  constructor(containerId: string) {
    super(`Container location not found: ${containerId}`);
  }
}

/** The referenced physical container exists but is inactive. */
export class InactiveContainerLocationError extends DomainError {
  constructor(containerId: string) {
    super(`Cannot use inactive container location: ${containerId}`);
  }
}

/** A location may not be its own physical container. */
export class CannotContainSelfError extends DomainError {
  constructor(id: string) {
    super(`Location '${id}' cannot be its own physical container.`);
  }
}

/**
 * Raised when a `containerId` assignment would create a cycle in the physical
 * containment chain. Independent of `LocationHierarchyCycleError`.
 */
export class ContainerHierarchyCycleError extends DomainError {
  constructor(id: string, containerId: string) {
    super(
      `Cannot set container '${containerId}' for location '${id}' because it would create a cycle in physical containment.`,
    );
  }
}

/**
 * Raised when the parent/child category pair cannot physically contain, per the
 * canonical `canBePhysicalContainer` predicate.
 */
export class InvalidPhysicalContainmentError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class LocationInUseError extends DomainError {
  constructor(identifier: string) {
    super(
      `Cannot delete location '${identifier}' because it is in use by inventory records, receipts, or transactions.`,
    );
  }
}
