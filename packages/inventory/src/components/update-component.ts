import { Component, type UpdateComponentInput } from "./component";
import { ComponentNotFoundError } from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export class UpdateComponent {
  constructor(private readonly components: ComponentRepository) {}

  async execute(id: string, input: UpdateComponentInput): Promise<Component> {
    const existing = await this.components.findById(id);

    if (!existing) {
      throw new ComponentNotFoundError(id);
    }

    const updatedComponent = existing.update(input);

    return this.components.update(updatedComponent);
  }
}
