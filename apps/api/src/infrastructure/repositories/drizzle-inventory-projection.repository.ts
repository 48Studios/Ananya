import { db, type DbExecutor } from '@ananya/database';
import { inventoryProjections } from '@ananya/database/schema';
import type {
  InventoryProjection,
  InventoryProjectionRepository,
} from '@ananya/inventory';
import { and, eq } from '@ananya/database/query';
import type { InventoryProjectionRow } from '@ananya/database/schema';
import { InventoryProjection as InventoryProjectionAggregate } from '@ananya/inventory';

function toDomain(row: InventoryProjectionRow): InventoryProjection {
  return InventoryProjectionAggregate.create({
    id: row.id,
    componentId: row.componentId,
    locationId: row.locationId,
    quantity: row.quantity,
    unitOfMeasure: row.unitOfMeasure,
    lastUpdated: row.lastUpdated,
  });
}

function toRow(
  projection: InventoryProjection,
): Omit<InventoryProjectionRow, 'id'> {
  return {
    componentId: projection.componentId,
    locationId: projection.locationId,
    quantity: projection.quantity,
    unitOfMeasure: projection.unitOfMeasure,
    lastUpdated: projection.lastUpdated,
  };
}

export class DrizzleInventoryProjectionRepository implements InventoryProjectionRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<InventoryProjection | null> {
    const [row] = await this.client
      .select()
      .from(inventoryProjections)
      .where(eq(inventoryProjections.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<InventoryProjection | null> {
    const [row] = await this.client
      .select()
      .from(inventoryProjections)
      .where(
        and(
          eq(inventoryProjections.componentId, componentId),
          eq(inventoryProjections.locationId, locationId),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findManyByComponent(
    componentId: string,
  ): Promise<InventoryProjection[]> {
    const rows = await this.client
      .select()
      .from(inventoryProjections)
      .where(eq(inventoryProjections.componentId, componentId));

    return rows.map(toDomain);
  }

  async findManyByLocation(locationId: string): Promise<InventoryProjection[]> {
    const rows = await this.client
      .select()
      .from(inventoryProjections)
      .where(eq(inventoryProjections.locationId, locationId));

    return rows.map(toDomain);
  }

  async save(projection: InventoryProjection): Promise<InventoryProjection> {
    const existing = await this.findByComponentAndLocation(
      projection.componentId,
      projection.locationId,
    );

    if (existing) {
      const [updatedRow] = await this.client
        .update(inventoryProjections)
        .set({
          quantity: projection.quantity,
          unitOfMeasure: projection.unitOfMeasure,
          lastUpdated: projection.lastUpdated,
        })
        .where(eq(inventoryProjections.id, existing.id))
        .returning();

      if (!updatedRow) {
        throw new Error('Failed to update inventory projection');
      }

      return toDomain(updatedRow);
    }

    const [insertedRow] = await this.client
      .insert(inventoryProjections)
      .values(toRow(projection))
      .returning();

    if (!insertedRow) {
      throw new Error('Failed to create inventory projection');
    }

    return toDomain(insertedRow);
  }

  async delete(id: string): Promise<void> {
    await this.client
      .delete(inventoryProjections)
      .where(eq(inventoryProjections.id, id));
  }

  async deleteByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<void> {
    await this.client
      .delete(inventoryProjections)
      .where(
        and(
          eq(inventoryProjections.componentId, componentId),
          eq(inventoryProjections.locationId, locationId),
        ),
      );
  }
}
