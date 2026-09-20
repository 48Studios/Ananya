import type { BatchRepository } from '@ananya/inventory';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Batch consolidation adapter.
 *
 * A batch is an identity record — this schema stores no quantity on it — so the
 * only correct action is to file the existing batch under the surviving
 * component. The batch keeps its id, batch number, manufacturing/expiry dates
 * and supplier batch number.
 *
 * A collision (the canonical component already has a batch with the same number)
 * BLOCKS. Two batches that share a number but belong to different components are
 * not provably the same physical lot, and merging them would discard the source
 * batch's dates and supplier reference. The reviewer must resolve the underlying
 * data question first.
 */
export class BatchConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'batches';
  readonly label = 'Component batches';
  readonly order = 30;

  constructor(private readonly batches: BatchRepository) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources } = context;
    const repointed: Array<{ batchId: string; batchNumber: string }> = [];

    for (const source of sources) {
      const sourceBatches = await this.batches.findManyByComponent(source.id);

      for (const batch of sourceBatches) {
        const collision = await this.batches.findByBatchNumber(
          canonical.id,
          batch.batchNumber,
        );

        if (collision) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `Batch "${batch.batchNumber}" exists on both ${source.sku} and ${canonical.sku}. Batch codes are unique per component, and the two batches cannot be assumed to be the same physical lot. Resolve the duplicate batch code before consolidating.`,
            {
              batchNumber: batch.batchNumber,
              sourceComponentId: source.id,
              canonicalComponentId: canonical.id,
              sourceBatchId: batch.id,
              canonicalBatchId: collision.id,
            },
          );
        }

        await this.batches.update(batch.reassignTo(canonical.id));
        repointed.push({ batchId: batch.id, batchNumber: batch.batchNumber });
      }
    }

    return {
      entity: 'batches',
      action: repointed.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: repointed.length,
      details: { repointedBatches: repointed },
      warnings: [],
    };
  }
}
