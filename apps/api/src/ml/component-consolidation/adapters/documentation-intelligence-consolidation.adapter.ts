import type { DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';
import { DOCUMENT_ANALYSIS_SOURCE } from '../../documentation-intelligence.dtos';
import { DOCUMENT_ATTRIBUTE_SOURCE } from '../../document-attribute-value-review';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Documentation Intelligence consolidation adapter.
 *
 * Pass 2 added `document_intelligence_analyses`, whose `component_id` is an
 * enforced foreign key to `components.id` (the consolidation dependency
 * registry fails closed on any unregistered component reference, which is how
 * this adapter came to exist).
 *
 * Semantics are the same decision the polymorphic adapter already makes for
 * `documents`: an analysis is evidence about a component's documentation *now*.
 * The document itself is repointed to the surviving component, so the analysis
 * that was derived from it must follow, or the evidence would describe a
 * component the UI no longer surfaces.
 *
 * What is NOT rewritten:
 *  - `document_id`, `document_version` and `content_hash` — the analysis must
 *    keep identifying the exact bytes it read. Repointing a document never
 *    changes those bytes, so this identity stays correct and verifiable.
 *  - `analyzed_at`, `analyzed_by_*`, `status` and the extraction payload — the
 *    analysis is an immutable observation, not a projection.
 *
 * No collision handling is needed: unlike batches or serials there is no unique
 * constraint on (component, document), and two analyses of the same document
 * cannot both be repointed to the same component because the analysis identity
 * includes its own document/version/hash.
 */
export class DocumentationIntelligenceConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'document_intelligence_analyses';
  readonly label = 'Datasheet analysis evidence';
  readonly order = 65;

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;
    const repointed: Array<{ analysisId: string; componentId: string }> = [];
    const staledFindingIds: string[] = [];

    for (const source of sources) {
      const rows = await this.repointSource(source.id, canonical.id, executor);
      repointed.push(
        ...rows.map((analysisId) => ({
          analysisId,
          componentId: canonical.id,
        })),
      );

      staledFindingIds.push(
        ...(await this.staleDocumentFindings(
          source.id,
          canonical.id,
          canonical.sku,
          executor,
        )),
      );
    }

    return {
      entity: 'document_intelligence_analyses',
      action: repointed.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: repointed.length + staledFindingIds.length,
      details: {
        repointedAnalyses: repointed,
        staledDocumentFindingIds: staledFindingIds,
      },
      warnings:
        staledFindingIds.length > 0
          ? [
              `${staledFindingIds.length} datasheet review suggestion(s) on the retired component were marked STALE: their document now belongs to the surviving component, so the suggestion must be re-derived there rather than applied to a retired record.`,
            ]
          : [],
    };
  }

  /**
   * Stales pending datasheet-derived findings left on the retired component.
   *
   * A document finding names the component it was derived for, and that
   * component is now retired: the apply workflow refuses retired records, so
   * leaving the suggestion PENDING would offer a reviewer an action that cannot
   * succeed — and the datasheet it cites has moved to the survivor anyway.
   *
   * Only findings produced by documentation analysis — identity findings
   * (`source = DOCUMENT_ANALYSIS_SOURCE`) and Pass 3 attribute-value suggestions
   * (`source = DOCUMENT_ATTRIBUTE_SOURCE`) — are touched. Every other finding
   * type keeps its existing lifecycle, which is why this lives here rather than
   * in the shared finding adapter: consolidation's meaning for a duplicate
   * finding is a different decision, already owned there.
   */
  private async staleDocumentFindings(
    sourceComponentId: string,
    canonicalComponentId: string,
    canonicalSku: string,
    executor: DbExecutor,
  ): Promise<string[]> {
    const patch = JSON.stringify({
      staleReason: `The component was consolidated into ${canonicalSku}. This datasheet suggestion was derived for the retired record; the document now belongs to the surviving component, so the suggestion must be re-derived there.`,
      staledAt: new Date().toISOString(),
      staleCause: 'CONSOLIDATION',
      canonicalComponentId,
    });

    const staled = await executor.execute<{ id: string }>(
      sql`update component_intelligence_findings
             set status = 'STALE',
                 updated_at = now(),
                 metadata = coalesce(metadata, '{}'::jsonb) || ${patch}::jsonb
           where component_id = ${sourceComponentId}
             and source in (${DOCUMENT_ANALYSIS_SOURCE}, ${DOCUMENT_ATTRIBUTE_SOURCE})
             and status = 'PENDING'
           returning id`,
    );

    return staled.rows.map((row) => row.id);
  }

  /**
   * Reassigns one retired component's analyses to the survivor.
   *
   * Exposed for direct use in tests and diagnostics; the consolidation service
   * calls it through {@link apply}.
   */
  async repointSource(
    sourceComponentId: string,
    canonicalComponentId: string,
    executor: DbExecutor,
  ): Promise<string[]> {
    const updated = await executor.execute<{ id: string }>(
      sql`update document_intelligence_analyses
             set component_id = ${canonicalComponentId}, updated_at = now()
           where component_id = ${sourceComponentId}
           returning id`,
    );
    return updated.rows.map((row) => row.id);
  }
}
