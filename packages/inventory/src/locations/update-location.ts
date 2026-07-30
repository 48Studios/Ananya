import { Location, type UpdateLocationInput } from "./location";
import {
  CannotParentToSelfError,
  InactiveParentLocationError,
  LocationCodeAlreadyExistsError,
  LocationNotFoundError,
  ParentLocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

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
    }

    const updatedLocation = existing.update(input);

    return this.locations.update(updatedLocation);
  }
}
