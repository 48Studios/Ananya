import { db } from '@ananya/database';
import { bankReconciliations, bankTransactions } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type {
  BankReconciliationRecord,
  BankTransactionRecord,
} from '@ananya/database/schema';
import {
  BankReconciliation,
  type BankReconciliationRepository,
  type ReconciliationStatus,
  type FindManyReconciliationsOptions,
} from '@ananya/finance';

function toDomain(
  row: BankReconciliationRecord,
  transactions: BankTransactionRecord[] = [],
): BankReconciliation {
  return BankReconciliation.rehydrate({
    id: row.id,
    bankAccountId: row.bankAccountId,
    statementDate: row.statementDate,
    openingBalance: parseFloat(row.openingBalance),
    closingBalance: parseFloat(row.closingBalance),
    status: row.status as ReconciliationStatus,
    transactions: transactions.map((t) => ({
      id: t.id,
      bankReconciliationId: t.bankReconciliationId,
      transactionDate: t.transactionDate,
      description: t.description,
      amount: parseFloat(t.amount),
      matchedPaymentId: t.matchedPaymentId ?? undefined,
      isMatched: t.isMatched,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleBankReconciliationRepository implements BankReconciliationRepository {
  async findById(id: string): Promise<BankReconciliation | null> {
    const [row] = await db
      .select()
      .from(bankReconciliations)
      .where(eq(bankReconciliations.id, id))
      .limit(1);
    if (!row) return null;
    const transactions = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.bankReconciliationId, id));
    return toDomain(row, transactions);
  }

  async findMany(
    options?: FindManyReconciliationsOptions,
  ): Promise<BankReconciliation[]> {
    const query = db.select().from(bankReconciliations);
    if (options?.bankAccountId) {
      query.where(eq(bankReconciliations.bankAccountId, options.bankAccountId));
    }
    if (options?.status) {
      query.where(eq(bankReconciliations.status, options.status));
    }
    const rows = await query.orderBy(desc(bankReconciliations.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const transactions = await db
          .select()
          .from(bankTransactions)
          .where(eq(bankTransactions.bankReconciliationId, row.id));
        return toDomain(row, transactions);
      }),
    );
  }

  async save(reconciliation: BankReconciliation): Promise<void> {
    await db
      .insert(bankReconciliations)
      .values({
        id: reconciliation.id,
        bankAccountId: reconciliation.bankAccountId,
        statementDate: reconciliation.statementDate,
        openingBalance: reconciliation.openingBalance.toString(),
        closingBalance: reconciliation.closingBalance.toString(),
        status: reconciliation.status,
      })
      .onConflictDoUpdate({
        target: bankReconciliations.id,
        set: {
          openingBalance: reconciliation.openingBalance.toString(),
          closingBalance: reconciliation.closingBalance.toString(),
          status: reconciliation.status,
          updatedAt: new Date(),
        },
      });

    for (const tx of reconciliation.transactions) {
      await db
        .insert(bankTransactions)
        .values({
          id: tx.id,
          bankReconciliationId: reconciliation.id,
          transactionDate: tx.transactionDate,
          description: tx.description,
          amount: tx.amount.toString(),
          matchedPaymentId: tx.matchedPaymentId ?? null,
          isMatched: tx.isMatched,
        })
        .onConflictDoUpdate({
          target: bankTransactions.id,
          set: {
            matchedPaymentId: tx.matchedPaymentId ?? null,
            isMatched: tx.isMatched,
            updatedAt: new Date(),
          },
        });
    }
  }
}
