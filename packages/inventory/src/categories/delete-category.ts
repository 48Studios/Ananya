import {
  CategoryNotFoundError,
  CategoryHasChildrenError,
  CategoryReferencedByComponentsError,
} from "./category.errors";
import type { CategoryRepository } from "./category.repository";

export class DeleteCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.categories.findById(id);

    if (!existing) {
      throw new CategoryNotFoundError(id);
    }

    const hasChildren = await this.categories.hasChildren(id);
    if (hasChildren) {
      throw new CategoryHasChildrenError(id);
    }

    const hasComponents = await this.categories.hasComponents(id);
    if (hasComponents) {
      throw new CategoryReferencedByComponentsError(id);
    }

    await this.categories.delete(id);
  }
}
