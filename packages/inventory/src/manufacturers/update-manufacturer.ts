import { Manufacturer, type UpdateManufacturerInput } from "./manufacturer";
import {
  ManufacturerCodeAlreadyExistsError,
  ManufacturerNotFoundError,
} from "./manufacturer.errors";
import type { ManufacturerRepository } from "./manufacturer.repository";

export class UpdateManufacturer {
  constructor(private readonly manufacturers: ManufacturerRepository) {}

  async execute(
    id: string,
    input: UpdateManufacturerInput,
  ): Promise<Manufacturer> {
    const existing = await this.manufacturers.findById(id);

    if (!existing) {
      throw new ManufacturerNotFoundError(id);
    }

    if (input.code) {
      const code = input.code.trim().toLowerCase();
      if (code !== existing.code) {
        const withCode = await this.manufacturers.findByCode(code);
        if (withCode && withCode.id !== id) {
          throw new ManufacturerCodeAlreadyExistsError(code);
        }
      }
    }

    const updatedManufacturer = existing.update(input);

    return this.manufacturers.update(updatedManufacturer);
  }
}
