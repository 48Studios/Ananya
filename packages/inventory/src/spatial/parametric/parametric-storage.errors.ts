import { DomainError } from "@ananya/core";

export class InvalidParametricDimensionError extends DomainError {
  constructor(message = "Parametric dimensions (width, height, depth) must be positive numbers") {
    super(message);
  }
}

export class InvalidParametricSubdivisionError extends DomainError {
  constructor(message = "Subdivision counts (rows, columns, tiers, levels) must be integers greater than or equal to 1") {
    super(message);
  }
}

export class ParametricGeometryOutOfBoundsError extends DomainError {
  constructor(message = "Generated compartment geometry extends outside the container bounding box") {
    super(message);
  }
}

export class ParametricGeometryOverlapError extends DomainError {
  constructor(message = "Generated compartments overlap in physical space") {
    super(message);
  }
}
