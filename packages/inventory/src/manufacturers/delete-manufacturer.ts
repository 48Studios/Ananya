import {
  ManufacturerNotFoundError,
  ManufacturerReferencedByComponentsError,
} from "./manufacturer.errors";
import type { ManufacturerRepository } from "./manufacturer.repository";

export class DeleteManufacturer {
  constructor(private readonly manufacturers: ManufacturerRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.manufacturers.findById(id);

    if (!existing) {
      throw new ManufacturerNotFoundError(id);
    }

    const hasComponents = await this.manufacturers.hasComponents(id);
    if (hasComponents) {
      throw new ManufacturerReferencedByComponentsError(id);
    }

    await this.manufacturers.delete(id);
  }
}
