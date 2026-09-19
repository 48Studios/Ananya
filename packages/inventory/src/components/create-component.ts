import { Component, type CreateComponentInput } from "./component";
import { ComponentSkuAlreadyExistsError } from "./component.errors";
import type { ComponentRepository } from "./component.repository";
import type { ComponentSkuGenerator } from "./component-sku";

export class CreateComponent {
  constructor(
    private readonly components: ComponentRepository,
    private readonly skuGenerator?: ComponentSkuGenerator,
  ) {}

  async execute(input: CreateComponentInput): Promise<Component> {
    const explicitSku = input.sku?.trim();
    const isGeneratedSkuCandidate = Boolean(
      explicitSku && /^CMP-\d{6}$/i.test(explicitSku),
    );
    if (explicitSku && !isGeneratedSkuCandidate) {
      const sku = explicitSku.toUpperCase();
      const existing = await this.components.findBySku(sku);
      if (existing) {
        throw new ComponentSkuAlreadyExistsError(sku);
      }
      return this.components.save(Component.create({ ...input, sku }));
    }

    if (!this.skuGenerator) {
      return this.components.save(Component.create(input));
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const sku =
        attempt === 0 && isGeneratedSkuCandidate
          ? explicitSku!.toUpperCase()
          : await this.skuGenerator.generate();
      try {
        return await this.components.save(Component.create({ ...input, sku }));
      } catch (error) {
        if (!(error instanceof ComponentSkuAlreadyExistsError)) {
          throw error;
        }
      }
    }

    throw new ComponentSkuAlreadyExistsError("generated component SKU");
  }
}
