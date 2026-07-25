import { db } from '@ananya/database';
import { quotations, quotationLines } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  QuotationRecord,
  QuotationLineRecord,
} from '@ananya/database/schema';
import {
  Quotation,
  type QuotationRepository,
  type QuotationStatus,
  type FindManyQuotationsOptions,
} from '@ananya/sales';

function toDomain(
  row: QuotationRecord,
  lines: QuotationLineRecord[] = [],
): Quotation {
  return Quotation.rehydrate({
    id: row.id,
    quoteNumber: row.quoteNumber,
    customerId: row.customerId,
    currency: row.currency,
    validUntil: row.validUntil,
    status: row.status as QuotationStatus,
    lines: lines.map((l) => ({
      id: l.id,
      quotationId: l.quotationId,
      componentId: l.componentId,
      quantity: parseFloat(l.quantity),
      unitPrice: parseFloat(l.unitPrice),
      discount: parseFloat(l.discount),
      totalPrice: parseFloat(l.totalPrice),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleQuotationRepository implements QuotationRepository {
  async findById(id: string): Promise<Quotation | null> {
    const [row] = await db
      .select()
      .from(quotations)
      .where(eq(quotations.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, id));
    return toDomain(row, lines);
  }

  async findByQuoteNumber(quoteNumber: string): Promise<Quotation | null> {
    const [row] = await db
      .select()
      .from(quotations)
      .where(eq(quotations.quoteNumber, quoteNumber.toUpperCase()))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, row.id));
    return toDomain(row, lines);
  }

  async findMany(options?: FindManyQuotationsOptions): Promise<Quotation[]> {
    const query = db.select().from(quotations);
    if (options?.customerId) {
      query.where(eq(quotations.customerId, options.customerId));
    }
    if (options?.status) {
      query.where(eq(quotations.status, options.status));
    }
    const rows = await query.orderBy(desc(quotations.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(quotationLines)
          .where(eq(quotationLines.quotationId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(quotation: Quotation): Promise<void> {
    await db
      .insert(quotations)
      .values({
        id: quotation.id,
        quoteNumber: quotation.quoteNumber,
        customerId: quotation.customerId,
        currency: quotation.currency,
        validUntil: quotation.validUntil,
        status: quotation.status,
      })
      .onConflictDoUpdate({
        target: quotations.id,
        set: {
          validUntil: quotation.validUntil,
          status: quotation.status,
          updatedAt: new Date(),
        },
      });

    for (const line of quotation.lines) {
      await db
        .insert(quotationLines)
        .values({
          id: line.id,
          quotationId: quotation.id,
          componentId: line.componentId,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          discount: line.discount.toString(),
          totalPrice: line.totalPrice.toString(),
        })
        .onConflictDoUpdate({
          target: quotationLines.id,
          set: {
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discount: line.discount.toString(),
            totalPrice: line.totalPrice.toString(),
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextQuoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(quotations);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `QUO-${year}-${num}`;
  }
}
