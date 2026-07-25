import { db } from '@ananya/database';
import { payments } from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type { PaymentRecord } from '@ananya/database/schema';
import {
  Payment,
  type PaymentRepository,
  type PaymentType,
  type PaymentMethod,
  type PaymentStatus,
  type FindManyPaymentsOptions,
} from '@ananya/finance';

function toDomain(row: PaymentRecord): Payment {
  return Payment.rehydrate({
    id: row.id,
    paymentNumber: row.paymentNumber,
    paymentType: row.paymentType as PaymentType,
    paymentMethod: row.paymentMethod as PaymentMethod,
    amount: parseFloat(row.amount),
    reference: row.reference ?? undefined,
    bankAccountId: row.bankAccountId ?? undefined,
    status: row.status as PaymentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePaymentRepository implements PaymentRepository {
  async findById(id: string): Promise<Payment | null> {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(paymentNumber: string): Promise<Payment | null> {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.paymentNumber, paymentNumber.toUpperCase()))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(options?: FindManyPaymentsOptions): Promise<Payment[]> {
    const query = db.select().from(payments);
    if (options?.paymentType) {
      query.where(eq(payments.paymentType, options.paymentType));
    }
    if (options?.bankAccountId) {
      query.where(eq(payments.bankAccountId, options.bankAccountId));
    }
    if (options?.status) {
      query.where(eq(payments.status, options.status));
    }
    const rows = await query.orderBy(desc(payments.createdAt));
    return rows.map(toDomain);
  }

  async save(payment: Payment): Promise<void> {
    await db
      .insert(payments)
      .values({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentType: payment.paymentType,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount.toString(),
        reference: payment.reference ?? null,
        bankAccountId: payment.bankAccountId ?? null,
        status: payment.status,
      })
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          status: payment.status,
          reference: payment.reference ?? null,
          bankAccountId: payment.bankAccountId ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async generateNextPaymentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ count: count() }).from(payments);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `PAY-${year}-${num}`;
  }
}
