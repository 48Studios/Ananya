import { ComponentNotFoundError } from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export class DeleteComponent {
  constructor(private readonly components: ComponentRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.components.findById(id);

    if (!existing) {
      throw new ComponentNotFoundError(id);
    }

    // A consolidated component is the historical record of where its activity
    // went, and other records (including `consolidation_sources`) reference it.
    // Hard deletion stays prohibited for it.
    existing.assertCanBeDeleted();

    await this.components.delete(id);
  }
}
