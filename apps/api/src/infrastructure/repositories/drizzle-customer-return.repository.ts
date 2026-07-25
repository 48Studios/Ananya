import { db } from '@ananya/database';
import { customerReturns, customerReturnLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  CustomerReturnRecord,
  CustomerReturnLineRecord,
} from '@ananya/database/schema';
import {
  CustomerReturn,
  type CustomerReturnRepository,
  type ReturnStatus,
  type ReturnReason,
  type ReturnDisposition,
  type FindManyCustomerReturnsOptions,
} from '@ananya/sales';

function toDomain(
  row: CustomerReturnRecord,
  lines: CustomerReturnLineRecord[] = [],
): CustomerReturn {
  return CustomerReturn.rehydrate({
    id: row.id,
    returnNumber: row.returnNumber,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId,
    status: row.status as ReturnStatus,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      customerReturnId: l.customerReturnId,
      salesOrderLineId: l.salesOrderLineId,
      componentId: l.componentId,
      quantity: parseFloat(l.quantity),
      reason: l.reason as ReturnReason,
      disposition: l.disposition as ReturnDisposition | undefined,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCustomerReturnRepository implements CustomerReturnRepository {
  async findById(id: string): Promise<CustomerReturn | null> {
    const [row] = await db
      .select()
      .from(customerReturns)
      .where(eq(customerReturns.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(customerReturnLines)
      .where(eq(customerReturnLines.customerReturnId, id));
    return toDomain(row, lines);
  }

  async findByReturnNumber(
    returnNumber: string,
  ): Promise<CustomerReturn | null> {
    const [row] = await db
      .select()
      .from(customerReturns)
      .where(eq(customerReturns.returnNumber, returnNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(customerReturnLines)
      .where(eq(customerReturnLines.customerReturnId, row.id));
    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyCustomerReturnsOptions,
  ): Promise<CustomerReturn[]> {
    const query = db.select().from(customerReturns);
    if (options?.customerId) {
      query.where(eq(customerReturns.customerId, options.customerId));
    }
    if (options?.salesOrderId) {
      query.where(eq(customerReturns.salesOrderId, options.salesOrderId));
    }
    if (options?.status) {
      query.where(eq(customerReturns.status, options.status));
    }
    const rows = await query.orderBy(desc(customerReturns.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(customerReturnLines)
          .where(eq(customerReturnLines.customerReturnId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(customerReturn: CustomerReturn): Promise<void> {
    await db
      .insert(customerReturns)
      .values({
        id: customerReturn.id,
        returnNumber: customerReturn.returnNumber,
        customerId: customerReturn.customerId,
        salesOrderId: customerReturn.salesOrderId,
        status: customerReturn.status,
        notes: customerReturn.notes ?? null,
      })
      .onConflictDoUpdate({
        target: customerReturns.id,
        set: {
          status: customerReturn.status,
          notes: customerReturn.notes ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of customerReturn.lines) {
      await db
        .insert(customerReturnLines)
        .values({
          id: line.id,
          customerReturnId: customerReturn.id,
          salesOrderLineId: line.salesOrderLineId,
          componentId: line.componentId,
          quantity: line.quantity.toString(),
          reason: line.reason,
          disposition: line.disposition ?? null,
        })
        .onConflictDoUpdate({
          target: customerReturnLines.id,
          set: {
            quantity: line.quantity.toString(),
            reason: line.reason,
            disposition: line.disposition ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextReturnNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(customerReturns);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `RMA-${year}-${num}`;
  }
}
