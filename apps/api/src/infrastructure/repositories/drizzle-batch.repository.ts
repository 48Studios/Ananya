import { db, type DbExecutor } from '@ananya/database';
import { batches } from '@ananya/database/schema';
import type { Batch, BatchRepository } from '@ananya/inventory';
import { and, eq } from '@ananya/database/query';
import type { BatchRow } from '@ananya/database/schema';
import { Batch as BatchAggregate } from '@ananya/inventory';

function toDomain(row: BatchRow): Batch {
  return BatchAggregate.rehydrate({
    id: row.id,
    componentId: row.componentId,
    batchNumber: row.batchNumber,
    manufacturingDate: row.manufacturingDate ?? null,
    expiryDate: row.expiryDate ?? null,
    supplierBatchNumber: row.supplierBatchNumber ?? null,
    createdAt: row.createdAt,
  });
}

function toRow(batch: Batch): Omit<BatchRow, 'id' | 'createdAt'> {
  return {
    componentId: batch.componentId,
    batchNumber: batch.batchNumber,
    manufacturingDate: batch.manufacturingDate ?? null,
    expiryDate: batch.expiryDate ?? null,
    supplierBatchNumber: batch.supplierBatchNumber ?? null,
  };
}

export class DrizzleBatchRepository implements BatchRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<Batch | null> {
    const [row] = await this.client
      .select()
      .from(batches)
      .where(eq(batches.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByBatchNumber(
    componentId: string,
    batchNumber: string,
  ): Promise<Batch | null> {
    const [row] = await this.client
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.componentId, componentId),
          eq(batches.batchNumber, batchNumber),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findManyByComponent(componentId: string): Promise<Batch[]> {
    const rows = await this.client
      .select()
      .from(batches)
      .where(eq(batches.componentId, componentId));

    return rows.map(toDomain);
  }

  async save(batch: Batch): Promise<Batch> {
    const [row] = await this.client
      .insert(batches)
      .values(toRow(batch))
      .returning();

    if (!row) {
      throw new Error('Failed to create batch');
    }

    return toDomain(row);
  }

  async update(batch: Batch): Promise<Batch> {
    const [row] = await this.client
      .update(batches)
      .set({ componentId: batch.componentId })
      .where(eq(batches.id, batch.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update batch: ${batch.id}`);
    }

    return toDomain(row);
  }
}
