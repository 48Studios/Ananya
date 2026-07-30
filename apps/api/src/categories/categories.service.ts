import { Inject, Injectable } from '@nestjs/common';
import {
  CreateCategory,
  UpdateCategory,
  DeleteCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type Category,
  type CategoryRepository,
  CategoryNotFoundError,
} from '@ananya/inventory';
import { CATEGORY_REPOSITORY } from './category.tokens';

@Injectable()
export class CategoriesService {
  private readonly createCategory: CreateCategory;
  private readonly updateCategory: UpdateCategory;
  private readonly deleteCategory: DeleteCategory;

  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly repository: CategoryRepository,
  ) {
    this.createCategory = new CreateCategory(repository);
    this.updateCategory = new UpdateCategory(repository);
    this.deleteCategory = new DeleteCategory(repository);
  }

  create(input: CreateCategoryInput): Promise<Category> {
    return this.createCategory.execute(input);
  }

  update(id: string, input: UpdateCategoryInput): Promise<Category> {
    return this.updateCategory.execute(id, input);
  }

  delete(id: string): Promise<void> {
    return this.deleteCategory.execute(id);
  }

  getAllCategories(): Promise<Category[]> {
    return this.repository.findMany();
  }

  async getCategory(id: string): Promise<Category> {
    const category = await this.repository.findById(id);
    if (!category) {
      throw new CategoryNotFoundError(id);
    }
    return category;
  }
}
