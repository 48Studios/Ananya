import { db } from '@ananya/database';
import { locations } from '@ananya/database/schema';
import type { Location, LocationRepository } from '@ananya/inventory';
import { eq } from '@ananya/database/query';
import type { Location as LocationRow } from '@ananya/database/schema';
import { Location as LocationAggregate } from '@ananya/inventory';

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

  async delete(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }
}
