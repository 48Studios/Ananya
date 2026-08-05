import { Category, type CreateCategoryInput } from "./category";
import {
  CategoryCodeAlreadyExistsError,
  CategoryNotFoundError,
} from "./category.errors";
import type { CategoryRepository } from "./category.repository";

export class CreateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const code = input.code.trim().toUpperCase();

    const existing = await this.categories.findByCode(code);
    if (existing) {
      throw new CategoryCodeAlreadyExistsError(code);
    }

    if (input.parentId) {
      const parent = await this.categories.findById(input.parentId);
      if (!parent) {
        throw new CategoryNotFoundError(input.parentId);
      }
    }

    const category = Category.create(input);

    return this.categories.save(category);
  }
}
