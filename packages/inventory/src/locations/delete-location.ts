import {
  LocationHasChildrenError,
  LocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

export class DeleteLocation {
  constructor(private readonly locations: LocationRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.locations.findById(id);

    if (!existing) {
      throw new LocationNotFoundError(id);
    }

    const children = await this.locations.findByParentId(id);
    if (children.length > 0) {
      throw new LocationHasChildrenError(id);
    }

    await this.locations.delete(id);
  }
}
