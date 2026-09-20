import { consolidations, consolidationSources } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import type { DbExecutor } from '@ananya/database';
import type {
  ConsolidationActor,
  ConsolidationPlan,
  ConsolidationSourceState,
} from './component-consolidation.types';

/**
 * Persistence for the consolidation operation record (§7, §18).
 *
 * This is the authoritative record of what happened. It is written inside the
 * same transaction as the mutations it describes, so a COMPLETED row exists if
 * and only if every mutation committed. The pre-state it carries is what makes an
 * operational failure diagnosable after the fact; it is deliberately not an
 * "undo" feature, because the domain does not support reversing a committed
 * consolidation.
 */

export interface PersistConsolidationInput {
  consolidationId: string;
  canonicalComponentId: string;
  findingId: string;
  previewFingerprint: string;
  previewVersion: string;
  intelligenceVersion: string | null;
  plan: ConsolidationPlan;
  actor: ConsolidationActor;
}

export interface FinalizeConsolidationInput {
  consolidationId: string;
  results: Array<{ adapterId: string; outcome: unknown }>;
  warnings: string[];
  preStateByComponentId: Map<string, ConsolidationSourceState>;
  postStateByComponentId: Map<string, Record<string, unknown>>;
  completedAt: Date;
}

export class ConsolidationRepository {
  /**
   * Inserts the consolidation header BEFORE any migration runs.
   *
   * This ordering is required, not cosmetic: retiring a source component writes
   * `components.consolidation_id`, which is a foreign key to this table. The
   * header must therefore exist first. Because the insert happens inside the
   * consolidation transaction, a later failure removes it again, so a COMPLETED
   * row still exists if and only if every mutation committed.
   */
  async persistHeader(
    executor: DbExecutor,
    input: PersistConsolidationInput,
  ): Promise<void> {
    await executor.insert(consolidations).values({
      id: input.consolidationId,
      canonicalComponentId: input.canonicalComponentId,
      findingId: input.findingId,
      status: 'COMPLETED',
      previewFingerprint: input.previewFingerprint,
      previewVersion: input.previewVersion,
      intelligenceVersion: input.intelligenceVersion,
      sourceCount: input.plan.sourceComponentIds.length,
      createdBy: input.actor.id ?? null,
      createdByEmail: input.actor.email ?? null,
      plan: {
        canonicalComponentId: input.plan.canonicalComponentId,
        sourceComponentIds: input.plan.sourceComponentIds,
        attributeResolutions: input.plan.attributeResolutions,
        bomResolutions: input.plan.bomResolutions,
        decisionNotes: input.plan.decisionNotes ?? null,
      },
      result: {},
      createdAt: new Date(),
      completedAt: null,
    });
  }

  /**
   * Records what actually happened: the adapter outcomes, warnings, and the
   * pre/post state of every retired source.
   *
   * The unique index on `consolidation_sources.source_component_id` is the
   * database-enforced idempotency guarantee: even if every application-level
   * check were bypassed, a source component cannot be retired twice. A violation
   * surfaces as a unique-constraint error and rolls the whole transaction back.
   */
  async finalize(
    executor: DbExecutor,
    input: FinalizeConsolidationInput,
  ): Promise<void> {
    await executor
      .update(consolidations)
      .set({
        result: {
          adapters: input.results,
          warnings: input.warnings,
        },
        completedAt: input.completedAt,
      })
      .where(eq(consolidations.id, input.consolidationId));

    for (const [sourceComponentId, postState] of input.postStateByComponentId) {
      await executor.insert(consolidationSources).values({
        consolidationId: input.consolidationId,
        sourceComponentId,
        preState: (input.preStateByComponentId.get(sourceComponentId) ?? {
          componentId: sourceComponentId,
        }) as unknown as Record<string, unknown>,
        postState,
      });
    }
  }

  /**
   * Records a refused attempt.
   *
   * Called in its own transaction after the consolidation transaction has rolled
   * back, so it genuinely is bookkeeping about a failure that did not mutate
   * anything. It never changes component or inventory state.
   */
  async recordFailure(
    executor: DbExecutor,
    input: {
      consolidationId: string;
      canonicalComponentId: string;
      findingId: string;
      previewFingerprint: string;
      previewVersion: string;
      reason: string;
      actor: ConsolidationActor;
      plan: ConsolidationPlan;
    },
  ): Promise<void> {
    await executor.insert(consolidations).values({
      id: input.consolidationId,
      canonicalComponentId: input.canonicalComponentId,
      findingId: input.findingId,
      status: 'FAILED',
      previewFingerprint: input.previewFingerprint,
      previewVersion: input.previewVersion,
      sourceCount: input.plan.sourceComponentIds.length,
      createdBy: input.actor.id ?? null,
      createdByEmail: input.actor.email ?? null,
      plan: {
        canonicalComponentId: input.plan.canonicalComponentId,
        sourceComponentIds: input.plan.sourceComponentIds,
        attributeResolutions: input.plan.attributeResolutions,
        bomResolutions: input.plan.bomResolutions,
        decisionNotes: input.plan.decisionNotes ?? null,
      },
      result: {},
      failureReason: input.reason,
      createdAt: new Date(),
    });
  }

  /** Reads a committed consolidation by id. */
  async findById(
    executor: DbExecutor,
    consolidationId: string,
  ): Promise<{
    id: string;
    canonicalComponentId: string;
    status: string;
  } | null> {
    const [row] = await executor
      .select({
        id: consolidations.id,
        canonicalComponentId: consolidations.canonicalComponentId,
        status: consolidations.status,
      })
      .from(consolidations)
      .where(eq(consolidations.id, consolidationId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Finds the committed consolidation that retired a source component, if any.
   *
   * This is the idempotency lookup: a retried request whose source is already
   * retired returns the existing operation instead of repeating the inventory
   * movements.
   */
  async findBySourceComponentId(
    executor: DbExecutor,
    sourceComponentId: string,
  ): Promise<{ consolidationId: string; canonicalComponentId: string } | null> {
    const [row] = await executor
      .select({
        consolidationId: consolidationSources.consolidationId,
        canonicalComponentId: consolidations.canonicalComponentId,
      })
      .from(consolidationSources)
      .innerJoin(
        consolidations,
        eq(consolidations.id, consolidationSources.consolidationId),
      )
      .where(eq(consolidationSources.sourceComponentId, sourceComponentId))
      .limit(1);

    return row ?? null;
  }
}
