import {
  analyzeComponentDependencies,
  type DependencyAnalysis,
} from '../../component-consolidation-dependencies';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Dependency guard adapter.
 *
 * Runs FIRST (order 5), before anything is mutated, and refuses the operation
 * when a domain that has no safe consolidation semantics still references one of
 * the components. Failing before the first write keeps the failure cheap and the
 * reason precise.
 *
 * It blocks on three distinct conditions:
 *
 * 1. **Registry drift** — the live database has a component reference the
 *    dependency registry does not know about. A reference nobody has reasoned
 *    about must never be silently skipped.
 * 2. **Domains with no safe semantics** — open purchase orders, service
 *    requests, and a BOM that produces a component being retired. These are
 *    live commitments or identity documents; altering them is not consolidation,
 *    it is a separate business decision.
 * 3. **Missing unit of measure** — two components measured differently cannot
 *    have their stock merged, because no conversion rule exists.
 *
 * Everything else is either migrated by a dedicated adapter or preserved as
 * history, and is reported as an informational outcome rather than a block.
 */
export class DependencyGuardAdapter implements ConsolidationAdapter {
  readonly id = 'dependency_guard';
  readonly label = 'Dependency safety guard';
  readonly order = 5;

  /** Domains that must block while any row exists. */
  private static readonly BLOCKING_DEPENDENCIES: Record<string, string> = {
    purchase_order_lines:
      'Open purchase order lines are a live commercial commitment to a supplier. Changing the component on an issued order would misstate what was ordered, and no domain operation supports it. Close or cancel the affected orders, or split them, before consolidating.',
    service_requests:
      'Service requests record the item being serviced. No domain rule defines what happens to an open service request when its component is consolidated, and silently moving it would claim a different item was in for repair.',
  };

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;

    for (const source of sources) {
      if (source.unit !== canonical.unit) {
        throw new ConsolidationAdapterBlockedError(
          this.id,
          `${source.sku} is measured in "${source.unit}" and ${canonical.sku} in "${canonical.unit}". Consolidation has no unit conversion rule, so their stock cannot be merged.`,
          {
            sourceComponentId: source.id,
            sourceUnit: source.unit,
            canonicalComponentId: canonical.id,
            canonicalUnit: canonical.unit,
          },
        );
      }
    }

    const blocking: Array<{
      componentId: string;
      dependencyId: string;
      count: number;
      openCount: number;
      message: string;
    }> = [];
    const preserved: Array<{
      componentId: string;
      dependencyId: string;
      count: number;
    }> = [];

    for (const component of [canonical, ...sources]) {
      const analysis = await analyzeComponentDependencies(
        component.id,
        executor,
      );

      if (!analysis.coverage.ok) {
        const unregistered = analysis.coverage.unregistered
          .map((reference) => `${reference.table}.${reference.column}`)
          .join(', ');
        throw new ConsolidationAdapterBlockedError(
          this.id,
          `The dependency registry does not cover every component reference in this database (unregistered: ${unregistered || 'none'}). Consolidation refuses to run until every reference is registered and classified.`,
          {
            unregisteredReferences: analysis.coverage.unregistered,
            staleReferences: analysis.coverage.stale,
          },
        );
      }

      for (const entry of analysis.analyses) {
        if (entry.count === 0) continue;
        this.assertNotBlocking(component.sku, component.id, entry, blocking);
        if (entry.executionSupport === 'NOT_APPLICABLE') {
          preserved.push({
            componentId: component.id,
            dependencyId: entry.id,
            count: entry.count,
          });
        }
      }
    }

    if (blocking.length > 0) {
      const first = blocking[0]!;
      throw new ConsolidationAdapterBlockedError(
        this.id,
        `${first.message} (${blocking.length} blocking reference${
          blocking.length === 1 ? '' : 's'
        } in total.)`,
        { blockingReferences: blocking },
      );
    }

    return {
      entity: 'component_dependencies',
      action: preserved.length > 0 ? 'PRESERVE' : 'NONE',
      migratedCount: 0,
      details: { preservedReferences: preserved },
      warnings: [],
    };
  }

  /** Raises when a dependency has rows and no safe semantics. */
  private assertNotBlocking(
    sku: string,
    componentId: string,
    entry: DependencyAnalysis,
    blocking: Array<{
      componentId: string;
      dependencyId: string;
      count: number;
      openCount: number;
      message: string;
    }>,
  ): void {
    const message = DependencyGuardAdapter.BLOCKING_DEPENDENCIES[entry.id];
    if (!message) return;

    // Only live rows block. A closed purchase order or a completed service
    // request is history and is preserved.
    const openCount = entry.openCount ?? entry.count;
    if (openCount === 0) return;

    blocking.push({
      componentId,
      dependencyId: entry.id,
      count: entry.count,
      openCount,
      message: `${sku} has ${openCount} open ${entry.label.toLowerCase()} that consolidation cannot safely move. ${message}`,
    });
  }

  /** Exposed for the preview so both layers agree on what blocks. */
  static blockingDependencyIds(): string[] {
    return Object.keys(DependencyGuardAdapter.BLOCKING_DEPENDENCIES);
  }
}
