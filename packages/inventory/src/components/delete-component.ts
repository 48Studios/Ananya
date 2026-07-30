import { ComponentNotFoundError } from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export class DeleteComponent {
  constructor(private readonly components: ComponentRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.components.findById(id);

    if (!existing) {
      throw new ComponentNotFoundError(id);
    }

    await this.components.delete(id);
  }
}
