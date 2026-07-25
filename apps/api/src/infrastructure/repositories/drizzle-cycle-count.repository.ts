import { db } from '@ananya/database';
import { cycleCounts } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { CycleCountRecord } from '@ananya/database/schema';
import {
  CycleCount,
  type CycleCountRepository,
  type CountFrequency,
  type CycleCountStatus,
  type FindManyCycleCountsOptions,
} from '@ananya/warehouse';

function toDomain(row: CycleCountRecord): CycleCount {
  return CycleCount.rehydrate({
    id: row.id,
    warehouseId: row.warehouseId,
    name: row.name,
    frequency: row.frequency as CountFrequency,
    status: row.status as CycleCountStatus,
    selectionRule: row.selectionRule as Record<string, unknown> | null,
    nextScheduledDate: row.nextScheduledDate,
    lastExecutedAt: row.lastExecutedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCycleCountRepository implements CycleCountRepository {
  async findById(id: string): Promise<CycleCount | null> {
    const [row] = await db
      .select()
      .from(cycleCounts)
      .where(eq(cycleCounts.id, id))
      .limit(1);
    if (!row) return null;
    return toDomain(row);
  }

  async findMany(options?: FindManyCycleCountsOptions): Promise<CycleCount[]> {
    const query = db.select().from(cycleCounts);
    if (options?.warehouseId) {
      query.where(eq(cycleCounts.warehouseId, options.warehouseId));
    }
    if (options?.status) {
      query.where(eq(cycleCounts.status, options.status));
    }
    const rows = await query.orderBy(desc(cycleCounts.createdAt));
    return rows.map(toDomain);
  }

  async save(cycleCount: CycleCount): Promise<void> {
    await db
      .insert(cycleCounts)
      .values({
        id: cycleCount.id,
        warehouseId: cycleCount.warehouseId,
        name: cycleCount.name,
        frequency: cycleCount.frequency,
        status: cycleCount.status,
        selectionRule: cycleCount.selectionRule ?? null,
        nextScheduledDate: cycleCount.nextScheduledDate,
        lastExecutedAt: cycleCount.lastExecutedAt ?? null,
      })
      .onConflictDoUpdate({
        target: cycleCounts.id,
        set: {
          name: cycleCount.name,
          frequency: cycleCount.frequency,
          status: cycleCount.status,
          selectionRule: cycleCount.selectionRule ?? null,
          nextScheduledDate: cycleCount.nextScheduledDate,
          lastExecutedAt: cycleCount.lastExecutedAt ?? null,
          updatedAt: new Date(),
        },
      });
  }
}
