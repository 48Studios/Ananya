import { db } from '@ananya/database';
import { inventoryTransactions } from '@ananya/database/schema';
import type {
  InventoryTransaction,
  InventoryTransactionRepository,
  TransactionType,
  FindManyInventoryTransactionsOptions,
} from '@ananya/inventory';
import { eq, or, ilike, desc } from '@ananya/database/query';
import type { InventoryTransactionRow } from '@ananya/database/schema';
import { InventoryTransaction as InventoryTransactionAggregate } from '@ananya/inventory';

function toDomain(row: InventoryTransactionRow): InventoryTransaction {
  return InventoryTransactionAggregate.rehydrate({
    id: row.id,
    componentId: row.componentId,
    quantity: row.quantity,
    unitOfMeasure: row.unitOfMeasure,
    sourceLocationId: row.sourceLocationId ?? undefined,
    destinationLocationId: row.destinationLocationId ?? undefined,
    transactionType: row.transactionType as TransactionType,
    reference: row.reference ?? undefined,
    reason: row.reason ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  });
}

function toRow(
  tx: InventoryTransaction,
): Omit<InventoryTransactionRow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    componentId: tx.componentId,
    transactionType: tx.transactionType,
    quantity: tx.quantity,
    unitOfMeasure: tx.unitOfMeasure,
    sourceLocationId: tx.sourceLocationId ?? null,
    destinationLocationId: tx.destinationLocationId ?? null,
    reference: tx.reference ?? null,
    reason: tx.reason ?? null,
    createdBy: tx.createdBy,
  };
}

export class DrizzleInventoryTransactionRepository implements InventoryTransactionRepository {
  async findById(id: string): Promise<InventoryTransaction | null> {
    const [row] = await db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyInventoryTransactionsOptions,
  ): Promise<InventoryTransaction[]> {
    const query = db.select().from(inventoryTransactions);

    if (options?.componentId) {
      query.where(eq(inventoryTransactions.componentId, options.componentId));
    }

    if (options?.locationId) {
      query.where(
        or(
          eq(inventoryTransactions.sourceLocationId, options.locationId),
          eq(inventoryTransactions.destinationLocationId, options.locationId),
        ),
      );
    }

    if (options?.transactionType) {
      query.where(
        eq(inventoryTransactions.transactionType, options.transactionType),
      );
    }

    if (options?.createdBy) {
      query.where(eq(inventoryTransactions.createdBy, options.createdBy));
    }

    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(
          ilike(inventoryTransactions.reference, pattern),
          ilike(inventoryTransactions.reason, pattern),
        ),
      );
    }

    const rows = await query.orderBy(desc(inventoryTransactions.createdAt));

    return rows.map(toDomain);
  }

  async save(transaction: InventoryTransaction): Promise<InventoryTransaction> {
    const [row] = await db
      .insert(inventoryTransactions)
      .values(toRow(transaction))
      .returning();

    if (!row) {
      throw new Error('Failed to create inventory transaction');
    }

    return toDomain(row);
  }
}
