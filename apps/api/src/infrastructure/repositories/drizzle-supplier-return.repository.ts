import { db } from '@ananya/database';
import { supplierReturns, supplierReturnLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  SupplierReturnRecord,
  SupplierReturnLineRecord,
} from '@ananya/database/schema';
import {
  SupplierReturn,
  SupplierReturnRepository,
  SupplierReturnStatus,
  FindManySupplierReturnsOptions,
} from '@ananya/procurement';

function toDomain(
  row: SupplierReturnRecord,
  lines: SupplierReturnLineRecord[] = [],
): SupplierReturn {
  return SupplierReturn.rehydrate({
    id: row.id,
    returnNumber: row.returnNumber,
    supplierId: row.supplierId,
    purchaseOrderId: row.purchaseOrderId,
    rmaNumber: row.rmaNumber,
    status: row.status as SupplierReturnStatus,
    totalAmount: parseFloat(row.totalAmount),
    dispatchedAt: row.dispatchedAt,
    lines: lines.map((l) => ({
      id: l.id,
      supplierReturnId: l.supplierReturnId,
      componentId: l.componentId,
      locationId: l.locationId,
      quantityReturned: l.quantityReturned,
      unitPrice: parseFloat(l.unitPrice),
      reason: l.reason,
      batchNumber: l.batchNumber,
      serialNumbers: l.serialNumbers ?? [],
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleSupplierReturnRepository implements SupplierReturnRepository {
  async findById(id: string): Promise<SupplierReturn | null> {
    const [row] = await db
      .select()
      .from(supplierReturns)
      .where(eq(supplierReturns.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, id));

    return toDomain(row, lines);
  }

  async findByReturnNumber(
    returnNumber: string,
  ): Promise<SupplierReturn | null> {
    const [row] = await db
      .select()
      .from(supplierReturns)
      .where(eq(supplierReturns.returnNumber, returnNumber.toUpperCase()))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManySupplierReturnsOptions,
  ): Promise<SupplierReturn[]> {
    const query = db.select().from(supplierReturns);

    if (options?.supplierId) {
      query.where(eq(supplierReturns.supplierId, options.supplierId));
    }

    const rows = await query.orderBy(desc(supplierReturns.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(supplierReturnLines)
          .where(eq(supplierReturnLines.supplierReturnId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(returnDoc: SupplierReturn): Promise<void> {
    await db
      .insert(supplierReturns)
      .values({
        id: returnDoc.id,
        returnNumber: returnDoc.returnNumber,
        supplierId: returnDoc.supplierId,
        purchaseOrderId: returnDoc.purchaseOrderId ?? null,
        rmaNumber: returnDoc.rmaNumber ?? null,
        status: returnDoc.status,
        totalAmount: returnDoc.totalAmount.toString(),
        dispatchedAt: returnDoc.dispatchedAt ?? null,
      })
      .onConflictDoUpdate({
        target: supplierReturns.id,
        set: {
          rmaNumber: returnDoc.rmaNumber ?? null,
          status: returnDoc.status,
          totalAmount: returnDoc.totalAmount.toString(),
          dispatchedAt: returnDoc.dispatchedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of returnDoc.lines) {
      await db
        .insert(supplierReturnLines)
        .values({
          id: line.id,
          supplierReturnId: returnDoc.id,
          componentId: line.componentId,
          locationId: line.locationId,
          quantityReturned: line.quantityReturned,
          unitPrice: line.unitPrice.toString(),
          reason: line.reason,
          batchNumber: line.batchNumber ?? null,
          serialNumbers: line.serialNumbers,
        })
        .onConflictDoUpdate({
          target: supplierReturnLines.id,
          set: {
            quantityReturned: line.quantityReturned,
            unitPrice: line.unitPrice.toString(),
            reason: line.reason,
            batchNumber: line.batchNumber ?? null,
            serialNumbers: line.serialNumbers,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextReturnNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(supplierReturns);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `SR-${year}-${num}`;
  }

  async delete(id: string): Promise<void> {
    await db
      .delete(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, id));
    await db.delete(supplierReturns).where(eq(supplierReturns.id, id));
  }

  async deleteLine(lineId: string): Promise<void> {
    await db
      .delete(supplierReturnLines)
      .where(eq(supplierReturnLines.id, lineId));
  }
}
