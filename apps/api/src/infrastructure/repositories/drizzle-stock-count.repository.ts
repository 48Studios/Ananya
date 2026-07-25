import { db } from '@ananya/database';
import { stockCounts, stockCountLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  StockCountRecord,
  StockCountLineRecord,
} from '@ananya/database/schema';
import {
  StockCount,
  type StockCountRepository,
  type StockCountStatus,
  type FindManyStockCountsOptions,
} from '@ananya/warehouse';

function toDomain(
  row: StockCountRecord,
  lines: StockCountLineRecord[] = [],
): StockCount {
  return StockCount.rehydrate({
    id: row.id,
    countNumber: row.countNumber,
    warehouseId: row.warehouseId,
    assignedUser: row.assignedUser,
    status: row.status as StockCountStatus,
    postedAt: row.postedAt,
    lines: lines.map((l) => ({
      id: l.id,
      stockCountId: l.stockCountId,
      componentId: l.componentId,
      binId: l.binId,
      expectedQuantity: parseFloat(l.expectedQuantity),
      countedQuantity: parseFloat(l.countedQuantity),
      variance: parseFloat(l.variance),
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleStockCountRepository implements StockCountRepository {
  async findById(id: string): Promise<StockCount | null> {
    const [row] = await db
      .select()
      .from(stockCounts)
      .where(eq(stockCounts.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(stockCountLines)
      .where(eq(stockCountLines.stockCountId, id));
    return toDomain(row, lines);
  }

  async findMany(options?: FindManyStockCountsOptions): Promise<StockCount[]> {
    const query = db.select().from(stockCounts);
    if (options?.warehouseId) {
      query.where(eq(stockCounts.warehouseId, options.warehouseId));
    }
    if (options?.status) {
      query.where(eq(stockCounts.status, options.status));
    }
    const rows = await query.orderBy(desc(stockCounts.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(stockCountLines)
          .where(eq(stockCountLines.stockCountId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(stockCount: StockCount): Promise<void> {
    await db
      .insert(stockCounts)
      .values({
        id: stockCount.id,
        countNumber: stockCount.countNumber,
        warehouseId: stockCount.warehouseId,
        assignedUser: stockCount.assignedUser ?? null,
        status: stockCount.status,
        postedAt: stockCount.postedAt ?? null,
      })
      .onConflictDoUpdate({
        target: stockCounts.id,
        set: {
          assignedUser: stockCount.assignedUser ?? null,
          status: stockCount.status,
          postedAt: stockCount.postedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of stockCount.lines) {
      await db
        .insert(stockCountLines)
        .values({
          id: line.id,
          stockCountId: stockCount.id,
          componentId: line.componentId,
          binId: line.binId,
          expectedQuantity: line.expectedQuantity.toString(),
          countedQuantity: line.countedQuantity.toString(),
          variance: line.variance.toString(),
          notes: line.notes ?? null,
        })
        .onConflictDoUpdate({
          target: stockCountLines.id,
          set: {
            expectedQuantity: line.expectedQuantity.toString(),
            countedQuantity: line.countedQuantity.toString(),
            variance: line.variance.toString(),
            notes: line.notes ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextCountNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(stockCounts);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `SC-${year}-${num}`;
  }
}
