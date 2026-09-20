import { db } from '@ananya/database';
import { components } from '@ananya/database/schema';
import {
  ComponentSkuAlreadyExistsError,
  type Component,
  type ComponentRepository,
} from '@ananya/inventory';
import { eq } from '@ananya/database/query';
import type { Component as ComponentRow } from '@ananya/database/schema';
import { Component as ComponentAggregate } from '@ananya/inventory';

/**
 * Query surface shared by the root Drizzle client and a transaction handle.
 *
 * The repository defaults to the global client (the normal path for every
 * existing caller). Passing a transaction handle binds the same queries to a
 * caller-owned transaction, which lets an orchestration service hold a row lock
 * and mutate the component atomically through the regular domain use case.
 */
export type ComponentDbExecutor = typeof db;

function toDomain(row: ComponentRow): Component {
  return ComponentAggregate.rehydrate({
    id: row.id,
    sku: row.sku,
    manufacturerPartNumber: row.manufacturerPartNumber,
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
    manufacturerPartNumber: component.manufacturerPartNumber ?? null,
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
  constructor(private readonly client: ComponentDbExecutor = db) {}

  async findById(id: string): Promise<Component | null> {
    const [row] = await this.client
      .select()
      .from(components)
      .where(eq(components.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findBySku(sku: string): Promise<Component | null> {
    const [row] = await this.client
      .select()
      .from(components)
      .where(eq(components.sku, sku))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findMany(): Promise<Component[]> {
    const rows = await this.client
      .select()
      .from(components)
      .orderBy(components.sku);

    return rows.map(toDomain);
  }

  async save(component: Component): Promise<Component> {
    try {
      const [row] = await this.client
        .insert(components)
        .values(toRow(component))
        .returning();

      if (!row) {
        throw new Error('Failed to create component');
      }

      return toDomain(row);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ComponentSkuAlreadyExistsError(component.sku);
      }
      throw error;
    }
  }

  async update(component: Component): Promise<Component> {
    let row;
    try {
      [row] = await this.client
        .update(components)
        .set({
          sku: component.sku,
          manufacturerPartNumber: component.manufacturerPartNumber ?? null,
          name: component.name,
          description: component.description ?? null,
          categoryId: component.categoryId ?? null,
          manufacturerId: component.manufacturerId ?? null,
          defaultLocationId: component.defaultLocationId ?? null,
          unit: component.unit,
          isActive: component.isActive,
          updatedAt: component.updatedAt,
        })
        .where(eq(components.id, component.id))
        .returning();
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ComponentSkuAlreadyExistsError(component.sku);
      }
      throw error;
    }

    if (!row) {
      throw new Error(`Failed to update component: ${component.id}`);
    }

    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(components).where(eq(components.id, id));
  }
}
