import type { Batch } from "./batch";

export interface BatchRepository {
  findById(id: string): Promise<Batch | null>;
  findByBatchNumber(
    componentId: string,
    batchNumber: string,
  ): Promise<Batch | null>;
  findManyByComponent(componentId: string): Promise<Batch[]>;
  save(batch: Batch): Promise<Batch>;
  /**
   * Persists a batch that already exists, used when its owning component
   * changes during consolidation. `save` cannot be used for this because it
   * inserts a new row.
   */
  update(batch: Batch): Promise<Batch>;
}
