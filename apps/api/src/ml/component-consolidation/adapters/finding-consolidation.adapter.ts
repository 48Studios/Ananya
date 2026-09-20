import { componentIntelligenceFindings } from '@ananya/database/schema';
import { and, eq, inArray, or, sql } from '@ananya/database/query';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Finding lifecycle adapter (§15).
 *
 * Consolidation is the reviewer's decision on the duplicate finding, so the
 * finding is closed as ACCEPTED using the existing lifecycle — no new review
 * status is invented. It records:
 *
 *  - the consolidation id, surviving and retired components,
 *  - the preview fingerprint that was approved,
 *  - the reviewer and their notes,
 *  - the decision facts, merged into `metadata` so the finding's original
 *    evidence, current/suggested values and confidence are all preserved.
 *
 * Related duplicate findings that involve either component are marked STALE
 * using the existing status, because after consolidation their pairs no longer
 * describe two independent records. Findings are never deleted, so the review
 * history survives.
 *
 * This adapter writes through the consolidation transaction rather than through
 * `ComponentReviewQueueService`, because those methods bind the global client and
 * would commit outside the consolidation. The status values, metadata merge
 * semantics (`||` jsonb concat) and STALE reason follow that service exactly, so
 * the two paths cannot diverge in meaning.
 */
export class FindingConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'findings';
  readonly label = 'Review findings';
  readonly order = 70;

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const {
      canonical,
      sources,
      executor,
      plan,
      actor,
      consolidationId,
      previewFingerprint,
    } = context;

    const sourceIds = sources.map((source) => source.id);
    const involvedIds = [canonical.id, ...sourceIds];
    const reviewedAt = new Date();

    const metadataPatch = JSON.stringify({
      decision: 'ACCEPTED',
      applied: true,
      action: 'CONSOLIDATED',
      consolidationId,
      canonicalComponentId: canonical.id,
      canonicalComponentSku: canonical.sku,
      sourceComponentIds: sourceIds,
      sourceComponentSkus: sources.map((source) => source.sku),
      previewFingerprint,
      decisionNotes: plan.decisionNotes ?? null,
    });

    // Guarded on the consolidatable statuses, so a concurrent REJECT/DISMISS
    // decision can never be overwritten: if the row moved to a terminal state
    // this returns nothing and the whole consolidation is rolled back.
    //
    // The reviewer fields use `coalesce`, because the finding may already have
    // been accepted by a reviewer before consolidation. That earlier decision is
    // the acknowledgement and must survive; the consolidation is recorded in
    // `metadata` and in the consolidation record, which carries its own actor.
    const accepted = await executor
      .update(componentIntelligenceFindings)
      .set({
        status: 'ACCEPTED',
        reviewerId: sql`coalesce(${componentIntelligenceFindings.reviewerId}, ${actor.id ?? null})`,
        reviewerEmail: sql`coalesce(${componentIntelligenceFindings.reviewerEmail}, ${actor.email ?? null})`,
        reviewedAt: sql`coalesce(${componentIntelligenceFindings.reviewedAt}, ${reviewedAt})`,
        decisionNotes: sql`coalesce(${componentIntelligenceFindings.decisionNotes}, ${plan.decisionNotes ?? null})`,
        updatedAt: reviewedAt,
        metadata: sql`coalesce(${componentIntelligenceFindings.metadata}, '{}'::jsonb) || ${metadataPatch}::jsonb`,
      })
      .where(
        and(
          eq(componentIntelligenceFindings.id, plan.findingId),
          inArray(componentIntelligenceFindings.status, [
            'PENDING',
            'ACCEPTED',
          ]),
        ),
      )
      .returning({ id: componentIntelligenceFindings.id });

    if (accepted.length === 0) {
      throw new Error(
        `Finding ${plan.findingId} was no longer in a consolidatable status when consolidation committed. Rolling back.`,
      );
    }

    const stalePatch = JSON.stringify({
      staleReason: `Consolidated into ${canonical.sku} by consolidation ${consolidationId}. The duplicate pair no longer describes two independent records.`,
      staledAt: reviewedAt.toISOString(),
      staleCause: 'CONSOLIDATION',
      consolidationId,
      canonicalComponentId: canonical.id,
    });

    const staled = await executor
      .update(componentIntelligenceFindings)
      .set({
        status: 'STALE',
        updatedAt: reviewedAt,
        metadata: sql`coalesce(${componentIntelligenceFindings.metadata}, '{}'::jsonb) || ${stalePatch}::jsonb`,
      })
      .where(
        and(
          eq(componentIntelligenceFindings.issueCategory, 'DUPLICATE'),
          eq(componentIntelligenceFindings.status, 'PENDING'),
          // `ne` is not part of this project's exported query surface, so the
          // inequality is written directly. The id is a bound parameter.
          sql`${componentIntelligenceFindings.id} <> ${plan.findingId}`,
          or(
            inArray(componentIntelligenceFindings.componentId, involvedIds),
            inArray(
              componentIntelligenceFindings.relatedComponentId,
              involvedIds,
            ),
          ),
        ),
      )
      .returning({ id: componentIntelligenceFindings.id });

    return {
      entity: 'component_intelligence_findings',
      action: 'RECONCILE',
      migratedCount: 1 + staled.length,
      details: {
        consolidatedFindingId: plan.findingId,
        consolidatedFindingStatus: 'ACCEPTED',
        staledFindingIds: staled.map((row) => row.id),
        staledFindingCount: staled.length,
      },
      warnings: [],
    };
  }
}
