import { db } from '@ananya/database';
import { receivableInvoices } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type { ReceivableInvoiceRecord } from '@ananya/database/schema';
import {
  ReceivableInvoice,
  type ReceivableInvoiceRepository,
  type InvoiceStatus,
  type FindManyReceivablesOptions,
} from '@ananya/finance';

function toDomain(row: ReceivableInvoiceRecord): ReceivableInvoice {
  return ReceivableInvoice.rehydrate({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    salesOrderId: row.salesOrderId,
    dueDate: row.dueDate,
    amount: parseFloat(row.amount),
    balance: parseFloat(row.balance),
    status: row.status as InvoiceStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleReceivableInvoiceRepository implements ReceivableInvoiceRepository {
  async findById(id: string): Promise<ReceivableInvoice | null> {
    const [row] = await db
      .select()
      .from(receivableInvoices)
      .where(eq(receivableInvoices.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(invoiceNumber: string): Promise<ReceivableInvoice | null> {
    const [row] = await db
      .select()
      .from(receivableInvoices)
      .where(eq(receivableInvoices.invoiceNumber, invoiceNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyReceivablesOptions,
  ): Promise<ReceivableInvoice[]> {
    const query = db.select().from(receivableInvoices);
    if (options?.customerId) {
      query.where(eq(receivableInvoices.customerId, options.customerId));
    }
    if (options?.salesOrderId) {
      query.where(eq(receivableInvoices.salesOrderId, options.salesOrderId));
    }
    if (options?.status) {
      query.where(eq(receivableInvoices.status, options.status));
    }
    const rows = await query.orderBy(desc(receivableInvoices.createdAt));
    return rows.map(toDomain);
  }

  async save(invoice: ReceivableInvoice): Promise<void> {
    await db
      .insert(receivableInvoices)
      .values({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        salesOrderId: invoice.salesOrderId,
        dueDate: invoice.dueDate,
        amount: invoice.amount.toString(),
        balance: invoice.balance.toString(),
        status: invoice.status,
      })
      .onConflictDoUpdate({
        target: receivableInvoices.id,
        set: {
          dueDate: invoice.dueDate,
          balance: invoice.balance.toString(),
          status: invoice.status,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(receivableInvoices);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `AR-${year}-${num}`;
  }
}
