import { db } from '@ananya/database';
import { salesOrders, salesOrderLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  SalesOrderRecord,
  SalesOrderLineRecord,
} from '@ananya/database/schema';
import {
  SalesOrder,
  type SalesOrderRepository,
  type SalesOrderStatus,
  type FindManySalesOrdersOptions,
} from '@ananya/sales';

function toDomain(
  row: SalesOrderRecord,
  lines: SalesOrderLineRecord[] = [],
): SalesOrder {
  return SalesOrder.rehydrate({
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    orderDate: row.orderDate,
    requiredDate: row.requiredDate,
    status: row.status as SalesOrderStatus,
    quotationId: row.quotationId,
    lines: lines.map((l) => ({
      id: l.id,
      salesOrderId: l.salesOrderId,
      componentId: l.componentId,
      quantity: parseFloat(l.quantity),
      unitPrice: parseFloat(l.unitPrice),
      discount: parseFloat(l.discount),
      tax: parseFloat(l.tax),
      totalPrice: parseFloat(l.totalPrice),
      reservedQuantity: parseFloat(l.reservedQuantity),
      fulfilledQuantity: parseFloat(l.fulfilledQuantity),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleSalesOrderRepository implements SalesOrderRepository {
  async findById(id: string): Promise<SalesOrder | null> {
    const [row] = await db
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, id));
    return toDomain(row, lines);
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrder | null> {
    const [row] = await db
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.orderNumber, orderNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, row.id));
    return toDomain(row, lines);
  }

  async findMany(options?: FindManySalesOrdersOptions): Promise<SalesOrder[]> {
    const query = db.select().from(salesOrders);
    if (options?.customerId) {
      query.where(eq(salesOrders.customerId, options.customerId));
    }
    if (options?.status) {
      query.where(eq(salesOrders.status, options.status));
    }
    const rows = await query.orderBy(desc(salesOrders.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(salesOrderLines)
          .where(eq(salesOrderLines.salesOrderId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(salesOrder: SalesOrder): Promise<void> {
    await db
      .insert(salesOrders)
      .values({
        id: salesOrder.id,
        orderNumber: salesOrder.orderNumber,
        customerId: salesOrder.customerId,
        orderDate: salesOrder.orderDate,
        requiredDate: salesOrder.requiredDate ?? null,
        status: salesOrder.status,
        quotationId: salesOrder.quotationId ?? null,
      })
      .onConflictDoUpdate({
        target: salesOrders.id,
        set: {
          requiredDate: salesOrder.requiredDate ?? null,
          status: salesOrder.status,
          updatedAt: new Date(),
        },
      });

    for (const line of salesOrder.lines) {
      await db
        .insert(salesOrderLines)
        .values({
          id: line.id,
          salesOrderId: salesOrder.id,
          componentId: line.componentId,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          discount: line.discount.toString(),
          tax: line.tax.toString(),
          totalPrice: line.totalPrice.toString(),
          reservedQuantity: line.reservedQuantity.toString(),
          fulfilledQuantity: line.fulfilledQuantity.toString(),
        })
        .onConflictDoUpdate({
          target: salesOrderLines.id,
          set: {
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discount: line.discount.toString(),
            tax: line.tax.toString(),
            totalPrice: line.totalPrice.toString(),
            reservedQuantity: line.reservedQuantity.toString(),
            fulfilledQuantity: line.fulfilledQuantity.toString(),
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(salesOrders);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `SO-${year}-${num}`;
  }
}
