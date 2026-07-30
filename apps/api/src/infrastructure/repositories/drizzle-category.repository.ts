import { db } from '@ananya/database';
import { categories, components } from '@ananya/database/schema';
import type { Category, CategoryRepository } from '@ananya/inventory';
import { eq } from '@ananya/database/query';
import type { Category as CategoryRow } from '@ananya/database/schema';
import { Category as CategoryAggregate } from '@ananya/inventory';

function toDomain(row: CategoryRow): Category {
  return CategoryAggregate.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(
  category: Category,
): Omit<CategoryRow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    code: category.code,
    name: category.name,
    description: category.description ?? null,
    parentId: category.parentId ?? null,
    isActive: category.isActive,
  };
}

export class DrizzleCategoryRepository implements CategoryRepository {
  async findById(id: string): Promise<Category | null> {
    const [row] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Category | null> {
    const [row] = await db
      .select()
      .from(categories)
      .where(eq(categories.code, code))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByParentId(parentId: string): Promise<Category[]> {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.parentId, parentId))
      .orderBy(categories.code);

    return rows.map(toDomain);
  }

  async findMany(): Promise<Category[]> {
    const rows = await db.select().from(categories).orderBy(categories.code);

    return rows.map(toDomain);
  }

  async save(category: Category): Promise<Category> {
    const [row] = await db
      .insert(categories)
      .values(toRow(category))
      .returning();

    if (!row) {
      throw new Error('Failed to create category');
    }

    return toDomain(row);
  }

  async update(category: Category): Promise<Category> {
    const [row] = await db
      .update(categories)
      .set({
        code: category.code,
        name: category.name,
        description: category.description ?? null,
        parentId: category.parentId ?? null,
        isActive: category.isActive,
        updatedAt: category.updatedAt,
      })
      .where(eq(categories.id, category.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update category: ${category.id}`);
    }

    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async hasChildren(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id))
      .limit(1);

    return Boolean(row);
  }

  async hasComponents(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: components.id })
      .from(components)
      .where(eq(components.categoryId, id))
      .limit(1);

    return Boolean(row);
  }
}
