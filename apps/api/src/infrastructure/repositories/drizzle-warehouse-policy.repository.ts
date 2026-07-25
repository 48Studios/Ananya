import { db } from '@ananya/database';
import { warehousePolicies } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { WarehousePolicyRecord } from '@ananya/database/schema';
import {
  WarehousePolicy,
  type WarehousePolicyRepository,
} from '@ananya/warehouse';

function toDomain(row: WarehousePolicyRecord): WarehousePolicy {
  return WarehousePolicy.rehydrate({
    id: row.id,
    warehouseId: row.warehouseId,
    allowNegativeInventory: row.allowNegativeInventory,
    enforceBinCapacity: row.enforceBinCapacity,
    directedPutaway: row.directedPutaway,
    directedPicking: row.directedPicking,
    defaultReceivingBinId: row.defaultReceivingBinId,
    defaultProductionBinId: row.defaultProductionBinId,
    defaultShippingBinId: row.defaultShippingBinId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWarehousePolicyRepository implements WarehousePolicyRepository {
  async findById(id: string): Promise<WarehousePolicy | null> {
    const [row] = await db
      .select()
      .from(warehousePolicies)
      .where(eq(warehousePolicies.id, id))
      .limit(1);
    if (!row) return null;
    return toDomain(row);
  }

  async findByWarehouseId(
    warehouseId: string,
  ): Promise<WarehousePolicy | null> {
    const [row] = await db
      .select()
      .from(warehousePolicies)
      .where(eq(warehousePolicies.warehouseId, warehouseId))
      .limit(1);
    if (!row) return null;
    return toDomain(row);
  }

  async findMany(): Promise<WarehousePolicy[]> {
    const rows = await db
      .select()
      .from(warehousePolicies)
      .orderBy(desc(warehousePolicies.createdAt));
    return rows.map(toDomain);
  }

  async save(policy: WarehousePolicy): Promise<void> {
    await db
      .insert(warehousePolicies)
      .values({
        id: policy.id,
        warehouseId: policy.warehouseId,
        allowNegativeInventory: policy.allowNegativeInventory,
        enforceBinCapacity: policy.enforceBinCapacity,
        directedPutaway: policy.directedPutaway,
        directedPicking: policy.directedPicking,
        defaultReceivingBinId: policy.defaultReceivingBinId ?? null,
        defaultProductionBinId: policy.defaultProductionBinId ?? null,
        defaultShippingBinId: policy.defaultShippingBinId ?? null,
      })
      .onConflictDoUpdate({
        target: warehousePolicies.warehouseId,
        set: {
          allowNegativeInventory: policy.allowNegativeInventory,
          enforceBinCapacity: policy.enforceBinCapacity,
          directedPutaway: policy.directedPutaway,
          directedPicking: policy.directedPicking,
          defaultReceivingBinId: policy.defaultReceivingBinId ?? null,
          defaultProductionBinId: policy.defaultProductionBinId ?? null,
          defaultShippingBinId: policy.defaultShippingBinId ?? null,
          updatedAt: new Date(),
        },
      });
  }
}
