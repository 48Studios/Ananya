import { Component, type UpdateComponentInput } from "./component";
import {
  ComponentNotFoundError,
  ComponentSkuAlreadyExistsError,
} from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export class UpdateComponent {
  constructor(private readonly components: ComponentRepository) {}

  async execute(id: string, input: UpdateComponentInput): Promise<Component> {
    const existing = await this.components.findById(id);

    if (!existing) {
      throw new ComponentNotFoundError(id);
    }

    if (input.sku) {
      const sku = input.sku.trim().toLowerCase();
      if (sku !== existing.sku) {
        const withSku = await this.components.findBySku(sku);
        if (withSku && withSku.id !== id) {
          throw new ComponentSkuAlreadyExistsError(sku);
        }
      }
    }

    const updatedComponent = existing.update(input);

    return this.components.update(updatedComponent);
  }
}
