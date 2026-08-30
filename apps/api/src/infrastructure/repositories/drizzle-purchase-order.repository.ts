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
  const mappedLines = lines.map((l) => {
    const uPrice = parseFloat(l.unitPrice) || 0;
    const qOrdered = l.quantityOrdered || 0;
    const tRate = parseFloat(l.taxRate) || 0;
    const lTotal =
      parseFloat(l.lineTotal) || uPrice * qOrdered * (1 + tRate / 100);

    return {
      id: l.id,
      purchaseOrderId: l.purchaseOrderId,
      componentId: l.componentId,
      vendorPartNumber: l.vendorPartNumber,
      unitPrice: uPrice,
      quantityOrdered: qOrdered,
      quantityReceived: l.quantityReceived || 0,
      taxRate: tRate,
      lineTotal: lTotal,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  });

  let subtotal = parseFloat(row.subtotal) || 0;
  let taxTotal = parseFloat(row.taxTotal) || 0;
  let grandTotal = parseFloat(row.grandTotal) || 0;

  if (grandTotal === 0 && mappedLines.length > 0) {
    subtotal = 0;
    taxTotal = 0;
    for (const line of mappedLines) {
      const base = line.unitPrice * line.quantityOrdered;
      const tax = base * (line.taxRate / 100);
      subtotal += base;
      taxTotal += tax;
    }
    grandTotal = subtotal + taxTotal;
  }

  return PurchaseOrder.rehydrate({
    id: row.id,
    poNumber: row.poNumber,
    supplierId: row.supplierId,
    status: row.status as PurchaseOrderStatus,
    currency: row.currency,
    subtotal,
    taxTotal,
    grandTotal,
    notes: row.notes,
    issuedAt: row.issuedAt,
    expectedDeliveryDate: row.expectedDeliveryDate,
    trackingNumber: row.trackingNumber,
    carrier: row.carrier,
    shippingProvider: row.shippingProvider,
    trackingUrl: row.trackingUrl,
    lines: mappedLines,
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
        trackingNumber: po.trackingNumber ?? null,
        carrier: po.carrier ?? null,
        shippingProvider: po.shippingProvider ?? null,
        trackingUrl: po.trackingUrl ?? null,
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
          trackingNumber: po.trackingNumber ?? null,
          carrier: po.carrier ?? null,
          shippingProvider: po.shippingProvider ?? null,
          trackingUrl: po.trackingUrl ?? null,
          updatedAt: new Date(),
        },
      });

    // Safely upsert lines
    for (const line of po.lines) {
      await db
        .insert(purchaseOrderLines)
        .values({
          id: line.id,
          purchaseOrderId: po.id,
          componentId: line.componentId,
          vendorPartNumber: line.vendorPartNumber ?? null,
          unitPrice: line.unitPrice.toString(),
          quantityOrdered: line.quantityOrdered,
          quantityReceived: line.quantityReceived,
          taxRate: line.taxRate.toString(),
          lineTotal: line.lineTotal.toString(),
        })
        .onConflictDoUpdate({
          target: purchaseOrderLines.id,
          set: {
            componentId: line.componentId,
            vendorPartNumber: line.vendorPartNumber ?? null,
            unitPrice: line.unitPrice.toString(),
            quantityOrdered: line.quantityOrdered,
            quantityReceived: line.quantityReceived,
            taxRate: line.taxRate.toString(),
            lineTotal: line.lineTotal.toString(),
            updatedAt: new Date(),
          },
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
