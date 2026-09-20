import {
  CalculateInventoryProjection,
  createInventoryTransaction,
  InventoryProjection,
  TransactionType,
  type InventoryProjectionRepository,
  type InventoryTransactionRepository,
} from '@ananya/inventory';
import type { DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationContext,
  ConsolidationAdapterOutcome,
} from '../component-consolidation.types';

/**
 * Inventory consolidation adapter.
 *
 * The ledger is append-only, so nothing historical is rewritten: the source's
 * balance is *moved* to the canonical component by posting new, attributable
 * entries, and both components' projections are then recalculated from their own
 * full ledgers.
 *
 * For every location where the source holds `S > 0`:
 *
 *   - `Issue S`      against the source component   (source balance → 0)
 *   - `Receipt S`    against the canonical component (canonical balance → C + S)
 *
 * Zero balances produce no entries, because an entry that moves nothing would
 * still be a permanent, misleading row in an append-only ledger.
 *
 * Guard rails that BLOCK rather than guess:
 *
 *  - the two components must share a unit of measure; converting between units
 *    is a data decision, not a consolidation side effect,
 *  - a negative source balance is refused: it means the ledger is already
 *    inconsistent and consolidation must not silently absorb that,
 *  - projections are only recalculated for (component, location) pairs this
 *    adapter actually touched.
 */
export class InventoryConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'inventory';
  readonly label = 'Inventory balances and ledger';
  readonly order = 10;

  constructor(
    private readonly transactions: InventoryTransactionRepository,
    private readonly projections: InventoryProjectionRepository,
  ) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;
    const warnings: string[] = [];
    const entries: Array<{
      action: 'ISSUE_SOURCE' | 'RECEIPT_CANONICAL';
      componentId: string;
      locationId: string;
      quantity: number;
      transactionId: string;
    }> = [];
    const projectionChanges: Array<{
      componentId: string;
      locationId: string;
      before: number;
      after: number;
    }> = [];

    for (const source of sources) {
      if (source.unit !== canonical.unit) {
        throw new ConsolidationAdapterBlockedError(
          this.id,
          `Component ${source.sku} is measured in "${source.unit}" but ${canonical.sku} is measured in "${canonical.unit}". Inventory cannot be moved between different units of measure.`,
          {
            sourceComponentId: source.id,
            sourceUnit: source.unit,
            canonicalComponentId: canonical.id,
            canonicalUnit: canonical.unit,
          },
        );
      }

      // Defence in depth. The preview already refuses when an InitialStock
      // entry exists, but this adapter must not be able to strand an opening
      // balance even if it were ever invoked without that preflight.
      //
      // `CalculateInventoryProjection` has no `InitialStock` case, so the
      // quantity never reaches `inventory_projections` — the table this adapter
      // reads source balances from. The loop below would therefore find nothing
      // to move and retire the component with its opening balance left behind.
      await this.assertNoInitialStock(source.id, source.sku, executor);

      const sourceBalances = await this.projections.findManyByComponent(
        source.id,
      );

      for (const balance of sourceBalances) {
        const quantity = balance.quantity;

        if (quantity === 0) continue;

        if (quantity < 0) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `Component ${source.sku} has a negative balance (${quantity}) at location ${balance.locationId}. The ledger is already inconsistent; consolidation will not absorb it.`,
            {
              sourceComponentId: source.id,
              locationId: balance.locationId,
              quantity,
            },
          );
        }

        const canonicalBefore = await this.readQuantity(
          canonical.id,
          balance.locationId,
        );

        const issue = createInventoryTransaction({
          componentId: source.id,
          quantity,
          unitOfMeasure: source.unit,
          transactionType: TransactionType.Issue,
          sourceLocationId: balance.locationId,
          reference: `CONSOLIDATION:${context.consolidationId}`,
          reason: `Consolidated into ${canonical.sku}`,
          createdBy: context.actor.email ?? context.actor.id ?? 'system',
        });
        const savedIssue = await this.transactions.save(issue);

        const receipt = createInventoryTransaction({
          componentId: canonical.id,
          quantity,
          unitOfMeasure: canonical.unit,
          transactionType: TransactionType.Receipt,
          destinationLocationId: balance.locationId,
          reference: `CONSOLIDATION:${context.consolidationId}`,
          reason: `Consolidated from ${source.sku}`,
          createdBy: context.actor.email ?? context.actor.id ?? 'system',
        });
        const savedReceipt = await this.transactions.save(receipt);

        entries.push({
          action: 'ISSUE_SOURCE',
          componentId: source.id,
          locationId: balance.locationId,
          quantity,
          transactionId: savedIssue.id,
        });
        entries.push({
          action: 'RECEIPT_CANONICAL',
          componentId: canonical.id,
          locationId: balance.locationId,
          quantity,
          transactionId: savedReceipt.id,
        });

        // Recalculate both sides from their own complete ledgers. This is the
        // same projection mechanism the rest of the application uses, so the
        // result cannot disagree with a later global rebuild.
        const sourceAfter = await this.recalculate(
          source.id,
          balance.locationId,
          balance.unitOfMeasure || source.unit,
        );
        const canonicalAfter = await this.recalculate(
          canonical.id,
          balance.locationId,
          balance.unitOfMeasure || canonical.unit,
        );

        projectionChanges.push({
          componentId: source.id,
          locationId: balance.locationId,
          before: quantity,
          after: sourceAfter,
        });
        projectionChanges.push({
          componentId: canonical.id,
          locationId: balance.locationId,
          before: canonicalBefore,
          after: canonicalAfter,
        });

        if (sourceAfter !== 0) {
          // Cannot happen when the ledger is consistent, but if it does the
          // operation must not pretend the source was emptied.
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `After moving ${quantity} of ${source.sku} out of location ${balance.locationId}, its recalculated balance is ${sourceAfter} rather than 0. The ledger for this component is inconsistent; consolidation was rolled back.`,
            {
              sourceComponentId: source.id,
              locationId: balance.locationId,
              expected: 0,
              actual: sourceAfter,
            },
          );
        }
      }
    }

    const migratedCount = projectionChanges.filter(
      (change) => change.before !== change.after,
    ).length;

    if (entries.length === 0) {
      warnings.push(
        'Neither component held inventory, so no ledger entries were posted.',
      );
    }

    return {
      entity: 'inventory_projections',
      action: entries.length > 0 ? 'POST_LEDGER_ENTRY' : 'NONE',
      migratedCount,
      details: {
        ledgerEntries: entries,
        ledgerEntryCount: entries.length,
        projectionChanges,
      },
      warnings,
    };
  }

  /** Reads the current projected quantity, treating "no row" as zero. */
  private async readQuantity(
    componentId: string,
    locationId: string,
  ): Promise<number> {
    const projection = await this.projections.findByComponentAndLocation(
      componentId,
      locationId,
    );
    return projection?.quantity ?? 0;
  }

  /**
   * Refuses when the component has an `InitialStock` ledger entry.
   *
   * `CalculateInventoryProjection` has no case for `InitialStock`, so such an
   * entry is permanently invisible to `inventory_projections`. This adapter
   * reads source balances from projections, so it would post nothing and retire
   * the component with the opening balance stranded.
   *
   * Refusing is the correct response: representing that stock correctly is an
   * inventory-modelling decision that affects reservations, MRP and every stock
   * report, not something consolidation may decide unilaterally.
   */
  private async assertNoInitialStock(
    componentId: string,
    sku: string,
    executor: DbExecutor,
  ): Promise<void> {
    const rows = await executor.execute<{
      id: string;
      quantity: string;
    }>(
      sql`select id, quantity from inventory_transactions where component_id = ${componentId} and transaction_type = 'InitialStock' order by id`,
    );

    if (rows.rows.length === 0) return;

    const quantity = rows.rows.reduce(
      (total, row) => total + Number(row.quantity ?? 0),
      0,
    );

    throw new ConsolidationAdapterBlockedError(
      this.id,
      `${sku} has ${rows.rows.length} InitialStock ledger entr${rows.rows.length === 1 ? 'y' : 'ies'} holding ${quantity} unit(s). Those quantities are invisible to inventory_projections, so consolidation cannot move them and would retire the component with its opening balance left behind. Consolidation was rolled back.`,
      {
        componentId,
        initialStockEntryCount: rows.rows.length,
        initialStockQuantity: quantity,
        sampleIds: rows.rows.slice(0, 5).map((row) => row.id),
      },
    );
  }

  /**
   * Recomputes one (component, location) balance from that component's complete
   * ledger and persists it. Returns the recomputed quantity.
   */
  private async recalculate(
    componentId: string,
    locationId: string,
    unitOfMeasure: string,
  ): Promise<number> {
    const ledger = await this.transactions.findMany({ componentId });

    const recalculated = CalculateInventoryProjection.execute({
      componentId,
      locationId,
      transactions: ledger,
    });

    await this.projections.save(
      InventoryProjection.create({
        id: recalculated.id,
        componentId,
        locationId,
        quantity: recalculated.quantity,
        unitOfMeasure: recalculated.unitOfMeasure || unitOfMeasure,
        lastUpdated: recalculated.lastUpdated,
      }),
    );

    return recalculated.quantity;
  }
}
