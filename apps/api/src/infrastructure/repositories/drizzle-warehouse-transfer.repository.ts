import { db } from '@ananya/database';
import {
  warehouseTransfers,
  warehouseTransferLines,
} from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  WarehouseTransferRecord,
  WarehouseTransferLineRecord,
} from '@ananya/database/schema';
import {
  WarehouseTransfer,
  type WarehouseTransferRepository,
  type TransferStatus,
  type FindManyTransfersOptions,
} from '@ananya/warehouse';

function toDomain(
  row: WarehouseTransferRecord,
  lines: WarehouseTransferLineRecord[] = [],
): WarehouseTransfer {
  return WarehouseTransfer.rehydrate({
    id: row.id,
    transferNumber: row.transferNumber,
    sourceBinId: row.sourceBinId,
    destinationBinId: row.destinationBinId,
    status: row.status as TransferStatus,
    completedAt: row.completedAt,
    lines: lines.map((l) => ({
      id: l.id,
      transferId: l.transferId,
      componentId: l.componentId,
      quantity: parseFloat(l.quantity),
      batchNumber: l.batchNumber,
      serialNumbers: l.serialNumbers,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWarehouseTransferRepository implements WarehouseTransferRepository {
  async findById(id: string): Promise<WarehouseTransfer | null> {
    const [row] = await db
      .select()
      .from(warehouseTransfers)
      .where(eq(warehouseTransfers.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(warehouseTransferLines)
      .where(eq(warehouseTransferLines.transferId, id));
    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyTransfersOptions,
  ): Promise<WarehouseTransfer[]> {
    const query = db.select().from(warehouseTransfers);
    if (options?.sourceBinId) {
      query.where(eq(warehouseTransfers.sourceBinId, options.sourceBinId));
    }
    if (options?.destinationBinId) {
      query.where(
        eq(warehouseTransfers.destinationBinId, options.destinationBinId),
      );
    }
    if (options?.status) {
      query.where(eq(warehouseTransfers.status, options.status));
    }
    const rows = await query.orderBy(desc(warehouseTransfers.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(warehouseTransferLines)
          .where(eq(warehouseTransferLines.transferId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(transfer: WarehouseTransfer): Promise<void> {
    await db
      .insert(warehouseTransfers)
      .values({
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        sourceBinId: transfer.sourceBinId,
        destinationBinId: transfer.destinationBinId,
        status: transfer.status,
        completedAt: transfer.completedAt ?? null,
      })
      .onConflictDoUpdate({
        target: warehouseTransfers.id,
        set: {
          status: transfer.status,
          completedAt: transfer.completedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of transfer.lines) {
      await db
        .insert(warehouseTransferLines)
        .values({
          id: line.id,
          transferId: transfer.id,
          componentId: line.componentId,
          quantity: line.quantity.toString(),
          batchNumber: line.batchNumber ?? null,
          serialNumbers: line.serialNumbers ?? null,
        })
        .onConflictDoUpdate({
          target: warehouseTransferLines.id,
          set: {
            quantity: line.quantity.toString(),
            batchNumber: line.batchNumber ?? null,
            serialNumbers: line.serialNumbers ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextTransferNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(warehouseTransfers);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `WT-${year}-${num}`;
  }
}
