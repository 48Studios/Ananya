import {
  canBePhysicalContainer,
  explainPhysicalContainmentRejection,
} from "../spatial/location-model";
import {
  CannotContainSelfError,
  ContainerHierarchyCycleError,
  ContainerLocationNotFoundError,
  InactiveContainerLocationError,
  InvalidPhysicalContainmentError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

export interface PhysicalContainerValidationInput {
  /** The location being created or updated. */
  locationId: string;
  /** The supplied physical container. `undefined`/`null` mean "no container". */
  containerId: string | null | undefined;
  /** Effective canonical kind of the child location. */
  childKind: string;
}

/**
 * Single write-boundary validator for physical containment (RFC-0069 Phase 2).
 *
 * Shared by `CreateLocation` and `UpdateLocation` so the two paths can never
 * diverge. It is a no-op when no container is supplied, so omitting `containerId`
 * (create or update) performs zero work.
 *
 * Deterministic check order:
 *   1. self-container            → CannotContainSelfError        (400)
 *   2. container exists          → ContainerLocationNotFoundError (400)
 *   3. container active          → InactiveContainerLocationError (409)
 *   4. category containment      → InvalidPhysicalContainmentError (400)
 *   5. physical cycle            → ContainerHierarchyCycleError   (400)
 *
 * The physical graph is walked via `findContainerAncestorIds`, which is
 * completely separate from the `parentId` ancestor walk.
 */
export async function validatePhysicalContainer(
  locations: LocationRepository,
  input: PhysicalContainerValidationInput,
): Promise<void> {
  const { locationId, containerId, childKind } = input;

  // Omitted or explicitly null: no physical containment to validate.
  if (containerId === undefined || containerId === null) {
    return;
  }

  // 1. A location can never be its own container.
  if (containerId === locationId) {
    throw new CannotContainSelfError(locationId);
  }

  // 2. The container must exist.
  const container = await locations.findById(containerId);
  if (!container) {
    throw new ContainerLocationNotFoundError(containerId);
  }

  // 3. The container must be active.
  if (!container.isActive) {
    throw new InactiveContainerLocationError(containerId);
  }

  // 4. The category pair must be canonical physical containment. The canonical
  //    predicate is the single authority; no local matrix is applied here.
  const rejection = explainPhysicalContainmentRejection(
    container.kind,
    childKind,
  );
  if (rejection || !canBePhysicalContainer(container.kind, childKind)) {
    throw new InvalidPhysicalContainmentError(
      rejection?.reason ??
        `'${container.kind}' cannot physically contain '${childKind}'.`,
    );
  }

  // 5. The physical graph must remain acyclic. `locationId` must not appear in
  //    the prospective container's container-ancestor chain. Bounded traversal
  //    terminates even on malformed pre-existing data.
  const containerAncestors =
    await locations.findContainerAncestorIds(containerId);
  if (containerAncestors.includes(locationId)) {
    throw new ContainerHierarchyCycleError(locationId, containerId);
  }
}
