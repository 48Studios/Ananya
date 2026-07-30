import { db } from '@ananya/database';
import { purchaseOrders, purchaseOrderLines } from '@ananya/database/schema';
import { eq, or, ilike, desc, count } from '@ananya/database/query';
import type {
  PurchaseOrderRecord,
  PurchaseOrderLineRecord,
} from '@ananya/database/schema';
import {
  PurchaseOrder,
  PurchaseOrderRepository,
  PurchaseOrderStatus,
  FindManyPurchaseOrdersOptions,
} from '@ananya/procurement';

function toDomain(
  row: PurchaseOrderRecord,
  lines: PurchaseOrderLineRecord[] = [],
): PurchaseOrder {
  return PurchaseOrder.rehydrate({
    id: row.id,
    poNumber: row.poNumber,
    supplierId: row.supplierId,
    status: row.status as PurchaseOrderStatus,
    currency: row.currency,
    subtotal: parseFloat(row.subtotal),
    taxTotal: parseFloat(row.taxTotal),
    grandTotal: parseFloat(row.grandTotal),
    notes: row.notes,
    issuedAt: row.issuedAt,
    expectedDeliveryDate: row.expectedDeliveryDate,
    lines: lines.map((l) => ({
      id: l.id,
      purchaseOrderId: l.purchaseOrderId,
      componentId: l.componentId,
      vendorPartNumber: l.vendorPartNumber,
      unitPrice: parseFloat(l.unitPrice),
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      taxRate: parseFloat(l.taxRate),
      lineTotal: parseFloat(l.lineTotal),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePurchaseOrderRepository implements PurchaseOrderRepository {
  async findById(id: string): Promise<PurchaseOrder | null> {
    const [row] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id));

    return toDomain(row, lines);
  }

  async findByPoNumber(poNumber: string): Promise<PurchaseOrder | null> {
    const [row] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.poNumber, poNumber.toUpperCase()))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyPurchaseOrdersOptions,
  ): Promise<PurchaseOrder[]> {
    const query = db.select().from(purchaseOrders);

    if (options?.supplierId) {
      query.where(eq(purchaseOrders.supplierId, options.supplierId));
    }
    if (options?.status) {
      query.where(eq(purchaseOrders.status, options.status));
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(or(ilike(purchaseOrders.poNumber, pattern)));
    }

    const rows = await query.orderBy(desc(purchaseOrders.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.purchaseOrderId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(po: PurchaseOrder): Promise<void> {
    await db
      .insert(purchaseOrders)
      .values({
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        status: po.status,
        currency: po.currency,
        subtotal: po.subtotal.toString(),
        taxTotal: po.taxTotal.toString(),
        grandTotal: po.grandTotal.toString(),
        notes: po.notes ?? null,
        issuedAt: po.issuedAt ?? null,
        expectedDeliveryDate: po.expectedDeliveryDate ?? null,
      })
      .onConflictDoUpdate({
        target: purchaseOrders.id,
        set: {
          status: po.status,
          subtotal: po.subtotal.toString(),
          taxTotal: po.taxTotal.toString(),
          grandTotal: po.grandTotal.toString(),
          notes: po.notes ?? null,
          issuedAt: po.issuedAt ?? null,
          expectedDeliveryDate: po.expectedDeliveryDate ?? null,
          updatedAt: new Date(),
        },
      });

    // Synchronize lines: delete existing and insert new
    await db
      .delete(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, po.id));

    for (const line of po.lines) {
      await db.insert(purchaseOrderLines).values({
        id: line.id,
        purchaseOrderId: po.id,
        componentId: line.componentId,
        vendorPartNumber: line.vendorPartNumber ?? null,
        unitPrice: line.unitPrice.toString(),
        quantityOrdered: line.quantityOrdered,
        quantityReceived: line.quantityReceived,
        taxRate: line.taxRate.toString(),
        lineTotal: line.lineTotal.toString(),
      });
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async generateNextPoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(purchaseOrders);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `PO-${year}-${num}`;
  }
}
