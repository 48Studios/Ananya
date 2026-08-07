import { UnitNotFoundError } from "./unit.errors";
import type { UnitRepository } from "./unit.repository";

export class DeleteUnit {
  constructor(private readonly units: UnitRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.units.findById(id);

    if (!existing) {
      throw new UnitNotFoundError(id);
    }

    await this.units.delete(id);
  }
}
