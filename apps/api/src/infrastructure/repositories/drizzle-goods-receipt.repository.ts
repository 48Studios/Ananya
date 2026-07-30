import { db } from '@ananya/database';
import { goodsReceipts, goodsReceiptLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  GoodsReceiptRecord,
  GoodsReceiptLineRecord,
} from '@ananya/database/schema';
import {
  GoodsReceipt,
  GoodsReceiptRepository,
  GoodsReceiptStatus,
  FindManyGoodsReceiptsOptions,
} from '@ananya/procurement';

function toDomain(
  row: GoodsReceiptRecord,
  lines: GoodsReceiptLineRecord[] = [],
): GoodsReceipt {
  return GoodsReceipt.rehydrate({
    id: row.id,
    grNumber: row.grNumber,
    purchaseOrderId: row.purchaseOrderId,
    supplierId: row.supplierId,
    status: row.status as GoodsReceiptStatus,
    packingSlipNumber: row.packingSlipNumber,
    receivedAt: row.receivedAt,
    lines: lines.map((l) => ({
      id: l.id,
      goodsReceiptId: l.goodsReceiptId,
      poLineId: l.poLineId,
      componentId: l.componentId,
      locationId: l.locationId,
      quantityReceived: l.quantityReceived,
      quantityRejected: l.quantityRejected,
      batchNumber: l.batchNumber,
      expiryDate: l.expiryDate,
      serialNumbers: l.serialNumbers ?? [],
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleGoodsReceiptRepository implements GoodsReceiptRepository {
  async findById(id: string): Promise<GoodsReceipt | null> {
    const [row] = await db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.goodsReceiptId, id));

    return toDomain(row, lines);
  }

  async findByGrNumber(grNumber: string): Promise<GoodsReceipt | null> {
    const [row] = await db
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.grNumber, grNumber.toUpperCase()))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.goodsReceiptId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyGoodsReceiptsOptions,
  ): Promise<GoodsReceipt[]> {
    const query = db.select().from(goodsReceipts);

    if (options?.purchaseOrderId) {
      query.where(eq(goodsReceipts.purchaseOrderId, options.purchaseOrderId));
    }
    if (options?.supplierId) {
      query.where(eq(goodsReceipts.supplierId, options.supplierId));
    }

    const rows = await query.orderBy(desc(goodsReceipts.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(goodsReceiptLines)
          .where(eq(goodsReceiptLines.goodsReceiptId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(gr: GoodsReceipt): Promise<void> {
    await db
      .insert(goodsReceipts)
      .values({
        id: gr.id,
        grNumber: gr.grNumber,
        purchaseOrderId: gr.purchaseOrderId,
        supplierId: gr.supplierId,
        status: gr.status,
        packingSlipNumber: gr.packingSlipNumber ?? null,
        receivedAt: gr.receivedAt,
      })
      .onConflictDoUpdate({
        target: goodsReceipts.id,
        set: {
          status: gr.status,
          packingSlipNumber: gr.packingSlipNumber ?? null,
          receivedAt: gr.receivedAt,
          updatedAt: new Date(),
        },
      });

    for (const line of gr.lines) {
      await db
        .insert(goodsReceiptLines)
        .values({
          id: line.id,
          goodsReceiptId: gr.id,
          poLineId: line.poLineId,
          componentId: line.componentId,
          locationId: line.locationId,
          quantityReceived: line.quantityReceived,
          quantityRejected: line.quantityRejected,
          batchNumber: line.batchNumber ?? null,
          expiryDate: line.expiryDate ?? null,
          serialNumbers: line.serialNumbers,
        })
        .onConflictDoUpdate({
          target: goodsReceiptLines.id,
          set: {
            quantityReceived: line.quantityReceived,
            quantityRejected: line.quantityRejected,
            batchNumber: line.batchNumber ?? null,
            expiryDate: line.expiryDate ?? null,
            serialNumbers: line.serialNumbers,
            updatedAt: new Date(),
          },
        });
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(goodsReceipts).where(eq(goodsReceipts.id, id));
  }

  async generateNextGrNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(goodsReceipts);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `GR-${year}-${num}`;
  }
}
