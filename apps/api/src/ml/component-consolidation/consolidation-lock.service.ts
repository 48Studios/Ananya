import {
  billOfMaterialLines,
  batches,
  componentIntelligenceFindings,
  components,
  inventoryProjections,
  inventoryReservationLines,
  serials,
} from '@ananya/database/schema';
import { inArray } from '@ananya/database/query';
import type { DbExecutor } from '@ananya/database';

/**
 * Deterministic row locking for consolidation (§9).
 *
 * Two rules make this safe:
 *
 * 1. **Every lock is taken with `ORDER BY id`.** PostgreSQL acquires row locks in
 *    the order rows are returned, so as long as every consolidation takes the
 *    same locks in the same order, two concurrent operations cannot deadlock by
 *    grabbing the same pair in opposite orders.
 * 2. **Every affected table is locked explicitly**, not only the two component
 *    rows. Locking components alone would let a concurrent reservation or batch
 *    change land after the preview was validated but before the migration ran.
 *
 * The client's preview fingerprint is an optimistic check. These locks are the
 * pessimistic backstop: after they are held, the state the operation validated
 * cannot change underneath it.
 */
export class ConsolidationLockService {
  /**
   * Locks the component rows involved in the operation, in id order.
   *
   * This is the first lock taken and the one that serialises two consolidations
   * touching the same component, including the case where they disagree about
   * which record is canonical.
   */
  async lockComponents(
    executor: DbExecutor,
    componentIds: string[],
  ): Promise<void> {
    const ordered = [...new Set(componentIds)].sort();
    if (ordered.length === 0) return;

    await executor
      .select({ id: components.id })
      .from(components)
      .where(inArray(components.id, ordered))
      .orderBy(components.id)
      .for('update');
  }

  /**
   * Locks the dependency rows consolidation can change or that gate it.
   *
   * Sorted by id for the same deadlock-avoidance reason as the component lock.
   */
  async lockDependencies(
    executor: DbExecutor,
    componentIds: string[],
  ): Promise<void> {
    const ordered = [...new Set(componentIds)].sort();
    if (ordered.length === 0) return;

    await executor
      .select({ id: inventoryReservationLines.id })
      .from(inventoryReservationLines)
      .where(inArray(inventoryReservationLines.componentId, ordered))
      .orderBy(inventoryReservationLines.id)
      .for('update');

    await executor
      .select({ id: batches.id })
      .from(batches)
      .where(inArray(batches.componentId, ordered))
      .orderBy(batches.id)
      .for('update');

    await executor
      .select({ id: serials.id })
      .from(serials)
      .where(inArray(serials.componentId, ordered))
      .orderBy(serials.id)
      .for('update');

    await executor
      .select({ id: billOfMaterialLines.id })
      .from(billOfMaterialLines)
      .where(inArray(billOfMaterialLines.componentId, ordered))
      .orderBy(billOfMaterialLines.id)
      .for('update');

    await executor
      .select({ id: inventoryProjections.id })
      .from(inventoryProjections)
      .where(inArray(inventoryProjections.componentId, ordered))
      .orderBy(inventoryProjections.id)
      .for('update');
  }

  /**
   * Locks the review findings that consolidation will close or stale.
   *
   * Locked after the components so that a concurrent reviewer decision on the
   * same finding either lands entirely before this operation or is blocked until
   * it finishes.
   */
  async lockFindings(
    executor: DbExecutor,
    findingId: string,
    componentIds: string[],
  ): Promise<void> {
    const ordered = [...new Set([findingId, ...componentIds])].sort();

    await executor
      .select({ id: componentIntelligenceFindings.id })
      .from(componentIntelligenceFindings)
      .where(inArray(componentIntelligenceFindings.componentId, ordered))
      .orderBy(componentIntelligenceFindings.id)
      .for('update');

    await executor
      .select({ id: componentIntelligenceFindings.id })
      .from(componentIntelligenceFindings)
      .where(inArray(componentIntelligenceFindings.id, [findingId]))
      .orderBy(componentIntelligenceFindings.id)
      .for('update');

    await executor
      .select({ id: componentIntelligenceFindings.id })
      .from(componentIntelligenceFindings)
      .where(inArray(componentIntelligenceFindings.relatedComponentId, ordered))
      .orderBy(componentIntelligenceFindings.id)
      .for('update');
  }
}
