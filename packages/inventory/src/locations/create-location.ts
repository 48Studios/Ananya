import { Location, type CreateLocationInput } from "./location";
import {
  InactiveParentLocationError,
  LocationCodeAlreadyExistsError,
  ParentLocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";
import { validatePhysicalContainer } from "./physical-containment";

export class CreateLocation {
  constructor(private readonly locations: LocationRepository) {}

  async execute(input: CreateLocationInput): Promise<Location> {
    // Normalize input for uniqueness check (the aggregate will normalize again)
    const code = input.code.trim().toUpperCase();

    const existing = await this.locations.findByCode(code);

    if (existing) {
      throw new LocationCodeAlreadyExistsError(code);
    }

    if (input.parentId) {
      const parent = await this.locations.findById(input.parentId);

      if (!parent) {
        throw new ParentLocationNotFoundError(input.parentId);
      }

      if (!parent.isActive) {
        throw new InactiveParentLocationError(input.parentId);
      }
    }

    // Create the location using factory method.
    //
    // No cycle check is needed here: `Location.create` generates a brand-new
    // identity, so the new location cannot already appear in its parent's
    // ancestor chain (and it cannot be its own parent). A cycle can only be
    // introduced by *re-parenting* an existing location, which
    // `UpdateLocation` guards.
    const location = Location.create(input);

    // Physical containment (RFC-0069 Phase 2). Omitted / null is a no-op, so a
    // valid `parentId` with no `containerId` remains valid. Never inferred from
    // parentId. (Requiring a container for in-container locations is Phase 5.)
    await validatePhysicalContainer(this.locations, {
      locationId: location.id,
      containerId: input.containerId,
      childKind: location.kind,
    });

    // Persist the aggregate
    return this.locations.save(location);
  }
}
