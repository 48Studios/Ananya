import { db } from '@ananya/database';
import {
  locations,
  goodsReceiptLines,
  inventoryProjections,
  warehouseTransfers,
  materialConsumptionLines,
  inventoryReservationLines,
  stockAdjustments,
  cycleCounts,
  productionOrders,
  serials,
} from '@ananya/database/schema';
import type { Location, LocationRepository } from '@ananya/inventory';
import { eq, or } from '@ananya/database/query';
import type { Location as LocationRow } from '@ananya/database/schema';
import { Location as LocationAggregate, LocationInUseError } from '@ananya/inventory';

function toDomain(row: LocationRow): Location {
  return LocationAggregate.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(
  location: Location,
): Omit<LocationRow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    code: location.code,
    name: location.name,
    kind: location.kind,
    parentId: location.parentId,
    isActive: location.isActive,
    metadata: location.metadata,
  };
}

export class DrizzleLocationRepository implements LocationRepository {
  async findById(id: string): Promise<Location | null> {
    const [row] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Location | null> {
    const [row] = await db
      .select()
      .from(locations)
      .where(eq(locations.code, code))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByParentId(parentId: string): Promise<Location[]> {
    const rows = await db
      .select()
      .from(locations)
      .where(eq(locations.parentId, parentId))
      .orderBy(locations.code);

    return rows.map(toDomain);
  }

  async findMany(): Promise<Location[]> {
    const rows = await db.select().from(locations).orderBy(locations.code);

    return rows.map(toDomain);
  }

  async save(location: Location): Promise<Location> {
    const [row] = await db
      .insert(locations)
      .values(toRow(location))
      .returning();

    if (!row) {
      throw new Error('Location insert returned no row');
    }

    return toDomain(row);
  }

  async update(location: Location): Promise<Location> {
    const [row] = await db
      .update(locations)
      .set({
        code: location.code,
        name: location.name,
        kind: location.kind,
        parentId: location.parentId,
        isActive: location.isActive,
        metadata: location.metadata,
        updatedAt: location.updatedAt,
      })
      .where(eq(locations.id, location.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update location: ${location.id}`);
    }

    return toDomain(row);
  }

  async isInUse(id: string): Promise<boolean> {
    const [gr] = await db
      .select({ id: goodsReceiptLines.id })
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.locationId, id))
      .limit(1);
    if (gr) return true;

    const [proj] = await db
      .select({ id: inventoryProjections.id })
      .from(inventoryProjections)
      .where(eq(inventoryProjections.locationId, id))
      .limit(1);
    if (proj) return true;

    const [transfer] = await db
      .select({ id: warehouseTransfers.id })
      .from(warehouseTransfers)
      .where(
        or(
          eq(warehouseTransfers.sourceLocationId, id),
          eq(warehouseTransfers.destinationLocationId, id),
        ),
      )
      .limit(1);
    if (transfer) return true;

    const [po] = await db
      .select({ id: productionOrders.id })
      .from(productionOrders)
      .where(eq(productionOrders.locationId, id))
      .limit(1);
    if (po) return true;

    const [mc] = await db
      .select({ id: materialConsumptionLines.id })
      .from(materialConsumptionLines)
      .where(eq(materialConsumptionLines.locationId, id))
      .limit(1);
    if (mc) return true;

    const [res] = await db
      .select({ id: inventoryReservationLines.id })
      .from(inventoryReservationLines)
      .where(eq(inventoryReservationLines.locationId, id))
      .limit(1);
    if (res) return true;

    const [sa] = await db
      .select({ id: stockAdjustments.id })
      .from(stockAdjustments)
      .where(eq(stockAdjustments.locationId, id))
      .limit(1);
    if (sa) return true;

    const [cc] = await db
      .select({ id: cycleCounts.id })
      .from(cycleCounts)
      .where(eq(cycleCounts.locationId, id))
      .limit(1);
    if (cc) return true;

    const [serial] = await db
      .select({ id: serials.id })
      .from(serials)
      .where(eq(serials.locationId, id))
      .limit(1);
    if (serial) return true;

    return false;
  }

  async delete(id: string): Promise<void> {
    try {
      await db.delete(locations).where(eq(locations.id, id));
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        throw new LocationInUseError(id);
      }
      throw err;
    }
  }
}
