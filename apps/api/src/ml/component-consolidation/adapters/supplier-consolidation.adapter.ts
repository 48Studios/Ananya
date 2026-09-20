import { sql } from '@ananya/database/query';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Supplier relationship consolidation adapter.
 *
 * `supplier_components` maps a component to the suppliers that can provide it.
 * After consolidation the surviving component should keep every sourcing option,
 * so the rows are repointed.
 *
 * There is no unique constraint on `(supplier_id, component_id)`, which means
 * repointing can create two rows for one supplier. Those two rows carry
 * different vendor part numbers, lead times, MOQs and prices — they are not
 * duplicates to be merged, they are a contradiction about how that supplier
 * supplies this part. This adapter therefore BLOCKS on a supplier collision and
 * asks the reviewer to decide, rather than picking a vendor part number.
 */
export class SupplierConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'supplier_components';
  readonly label = 'Supplier part relationships';
  readonly order = 25;

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources, executor } = context;
    const repointed: Array<{ mappingId: string; supplierId: string }> = [];

    for (const source of sources) {
      const mappings = await executor.execute<{
        id: string;
        supplier_id: string;
        vendor_part_number: string;
      }>(
        sql`select id, supplier_id, vendor_part_number from supplier_components where component_id = ${source.id} order by id`,
      );

      for (const mapping of mappings.rows) {
        const existing = await executor.execute<{
          id: string;
          vendor_part_number: string;
        }>(
          sql`select id, vendor_part_number from supplier_components where component_id = ${canonical.id} and supplier_id = ${mapping.supplier_id} order by id limit 1`,
        );

        const collision = existing.rows[0];
        if (collision) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `${source.sku} and ${canonical.sku} both map supplier ${mapping.supplier_id}, with vendor part numbers "${mapping.vendor_part_number}" and "${collision.vendor_part_number}". Consolidation will not choose between two vendor part numbers; reconcile the supplier mapping first.`,
            {
              supplierId: mapping.supplier_id,
              sourceMappingId: mapping.id,
              canonicalMappingId: collision.id,
              sourceVendorPartNumber: mapping.vendor_part_number,
              canonicalVendorPartNumber: collision.vendor_part_number,
            },
          );
        }

        await executor.execute(
          sql`update supplier_components set component_id = ${canonical.id}, updated_at = now() where id = ${mapping.id}`,
        );
        repointed.push({
          mappingId: mapping.id,
          supplierId: mapping.supplier_id,
        });
      }
    }

    return {
      entity: 'supplier_components',
      action: repointed.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: repointed.length,
      details: { repointedSupplierMappings: repointed },
      warnings: [],
    };
  }
}
