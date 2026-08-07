import { Unit, type UpdateUnitInput } from "./unit";
import {
  UnitNameAlreadyExistsError,
  UnitNotFoundError,
} from "./unit.errors";
import type { UnitRepository } from "./unit.repository";

export class UpdateUnit {
  constructor(private readonly units: UnitRepository) {}

  async execute(id: string, input: UpdateUnitInput): Promise<Unit> {
    const existing = await this.units.findById(id);

    if (!existing) {
      throw new UnitNotFoundError(id);
    }

    if (input.name) {
      const name = input.name.trim();
      if (name !== existing.name) {
        const withName = await this.units.findByName(name);
        if (withName && withName.id !== id) {
          throw new UnitNameAlreadyExistsError(name);
        }
      }
    }

    const updatedUnit = existing.update(input);

    return this.units.update(updatedUnit);
  }
}
