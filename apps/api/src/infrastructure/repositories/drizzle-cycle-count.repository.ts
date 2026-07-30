import { db } from '@ananya/database';
import { cycleCounts, cycleCountLines } from '@ananya/database/schema';
import { eq, desc, count, ilike, or } from '@ananya/database/query';
import type {
  CycleCountRecord,
  CycleCountLineRecord,
} from '@ananya/database/schema';
import {
  CycleCount,
  type CycleCountRepository,
  type CycleCountStatus,
  type FindManyCycleCountsOptions,
} from '@ananya/warehouse';

function toDomain(
  row: CycleCountRecord,
  lines: CycleCountLineRecord[] = [],
): CycleCount {
  return CycleCount.rehydrate({
    id: row.id,
    countNumber: row.countNumber,
    locationId: row.locationId,
    status: row.status as CycleCountStatus,
    assignedCounter: row.assignedCounter,
    scheduledDate: row.scheduledDate,
    completedAt: row.completedAt,
    approvedAt: row.approvedAt,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    stockAdjustmentId: row.stockAdjustmentId,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      cycleCountId: l.cycleCountId,
      componentId: l.componentId,
      systemQuantity: parseFloat(l.systemQuantity),
      countedQuantity: parseFloat(l.countedQuantity),
      variance: parseFloat(l.variance),
      unitOfMeasure: l.unitOfMeasure,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
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

    const lines = await db
      .select()
      .from(cycleCountLines)
      .where(eq(cycleCountLines.cycleCountId, id));

    return toDomain(row, lines);
  }

  async findByCountNumber(countNumber: string): Promise<CycleCount | null> {
    const [row] = await db
      .select()
      .from(cycleCounts)
      .where(eq(cycleCounts.countNumber, countNumber.toUpperCase()))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(cycleCountLines)
      .where(eq(cycleCountLines.cycleCountId, row.id));

    return toDomain(row, lines);
  }

  async findMany(options?: FindManyCycleCountsOptions): Promise<CycleCount[]> {
    const query = db.select().from(cycleCounts);

    if (options?.locationId) {
      query.where(eq(cycleCounts.locationId, options.locationId));
    }
    if (options?.status) {
      query.where(eq(cycleCounts.status, options.status));
    }
    if (options?.assignedCounter) {
      query.where(
        ilike(cycleCounts.assignedCounter, `%${options.assignedCounter}%`),
      );
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(
          ilike(cycleCounts.countNumber, pattern),
          ilike(cycleCounts.notes, pattern),
        ),
      );
    }

    const rows = await query.orderBy(desc(cycleCounts.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(cycleCountLines)
          .where(eq(cycleCountLines.cycleCountId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(cycleCount: CycleCount): Promise<void> {
    await db
      .insert(cycleCounts)
      .values({
        id: cycleCount.id,
        countNumber: cycleCount.countNumber,
        locationId: cycleCount.locationId,
        status: cycleCount.status,
        assignedCounter: cycleCount.assignedCounter ?? null,
        scheduledDate: cycleCount.scheduledDate ?? null,
        completedAt: cycleCount.completedAt ?? null,
        approvedAt: cycleCount.approvedAt ?? null,
        createdBy: cycleCount.createdBy ?? null,
        approvedBy: cycleCount.approvedBy ?? null,
        stockAdjustmentId: cycleCount.stockAdjustmentId ?? null,
        notes: cycleCount.notes ?? null,
      })
      .onConflictDoUpdate({
        target: cycleCounts.id,
        set: {
          locationId: cycleCount.locationId,
          status: cycleCount.status,
          assignedCounter: cycleCount.assignedCounter ?? null,
          scheduledDate: cycleCount.scheduledDate ?? null,
          completedAt: cycleCount.completedAt ?? null,
          approvedAt: cycleCount.approvedAt ?? null,
          createdBy: cycleCount.createdBy ?? null,
          approvedBy: cycleCount.approvedBy ?? null,
          stockAdjustmentId: cycleCount.stockAdjustmentId ?? null,
          notes: cycleCount.notes ?? null,
          updatedAt: new Date(),
        },
      });

    // Replace lines
    await db
      .delete(cycleCountLines)
      .where(eq(cycleCountLines.cycleCountId, cycleCount.id));

    for (const line of cycleCount.lines) {
      await db.insert(cycleCountLines).values({
        id: line.id,
        cycleCountId: cycleCount.id,
        componentId: line.componentId,
        systemQuantity: line.systemQuantity.toString(),
        countedQuantity: line.countedQuantity.toString(),
        variance: line.variance.toString(),
        unitOfMeasure: line.unitOfMeasure || 'pcs',
        notes: line.notes ?? null,
      });
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(cycleCounts).where(eq(cycleCounts.id, id));
  }

  async generateNextCountNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(cycleCounts);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `CC-${year}-${num}`;
  }
}
