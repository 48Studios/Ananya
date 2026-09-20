import { sql } from '@ananya/database/query';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Procurement reference consolidation adapter.
 *
 * Purchase *recommendations* are forward-looking: an open (`PENDING`) planning
 * recommendation tells a buyer to purchase a component. Leaving it on a retired
 * component would let the buyer order a record that no longer exists, so pending
 * recommendations follow the surviving component.
 *
 * Everything else in procurement is history and is deliberately left alone:
 *
 *  - purchase **orders** (any status) — what was ordered from a supplier is a
 *    commercial fact; open ones are refused by the dependency guard rather than
 *    rewritten here,
 *  - purchase **invoices** — financial documents,
 *  - goods **receipts** and supplier **returns** — they already produced ledger
 *    entries and describe physical movements,
 *  - non-pending recommendations — the planning run already acted on them.
 */
export class ProcurementConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'procurement';
  readonly label = 'Procurement references';
  readonly order = 26;

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;
    const repointed: Array<{ recommendationId: string }> = [];

    for (const source of sources) {
      const pending = await executor.execute<{ id: string }>(
        sql`select id from purchase_recommendations where component_id = ${source.id} and status = 'PENDING' order by id`,
      );

      for (const recommendation of pending.rows) {
        await executor.execute(
          sql`update purchase_recommendations set component_id = ${canonical.id}, updated_at = now() where id = ${recommendation.id}`,
        );
        repointed.push({ recommendationId: recommendation.id });
      }
    }

    return {
      entity: 'purchase_recommendations',
      action: repointed.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: repointed.length,
      details: { repointedRecommendations: repointed },
      warnings:
        repointed.length > 0
          ? [
              `${repointed.length} open purchase recommendation(s) now point at the surviving component.`,
            ]
          : [],
    };
  }
}
