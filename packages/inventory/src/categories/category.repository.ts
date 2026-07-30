import { Category } from "./category";

export interface FindManyCategoriesOptions {}

export interface CategoryRepository {
  findById(id: string): Promise<Category | null>;
  findByCode(code: string): Promise<Category | null>;
  findByParentId(parentId: string): Promise<Category[]>;
  findMany(options?: FindManyCategoriesOptions): Promise<Category[]>;
  save(category: Category): Promise<Category>;
  update(category: Category): Promise<Category>;
  delete(id: string): Promise<void>;
  hasChildren(id: string): Promise<boolean>;
  hasComponents(id: string): Promise<boolean>;
}
