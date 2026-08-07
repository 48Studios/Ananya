import { Inject, Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { batches, components } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import {
  Batch,
  type BatchRepository,
  type CreateBatchInput,
} from '@ananya/inventory';
import { BATCH_REPOSITORY } from './batch.tokens';

@Injectable()
export class BatchesService {
  constructor(
    @Inject(BATCH_REPOSITORY)
    private readonly repository: BatchRepository,
  ) {}

  async create(input: CreateBatchInput): Promise<Batch> {
    const batch = Batch.create(input);
    return this.repository.save(batch);
  }

  async getAll() {
    return db
      .select({
        id: batches.id,
        componentId: batches.componentId,
        componentName: components.name,
        componentSku: components.sku,
        batchNumber: batches.batchNumber,
        supplierBatchNumber: batches.supplierBatchNumber,
        manufacturingDate: batches.manufacturingDate,
        expiryDate: batches.expiryDate,
        createdAt: batches.createdAt,
      })
      .from(batches)
      .innerJoin(components, eq(batches.componentId, components.id))
      .orderBy(components.sku, batches.batchNumber);
  }

  async getByComponent(componentId: string): Promise<Batch[]> {
    return this.repository.findManyByComponent(componentId);
  }

  async getById(id: string): Promise<Batch | null> {
    return this.repository.findById(id);
  }
}
