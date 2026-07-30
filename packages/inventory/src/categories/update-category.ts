import { Category, type UpdateCategoryInput } from "./category";
import {
  CategoryCodeAlreadyExistsError,
  CategoryNotFoundError,
  CategoryCannotBeOwnParentError,
} from "./category.errors";
import type { CategoryRepository } from "./category.repository";

export class UpdateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.categories.findById(id);

    if (!existing) {
      throw new CategoryNotFoundError(id);
    }

    if (input.parentId && input.parentId === id) {
      throw new CategoryCannotBeOwnParentError();
    }

    if (input.parentId) {
      const parent = await this.categories.findById(input.parentId);
      if (!parent) {
        throw new CategoryNotFoundError(input.parentId);
      }
    }

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== existing.code) {
        const withCode = await this.categories.findByCode(code);
        if (withCode && withCode.id !== id) {
          throw new CategoryCodeAlreadyExistsError(code);
        }
      }
    }

    const updatedCategory = existing.update(input);

    return this.categories.update(updatedCategory);
  }
}
