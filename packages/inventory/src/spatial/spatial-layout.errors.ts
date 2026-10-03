import { DomainError } from "@ananya/core";

export class InactiveLayoutParentError extends DomainError {
  public readonly code = "INACTIVE_LAYOUT_PARENT";
  public readonly parentLocationId: string;

  constructor(parentLocationId: string) {
    super(
      `Cannot publish layout because its parent container location '${parentLocationId}' is inactive. Reactivate the parent location before publishing.`,
    );
    this.parentLocationId = parentLocationId;
  }
}

export class SpatialLayoutNotFoundError extends DomainError {
  public readonly code = "SPATIAL_LAYOUT_NOT_FOUND";
  public readonly layoutId: string;

  constructor(layoutId: string) {
    super(`Spatial layout not found: ${layoutId}`);
    this.layoutId = layoutId;
  }
}

export class SpatialLayoutRevisionConflictError extends DomainError {
  public readonly code = "SPATIAL_LAYOUT_REVISION_CONFLICT";
  public readonly currentRevision: number;
  public readonly expectedRevision: number;
  public readonly updatedBy: string | null;
  public readonly updatedAt: Date | null;

  constructor(
    currentRevision: number,
    expectedRevision: number,
    updatedBy: string | null = null,
    updatedAt: Date | null = null,
  ) {
    super(
      `Spatial layout revision conflict: expected revision ${expectedRevision}, but current revision is ${currentRevision}.`,
    );
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
    this.updatedBy = updatedBy;
    this.updatedAt = updatedAt;
  }
}

export class SpatialNodeOwnershipConflictError extends DomainError {
  public readonly code = "SPATIAL_NODE_OWNERSHIP_CONFLICT";
  public readonly conflictingNodes: Array<{
    nodeId: string;
    locationId: string;
    existingSource: string;
    existingOwnerId: string | null;
  }>;

  constructor(
    conflictingNodes: Array<{
      nodeId: string;
      locationId: string;
      existingSource: string;
      existingOwnerId: string | null;
    }>,
  ) {
    super(
      `Spatial node ownership conflict: ${conflictingNodes.length} nodes have non-builder or foreign ownership.`,
    );
    this.conflictingNodes = conflictingNodes;
  }
}

export class ParentCannotBeSlotError extends DomainError {
  public readonly code = "PARENT_CANNOT_BE_SLOT";
  public readonly parentLocationId: string;
  public readonly slotId: string;

  constructor(parentLocationId: string, slotId: string) {
    super(
      `Parent container location '${parentLocationId}' cannot be mapped as an internal compartment slot of itself.`,
    );
    this.parentLocationId = parentLocationId;
    this.slotId = slotId;
  }
}

export class InvalidParametricConfigError extends DomainError {
  public readonly code = "INVALID_PARAMETRIC_CONFIG";
  public readonly validationErrors: string[];

  constructor(errors: string[]) {
    super(`Invalid parametric configuration: ${errors.join("; ")}`);
    this.validationErrors = errors;
  }
}

export class ConcurrentHierarchyMutationError extends DomainError {
  public readonly code = "CONCURRENT_HIERARCHY_MUTATION";
  public readonly invalidLocationIds: string[];

  constructor(invalidLocationIds: string[]) {
    super(
      `Locations do not belong to parent container descendant hierarchy: ${invalidLocationIds.join(", ")}`,
    );
    this.invalidLocationIds = invalidLocationIds;
  }
}

export class InactiveLocationMappingError extends DomainError {
  public readonly code = "INACTIVE_LOCATION_MAPPING";
  public readonly inactiveLocationIds: string[];

  constructor(inactiveLocationIds: string[]) {
    super(
      `Inactive locations cannot be mapped to compartments: ${inactiveLocationIds.join(", ")}`,
    );
    this.inactiveLocationIds = inactiveLocationIds;
  }
}

export class DuplicateLocationMappingError extends DomainError {
  public readonly code = "DUPLICATE_LOCATION_MAPPING";
  public readonly locationId: string;

  constructor(locationId: string) {
    super(`Location '${locationId}' is mapped to multiple slots in the same layout.`);
    this.locationId = locationId;
  }
}

export class DuplicateSlotMappingError extends DomainError {
  public readonly code = "DUPLICATE_SLOT_MAPPING";
  public readonly slotId: string;

  constructor(slotId: string) {
    super(`Slot '${slotId}' is mapped to multiple locations in the same layout.`);
    this.slotId = slotId;
  }
}

export class IncompatibleLocationKindError extends DomainError {
  public readonly code = "INCOMPATIBLE_LOCATION_KIND";
  public readonly locationId: string;
  public readonly kind: string;

  constructor(locationId: string, kind: string) {
    super(
      `Location '${locationId}' of kind '${kind}' is an incompatible structural container and cannot be mapped as an individual slot.`,
    );
    this.locationId = locationId;
    this.kind = kind;
  }
}

export class InvalidSlotIdError extends DomainError {
  public readonly code = "INVALID_SLOT_ID";
  public readonly slotId: string;

  constructor(slotId: string) {
    super(`Slot ID '${slotId}' does not exist in generated parametric storage geometry.`);
    this.slotId = slotId;
  }
}

export class PublishedLayoutAlreadyExistsError extends DomainError {
  public readonly code = "PUBLISHED_LAYOUT_ALREADY_EXISTS";
  public readonly parentLocationId: string;
  public readonly existingLayoutId: string;
  public readonly existingLayoutCode: string;

  constructor(parentLocationId: string, existingLayoutId: string, existingLayoutCode: string) {
    super(
      `Parent location '${parentLocationId}' already has an active published layout '${existingLayoutCode}' (${existingLayoutId}). It must be archived before another layout can be published.`,
    );
    this.parentLocationId = parentLocationId;
    this.existingLayoutId = existingLayoutId;
    this.existingLayoutCode = existingLayoutCode;
  }
}

export class CannotDeleteNonDraftLayoutError extends DomainError {
  public readonly code = "CANNOT_DELETE_NON_DRAFT_LAYOUT";
  public readonly layoutId: string;
  public readonly status: string;

  constructor(layoutId: string, status: string) {
    super(
      `Cannot delete layout '${layoutId}' because it has status '${status}'. Only DRAFT layouts may be deleted; archive the layout instead.`,
    );
    this.layoutId = layoutId;
    this.status = status;
  }
}

export class CannotModifyArchivedLayoutError extends DomainError {
  public readonly code = "CANNOT_MODIFY_ARCHIVED_LAYOUT";
  public readonly layoutId: string;

  constructor(layoutId: string, action: string = "modify") {
    super(`Cannot ${action} layout '${layoutId}' because it is ARCHIVED.`);
    this.layoutId = layoutId;
  }
}

export class MalformedSupersededGeometryError extends DomainError {
  public readonly code = "MALFORMED_SUPERSEDED_GEOMETRY";
  public readonly nodeId: string;
  public readonly locationId: string;
  public readonly reason: string;

  constructor(nodeId: string, locationId: string, reason: string) {
    super(
      `Cannot restore superseded geometry for spatial node '${nodeId}' (location '${locationId}'): ${reason}. Aborting operation to protect spatial geometry.`,
    );
    this.nodeId = nodeId;
    this.locationId = locationId;
    this.reason = reason;
  }
}

