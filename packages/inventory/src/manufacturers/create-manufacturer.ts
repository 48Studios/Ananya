import { Manufacturer, type CreateManufacturerInput } from "./manufacturer";
import { ManufacturerCodeAlreadyExistsError } from "./manufacturer.errors";
import type { ManufacturerRepository } from "./manufacturer.repository";

export class CreateManufacturer {
  constructor(private readonly manufacturers: ManufacturerRepository) {}

  async execute(input: CreateManufacturerInput): Promise<Manufacturer> {
    // Normalize input for uniqueness check (the aggregate will normalize again)
    const code = input.code.trim().toUpperCase();

    const existing = await this.manufacturers.findByCode(code);

    if (existing) {
      throw new ManufacturerCodeAlreadyExistsError(code);
    }

    // Create the manufacturer using factory method
    const manufacturer = Manufacturer.create(input);

    // Persist the aggregate
    return this.manufacturers.save(manufacturer);
  }
}
