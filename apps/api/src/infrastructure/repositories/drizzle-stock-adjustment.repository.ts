import { db } from '@ananya/database';
import {
  stockAdjustments,
  stockAdjustmentLines,
} from '@ananya/database/schema';
import { eq, desc, count, ilike, or } from '@ananya/database/query';
import type {
  StockAdjustmentRecord,
  StockAdjustmentLineRecord,
} from '@ananya/database/schema';
import {
  StockAdjustment,
  StockAdjustmentRepository,
  StockAdjustmentStatus,
  FindManyStockAdjustmentsOptions,
} from '@ananya/inventory';

function toDomain(
  row: StockAdjustmentRecord,
  lines: StockAdjustmentLineRecord[] = [],
): StockAdjustment {
  return StockAdjustment.rehydrate({
    id: row.id,
    adjustmentNumber: row.adjustmentNumber,
    locationId: row.locationId,
    status: row.status as StockAdjustmentStatus,
    reason: row.reason,
    notes: row.notes,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    lines: lines.map((l) => ({
      id: l.id,
      stockAdjustmentId: l.stockAdjustmentId,
      componentId: l.componentId,
      currentQuantity: l.currentQuantity,
      countedQuantity: l.countedQuantity,
      difference: l.difference,
      unitOfMeasure: l.unitOfMeasure,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleStockAdjustmentRepository implements StockAdjustmentRepository {
  async findById(id: string): Promise<StockAdjustment | null> {
    const [row] = await db
      .select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(stockAdjustmentLines)
      .where(eq(stockAdjustmentLines.stockAdjustmentId, id));

    return toDomain(row, lines);
  }

  async findByAdjustmentNumber(
    adjustmentNumber: string,
  ): Promise<StockAdjustment | null> {
    const [row] = await db
      .select()
      .from(stockAdjustments)
      .where(
        eq(stockAdjustments.adjustmentNumber, adjustmentNumber.toUpperCase()),
      )
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(stockAdjustmentLines)
      .where(eq(stockAdjustmentLines.stockAdjustmentId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyStockAdjustmentsOptions,
  ): Promise<StockAdjustment[]> {
    const query = db.select().from(stockAdjustments);

    if (options?.locationId) {
      query.where(eq(stockAdjustments.locationId, options.locationId));
    }
    if (options?.status) {
      query.where(eq(stockAdjustments.status, options.status));
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(
          ilike(stockAdjustments.adjustmentNumber, pattern),
          ilike(stockAdjustments.reason, pattern),
        ),
      );
    }

    const rows = await query.orderBy(desc(stockAdjustments.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(stockAdjustmentLines)
          .where(eq(stockAdjustmentLines.stockAdjustmentId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(adj: StockAdjustment): Promise<void> {
    await db
      .insert(stockAdjustments)
      .values({
        id: adj.id,
        adjustmentNumber: adj.adjustmentNumber,
        locationId: adj.locationId,
        status: adj.status,
        reason: adj.reason,
        notes: adj.notes ?? null,
        createdBy: adj.createdBy,
        approvedBy: adj.approvedBy ?? null,
        approvedAt: adj.approvedAt ?? null,
      })
      .onConflictDoUpdate({
        target: stockAdjustments.id,
        set: {
          status: adj.status,
          notes: adj.notes ?? null,
          approvedBy: adj.approvedBy ?? null,
          approvedAt: adj.approvedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of adj.lines) {
      await db
        .insert(stockAdjustmentLines)
        .values({
          id: line.id,
          stockAdjustmentId: adj.id,
          componentId: line.componentId,
          currentQuantity: line.currentQuantity,
          countedQuantity: line.countedQuantity,
          difference: line.difference,
          unitOfMeasure: line.unitOfMeasure,
        })
        .onConflictDoUpdate({
          target: stockAdjustmentLines.id,
          set: {
            currentQuantity: line.currentQuantity,
            countedQuantity: line.countedQuantity,
            difference: line.difference,
            unitOfMeasure: line.unitOfMeasure,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextAdjustmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(stockAdjustments);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `ADJ-${year}-${num}`;
  }
}
