import { Location, canonicalizeLocationKind, type UpdateLocationInput } from "./location";
import {
  CannotParentToSelfError,
  LocationHierarchyCycleError,
  InactiveParentLocationError,
  LocationCodeAlreadyExistsError,
  LocationNotFoundError,
  ParentLocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";
import { validatePhysicalContainer } from "./physical-containment";

export class UpdateLocation {
  constructor(private readonly locations: LocationRepository) {}

  async execute(id: string, input: UpdateLocationInput): Promise<Location> {
    const existing = await this.locations.findById(id);

    if (!existing) {
      throw new LocationNotFoundError(id);
    }

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== existing.code) {
        const withCode = await this.locations.findByCode(code);
        if (withCode && withCode.id !== id) {
          throw new LocationCodeAlreadyExistsError(code);
        }
      }
    }

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw new CannotParentToSelfError(id);
      }

      const parent = await this.locations.findById(input.parentId);

      if (!parent) {
        throw new ParentLocationNotFoundError(input.parentId);
      }

      if (!parent.isActive) {
        throw new InactiveParentLocationError(input.parentId);
      }

      // Structural cycle check: `id` must not appear in its prospective
      // parent's ancestor chain (direct self-parenting is already rejected
      // above). Bounded traversal terminates on malformed pre-existing cycles.
      // No physical parent/child category compatibility is enforced here.
      const ancestorIds = await this.locations.findAncestorIds(input.parentId);
      if (ancestorIds.includes(id)) {
        throw new LocationHierarchyCycleError(id, input.parentId);
      }
    }

    // Physical containment (RFC-0069 Phase 2), validated against the effective
    // post-update kind. Omitted `containerId` leaves the existing value
    // unchanged; `null` clears it. Never derived from parentId, and a change to
    // `containerId` never touches parentId (nor any child's containerId).
    const effectiveKind =
      input.kind !== undefined
        ? canonicalizeLocationKind(input.kind)
        : existing.kind;
    await validatePhysicalContainer(this.locations, {
      locationId: id,
      containerId: input.containerId,
      childKind: effectiveKind,
    });

    const updatedLocation = existing.update(input);

    return this.locations.update(updatedLocation);
  }
}
