import { db } from '@ananya/database';
import { warehouses, warehouseBins } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type {
  WarehouseRecord,
  WarehouseBinRecord,
} from '@ananya/database/schema';
import {
  Warehouse,
  type WarehouseRepository,
  type BinPurpose,
  type WarehouseBinProps,
} from '@ananya/warehouse';

function toDomain(
  row: WarehouseRecord,
  bins: WarehouseBinRecord[] = [],
): Warehouse {
  return Warehouse.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    bins: bins.map((b) => ({
      id: b.id,
      warehouseId: b.warehouseId,
      code: b.code,
      capacity: parseFloat(b.capacity),
      currentUtilization: parseFloat(b.currentUtilization),
      purpose: b.purpose as BinPurpose,
      isActive: b.isActive,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWarehouseRepository implements WarehouseRepository {
  async findById(id: string): Promise<Warehouse | null> {
    const [row] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, id))
      .limit(1);
    if (!row) return null;
    const bins = await db
      .select()
      .from(warehouseBins)
      .where(eq(warehouseBins.warehouseId, id));
    return toDomain(row, bins);
  }

  async findByCode(code: string): Promise<Warehouse | null> {
    const [row] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.code, code.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const bins = await db
      .select()
      .from(warehouseBins)
      .where(eq(warehouseBins.warehouseId, row.id));
    return toDomain(row, bins);
  }

  async findMany(): Promise<Warehouse[]> {
    const rows = await db
      .select()
      .from(warehouses)
      .orderBy(desc(warehouses.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const bins = await db
          .select()
          .from(warehouseBins)
          .where(eq(warehouseBins.warehouseId, row.id));
        return toDomain(row, bins);
      }),
    );
  }

  async findBinById(binId: string): Promise<WarehouseBinProps | null> {
    const [row] = await db
      .select()
      .from(warehouseBins)
      .where(eq(warehouseBins.id, binId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      code: row.code,
      capacity: parseFloat(row.capacity),
      currentUtilization: parseFloat(row.currentUtilization),
      purpose: row.purpose as BinPurpose,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async save(warehouse: Warehouse): Promise<void> {
    await db
      .insert(warehouses)
      .values({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        description: warehouse.description ?? null,
        status: warehouse.status,
      })
      .onConflictDoUpdate({
        target: warehouses.id,
        set: {
          name: warehouse.name,
          description: warehouse.description ?? null,
          status: warehouse.status,
          updatedAt: new Date(),
        },
      });

    for (const bin of warehouse.bins) {
      await db
        .insert(warehouseBins)
        .values({
          id: bin.id,
          warehouseId: warehouse.id,
          code: bin.code,
          capacity: bin.capacity.toString(),
          currentUtilization: bin.currentUtilization.toString(),
          purpose: bin.purpose,
          isActive: bin.isActive,
        })
        .onConflictDoUpdate({
          target: warehouseBins.id,
          set: {
            capacity: bin.capacity.toString(),
            currentUtilization: bin.currentUtilization.toString(),
            purpose: bin.purpose,
            isActive: bin.isActive,
            updatedAt: new Date(),
          },
        });
    }
  }
}
