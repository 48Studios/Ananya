import { db } from '@ananya/database';
import { manufacturers, components } from '@ananya/database/schema';
import type { Manufacturer, ManufacturerRepository } from '@ananya/inventory';
import { eq } from '@ananya/database/query';
import type { Manufacturer as ManufacturerRow } from '@ananya/database/schema';
import { Manufacturer as ManufacturerAggregate } from '@ananya/inventory';

function toDomain(row: ManufacturerRow): Manufacturer {
  return ManufacturerAggregate.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(
  manufacturer: Manufacturer,
): Omit<ManufacturerRow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    code: manufacturer.code,
    name: manufacturer.name,
    isActive: manufacturer.isActive,
  };
}

export class DrizzleManufacturerRepository implements ManufacturerRepository {
  async findById(id: string): Promise<Manufacturer | null> {
    const [row] = await db
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Manufacturer | null> {
    const [row] = await db
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.code, code))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findMany(): Promise<Manufacturer[]> {
    const rows = await db
      .select()
      .from(manufacturers)
      .orderBy(manufacturers.code);

    return rows.map(toDomain);
  }

  async save(manufacturer: Manufacturer): Promise<Manufacturer> {
    const [row] = await db
      .insert(manufacturers)
      .values(toRow(manufacturer))
      .returning();

    if (!row) {
      throw new Error('Failed to create manufacturer');
    }

    return toDomain(row);
  }

  async update(manufacturer: Manufacturer): Promise<Manufacturer> {
    const [row] = await db
      .update(manufacturers)
      .set({
        code: manufacturer.code,
        name: manufacturer.name,
        isActive: manufacturer.isActive,
        updatedAt: manufacturer.updatedAt,
      })
      .where(eq(manufacturers.id, manufacturer.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update manufacturer: ${manufacturer.id}`);
    }

    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(manufacturers).where(eq(manufacturers.id, id));
  }

  async hasComponents(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: components.id })
      .from(components)
      .where(eq(components.manufacturerId, id))
      .limit(1);

    return Boolean(row);
  }
}
