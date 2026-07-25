import { db } from '@ananya/database';
import { payableInvoices } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type { PayableInvoiceRecord } from '@ananya/database/schema';
import {
  PayableInvoice,
  type PayableInvoiceRepository,
  type PayableStatus,
  type FindManyPayablesOptions,
} from '@ananya/finance';

function toDomain(row: PayableInvoiceRecord): PayableInvoice {
  return PayableInvoice.rehydrate({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    supplierId: row.supplierId,
    purchaseInvoiceId: row.purchaseInvoiceId,
    dueDate: row.dueDate,
    amount: parseFloat(row.amount),
    balance: parseFloat(row.balance),
    status: row.status as PayableStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePayableInvoiceRepository implements PayableInvoiceRepository {
  async findById(id: string): Promise<PayableInvoice | null> {
    const [row] = await db
      .select()
      .from(payableInvoices)
      .where(eq(payableInvoices.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(invoiceNumber: string): Promise<PayableInvoice | null> {
    const [row] = await db
      .select()
      .from(payableInvoices)
      .where(eq(payableInvoices.invoiceNumber, invoiceNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyPayablesOptions): Promise<PayableInvoice[]> {
    const query = db.select().from(payableInvoices);
    if (options?.supplierId) {
      query.where(eq(payableInvoices.supplierId, options.supplierId));
    }
    if (options?.purchaseInvoiceId) {
      query.where(
        eq(payableInvoices.purchaseInvoiceId, options.purchaseInvoiceId),
      );
    }
    if (options?.status) {
      query.where(eq(payableInvoices.status, options.status));
    }
    const rows = await query.orderBy(desc(payableInvoices.createdAt));
    return rows.map(toDomain);
  }

  async save(invoice: PayableInvoice): Promise<void> {
    await db
      .insert(payableInvoices)
      .values({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        purchaseInvoiceId: invoice.purchaseInvoiceId,
        dueDate: invoice.dueDate,
        amount: invoice.amount.toString(),
        balance: invoice.balance.toString(),
        status: invoice.status,
      })
      .onConflictDoUpdate({
        target: payableInvoices.id,
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
    const [result] = await db.select({ count: count() }).from(payableInvoices);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `AP-${year}-${num}`;
  }
}
