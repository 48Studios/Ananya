import { db } from '@ananya/database';
import { components } from '@ananya/database/schema';
import type { Component, ComponentRepository } from '@ananya/inventory';
import { eq } from '@ananya/database/query';
import type { Component as ComponentRow } from '@ananya/database/schema';
import { Component as ComponentAggregate } from '@ananya/inventory';

function toDomain(row: ComponentRow): Component {
  return ComponentAggregate.rehydrate({
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    manufacturerId: row.manufacturerId,
    categoryId: row.categoryId,
    defaultLocationId: row.defaultLocationId,
    unit: row.unit,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(
  component: Component,
): Omit<ComponentRow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    sku: component.sku,
    name: component.name,
    description: component.description ?? null,
    manufacturerId: component.manufacturerId ?? null,
    categoryId: component.categoryId ?? null,
    defaultLocationId: component.defaultLocationId ?? null,
    unit: component.unit,
    isActive: component.isActive,
  };
}

export class DrizzleComponentRepository implements ComponentRepository {
  async findById(id: string): Promise<Component | null> {
    const [row] = await db
      .select()
      .from(components)
      .where(eq(components.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findBySku(sku: string): Promise<Component | null> {
    const [row] = await db
      .select()
      .from(components)
      .where(eq(components.sku, sku))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findMany(): Promise<Component[]> {
    const rows = await db.select().from(components).orderBy(components.sku);

    return rows.map(toDomain);
  }

  async save(component: Component): Promise<Component> {
    const [row] = await db
      .insert(components)
      .values(toRow(component))
      .returning();

    if (!row) {
      throw new Error('Failed to create component');
    }

    return toDomain(row);
  }

  async update(component: Component): Promise<Component> {
    const [row] = await db
      .update(components)
      .set({
        sku: component.sku,
        name: component.name,
        description: component.description ?? null,
        manufacturerId: component.manufacturerId ?? null,
        categoryId: component.categoryId ?? null,
        defaultLocationId: component.defaultLocationId ?? null,
        unit: component.unit,
        isActive: component.isActive,
        updatedAt: component.updatedAt,
      })
      .where(eq(components.id, component.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update component: ${component.id}`);
    }

    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(components).where(eq(components.id, id));
  }
}
