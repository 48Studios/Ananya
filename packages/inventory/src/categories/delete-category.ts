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

    const targetId = existing.id;
    const categoryLabel = existing.name || existing.code;

    const hasChildren = await this.categories.hasChildren(targetId);
    if (hasChildren) {
      throw new CategoryHasChildrenError(categoryLabel);
    }

    const hasComponents = await this.categories.hasComponents(targetId);
    if (hasComponents) {
      throw new CategoryReferencedByComponentsError(categoryLabel);
    }

    await this.categories.delete(targetId);
  }
}
