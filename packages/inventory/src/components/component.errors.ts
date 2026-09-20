import { DomainError } from "@ananya/core";

export class ComponentSkuAlreadyExistsError extends DomainError {
  constructor(sku: string) {
    super(`Component with SKU '${sku}' already exists.`);
  }
}

export class DefaultLocationNotFoundError extends DomainError {
  constructor(locationId: string) {
    super(`Default location with ID '${locationId}' not found.`);
  }
}

export class ComponentNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Component not found: ${id}`);
  }
}

export class InvalidComponentSkuError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidComponentNameError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidUnitError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Raised when an operation is attempted on a component that has been retired by
 * consolidation.
 *
 * A consolidated component is intentionally not deleted: it keeps every
 * historical foreign key and stays queryable. What it loses is the ability to
 * take part in new operational activity, because its inventory, reservations,
 * batches, serials and BOM lines now belong to the canonical component.
 */
export class ComponentConsolidatedError extends DomainError {
  constructor(
    componentId: string,
    message: string,
    public readonly consolidatedIntoComponentId?: string | null,
  ) {
    super(message);
  }
}

/**
 * Raised when a component is asked to consolidate into itself, or when the
 * canonical component of a consolidation is itself already consolidated.
 */
export class InvalidConsolidationTargetError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Raised when a component that is already consolidated is consolidated again.
 *
 * The database enforces this too (`consolidation_sources.source_component_id`
 * is unique), but the aggregate refuses it first so the caller gets a domain
 * error rather than a constraint violation.
 */
export class ComponentAlreadyConsolidatedError extends DomainError {
  constructor(componentId: string, consolidatedIntoComponentId: string) {
    super(
      `Component '${componentId}' was already consolidated into '${consolidatedIntoComponentId}'.`,
    );
  }
}
