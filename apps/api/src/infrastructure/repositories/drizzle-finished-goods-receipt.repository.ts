import { db } from '@ananya/database';
import {
  finishedGoodsReceipts,
  finishedGoodsReceiptLines,
} from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  FinishedGoodsReceiptRecord,
  FinishedGoodsReceiptLineRecord,
} from '@ananya/database/schema';
import {
  FinishedGoodsReceipt,
  type FinishedGoodsReceiptRepository,
  type FgrStatus,
  type FindManyFgrsOptions,
} from '@ananya/manufacturing';

function toDomain(
  row: FinishedGoodsReceiptRecord,
  lines: FinishedGoodsReceiptLineRecord[] = [],
): FinishedGoodsReceipt {
  return FinishedGoodsReceipt.rehydrate({
    id: row.id,
    fgrNumber: row.fgrNumber,
    productionOrderId: row.productionOrderId,
    status: row.status as FgrStatus,
    postedAt: row.postedAt,
    lines: lines.map((l) => ({
      id: l.id,
      fgrId: l.fgrId,
      componentId: l.componentId,
      locationId: l.locationId,
      quantityProduced: l.quantityProduced,
      quantityScrapped: l.quantityScrapped,
      batchNumber: l.batchNumber,
      serialNumbers: l.serialNumbers,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleFinishedGoodsReceiptRepository implements FinishedGoodsReceiptRepository {
  async findById(id: string): Promise<FinishedGoodsReceipt | null> {
    const [row] = await db
      .select()
      .from(finishedGoodsReceipts)
      .where(eq(finishedGoodsReceipts.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(finishedGoodsReceiptLines)
      .where(eq(finishedGoodsReceiptLines.fgrId, id));
    return toDomain(row, lines);
  }

  async findByProductionOrderId(
    productionOrderId: string,
  ): Promise<FinishedGoodsReceipt[]> {
    const rows = await db
      .select()
      .from(finishedGoodsReceipts)
      .where(eq(finishedGoodsReceipts.productionOrderId, productionOrderId))
      .orderBy(desc(finishedGoodsReceipts.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(finishedGoodsReceiptLines)
          .where(eq(finishedGoodsReceiptLines.fgrId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async findMany(
    options?: FindManyFgrsOptions,
  ): Promise<FinishedGoodsReceipt[]> {
    const query = db.select().from(finishedGoodsReceipts);
    if (options?.productionOrderId) {
      query.where(
        eq(finishedGoodsReceipts.productionOrderId, options.productionOrderId),
      );
    }
    const rows = await query.orderBy(desc(finishedGoodsReceipts.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(finishedGoodsReceiptLines)
          .where(eq(finishedGoodsReceiptLines.fgrId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(fgr: FinishedGoodsReceipt): Promise<void> {
    await db
      .insert(finishedGoodsReceipts)
      .values({
        id: fgr.id,
        fgrNumber: fgr.fgrNumber,
        productionOrderId: fgr.productionOrderId,
        status: fgr.status,
        postedAt: fgr.postedAt ?? null,
      })
      .onConflictDoUpdate({
        target: finishedGoodsReceipts.id,
        set: {
          status: fgr.status,
          postedAt: fgr.postedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of fgr.lines) {
      await db
        .insert(finishedGoodsReceiptLines)
        .values({
          id: line.id,
          fgrId: fgr.id,
          componentId: line.componentId,
          locationId: line.locationId,
          quantityProduced: line.quantityProduced,
          quantityScrapped: line.quantityScrapped,
          batchNumber: line.batchNumber ?? null,
          serialNumbers: line.serialNumbers ?? null,
        })
        .onConflictDoUpdate({
          target: finishedGoodsReceiptLines.id,
          set: {
            quantityProduced: line.quantityProduced,
            quantityScrapped: line.quantityScrapped,
            batchNumber: line.batchNumber ?? null,
            serialNumbers: line.serialNumbers ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextFgrNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(finishedGoodsReceipts);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `FGR-${year}-${num}`;
  }
}
