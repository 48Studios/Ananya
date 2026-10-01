import { DomainError } from "@ananya/core";

export class InvalidSpatialModelCodeError extends DomainError {
  constructor(message = "Spatial model code is required") {
    super(message);
  }
}

export class InvalidSpatialModelNameError extends DomainError {
  constructor(message = "Spatial model name is required") {
    super(message);
  }
}

export class InvalidSpatialDimensionsError extends DomainError {
  constructor(message = "Spatial model dimensions (width, height, depth) must be positive numbers") {
    super(message);
  }
}

export class InvalidSpatialAnchorCodeError extends DomainError {
  constructor(message = "Spatial anchor code is required") {
    super(message);
  }
}

export class InvalidSpatialAnchorNameError extends DomainError {
  constructor(message = "Spatial anchor name is required") {
    super(message);
  }
}

export class SpatialModelNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Spatial model not found: ${id}`);
  }
}

export class SpatialAnchorNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Spatial anchor not found: ${id}`);
  }
}

export class SpatialNodeNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Spatial node not found: ${id}`);
  }
}

export class SpatialNodeCannotParentToSelfError extends DomainError {
  constructor(id: string) {
    super(`Spatial node '${id}' cannot have itself as its parent.`);
  }
}

export class SpatialAnchorDoesNotBelongToModelError extends DomainError {
  constructor(anchorId: string, modelId: string) {
    super(`Spatial anchor '${anchorId}' does not belong to spatial model '${modelId}'.`);
  }
}

export class SpatialModelInUseError extends DomainError {
  constructor(modelId: string) {
    super(`Cannot delete spatial model '${modelId}' because it is in use by placed spatial nodes.`);
  }
}

export class SpatialHierarchyCycleError extends DomainError {
  constructor(nodeId: string, parentId: string) {
    super(`Cannot set parent spatial node '${parentId}' for node '${nodeId}' as it would create a circular dependency.`);
  }
}

export class SpatialHierarchyLocationMismatchError extends DomainError {
  constructor(childLocationCode: string, parentLocationCode: string) {
    super(
      `Spatial node for location '${childLocationCode}' cannot have parent spatial node for location '${parentLocationCode}' because it contradicts the authoritative location hierarchy.`,
    );
  }
}

export class SpatialAnchorAlreadyOccupiedError extends DomainError {
  constructor(anchorCode: string, occupiedBy: string) {
    super(
      `Spatial anchor '${anchorCode}' is already occupied by location '${occupiedBy}'.`,
    );
  }
}

export class SpatialNodeHasChildrenError extends DomainError {
  constructor(nodeId: string, count: number) {
    super(
      `Cannot delete spatial node '${nodeId}' because it has ${count} child spatial nodes.`,
    );
  }
}

export class SpatialModelConflictError extends DomainError {
  constructor(
    message = "Spatial model has been modified by another operation. Please reload the latest state.",
  ) {
    super(message);
  }
}

export class SpatialAnchorConflictError extends DomainError {
  constructor(
    anchorId: string,
    message = `Spatial anchor '${anchorId}' has been modified by another operation. Please reload the latest state.`,
  ) {
    super(message);
  }
}

