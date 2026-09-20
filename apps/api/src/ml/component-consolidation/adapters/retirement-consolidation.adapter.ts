import {
  RetireAsConsolidated,
  type ComponentRepository,
} from '@ananya/inventory';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Source retirement adapter (§14).
 *
 * Runs LAST (order 80), after every other adapter has moved what needed moving,
 * and performs the lifecycle transition through the domain use case
 * (`RetireAsConsolidated`) rather than by writing booleans:
 *
 *   source    → isActive = false
 *               consolidatedIntoComponentId = <canonical>
 *               consolidationId             = <this operation>
 *               consolidatedAt              = now
 *   canonical → unchanged (still active)
 *
 * The source component is never deleted. Its identity, SKU and every historical
 * foreign key survive, so past activity remains explainable and the retirement
 * trail is intact. From this point the ledger rejects new transactions for it and
 * the master-data guards reject edits.
 */
export class RetirementConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'retirement';
  readonly label = 'Source component retirement';
  readonly order = 80;

  constructor(private readonly components: ComponentRepository) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, consolidationId } = context;
    const useCase = new RetireAsConsolidated(this.components);
    const retiredAt = new Date();

    const retired: Array<{
      componentId: string;
      sku: string;
      consolidatedIntoComponentId: string;
      consolidatedAt: string;
    }> = [];

    for (const source of sources) {
      const retiredComponent = await useCase.execute({
        sourceComponentId: source.id,
        canonicalComponentId: canonical.id,
        consolidationId,
        consolidatedAt: retiredAt,
      });

      retired.push({
        componentId: retiredComponent.id,
        sku: retiredComponent.sku,
        consolidatedIntoComponentId:
          retiredComponent.consolidatedIntoComponentId!,
        consolidatedAt: retiredComponent.consolidatedAt!.toISOString(),
      });
    }

    return {
      entity: 'components',
      action: 'RETIRE',
      migratedCount: retired.length,
      details: {
        retiredSources: retired,
        canonicalComponentId: canonical.id,
        canonicalIsActive: true,
      },
      warnings: [],
    };
  }
}
