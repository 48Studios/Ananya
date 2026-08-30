import { Component, type CreateComponentInput } from "./component";
import { ComponentSkuAlreadyExistsError } from "./component.errors";
import type { ComponentRepository } from "./component.repository";

export class CreateComponent {
  constructor(private readonly components: ComponentRepository) {}

  async execute(input: CreateComponentInput): Promise<Component> {
    // Normalize input for uniqueness check (the aggregate will normalize again)
    const sku = input.sku.trim().toUpperCase();

    const existing = await this.components.findBySku(sku);

    if (existing) {
      throw new ComponentSkuAlreadyExistsError(sku);
    }

    // Create the component using factory method
    const component = Component.create(input);

    // Persist the aggregate
    return this.components.save(component);
  }
}
