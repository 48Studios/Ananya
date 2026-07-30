import { db } from '@ananya/database';
import {
  warehouseTransfers,
  warehouseTransferLines,
} from '@ananya/database/schema';
import { eq, desc, count, ilike, or } from '@ananya/database/query';
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
    sourceLocationId: row.sourceLocationId,
    destinationLocationId: row.destinationLocationId,
    status: row.status as TransferStatus,
    requestedDate: row.requestedDate,
    dispatchedAt: row.dispatchedAt,
    receivedAt: row.receivedAt,
    requestedBy: row.requestedBy,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      transferId: l.transferId,
      componentId: l.componentId,
      quantity: parseFloat(l.quantity),
      unitOfMeasure: l.unitOfMeasure,
      notes: l.notes,
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

  async findByTransferNumber(
    transferNumber: string,
  ): Promise<WarehouseTransfer | null> {
    const [row] = await db
      .select()
      .from(warehouseTransfers)
      .where(
        eq(warehouseTransfers.transferNumber, transferNumber.toUpperCase()),
      )
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(warehouseTransferLines)
      .where(eq(warehouseTransferLines.transferId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyTransfersOptions,
  ): Promise<WarehouseTransfer[]> {
    const query = db.select().from(warehouseTransfers);

    if (options?.sourceLocationId) {
      query.where(
        eq(warehouseTransfers.sourceLocationId, options.sourceLocationId),
      );
    }
    if (options?.destinationLocationId) {
      query.where(
        eq(
          warehouseTransfers.destinationLocationId,
          options.destinationLocationId,
        ),
      );
    }
    if (options?.status) {
      query.where(eq(warehouseTransfers.status, options.status));
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(
          ilike(warehouseTransfers.transferNumber, pattern),
          ilike(warehouseTransfers.notes, pattern),
        ),
      );
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
        sourceLocationId: transfer.sourceLocationId,
        destinationLocationId: transfer.destinationLocationId,
        status: transfer.status,
        requestedDate: transfer.requestedDate ?? null,
        dispatchedAt: transfer.dispatchedAt ?? null,
        receivedAt: transfer.receivedAt ?? null,
        requestedBy: transfer.requestedBy ?? null,
        notes: transfer.notes ?? null,
      })
      .onConflictDoUpdate({
        target: warehouseTransfers.id,
        set: {
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          status: transfer.status,
          requestedDate: transfer.requestedDate ?? null,
          dispatchedAt: transfer.dispatchedAt ?? null,
          receivedAt: transfer.receivedAt ?? null,
          requestedBy: transfer.requestedBy ?? null,
          notes: transfer.notes ?? null,
          updatedAt: new Date(),
        },
      });

    // Replace lines
    await db
      .delete(warehouseTransferLines)
      .where(eq(warehouseTransferLines.transferId, transfer.id));

    for (const line of transfer.lines) {
      await db.insert(warehouseTransferLines).values({
        id: line.id,
        transferId: transfer.id,
        componentId: line.componentId,
        quantity: line.quantity.toString(),
        unitOfMeasure: line.unitOfMeasure || 'pcs',
        notes: line.notes ?? null,
      });
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(warehouseTransfers).where(eq(warehouseTransfers.id, id));
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
