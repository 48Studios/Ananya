import type { SerialRepository } from '@ananya/inventory';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/**
 * Serial number consolidation adapter.
 *
 * A serial identifies one physical unit, so it is never renumbered and never
 * duplicated: the exact same serial row is filed under the surviving component,
 * keeping its serial number, location and creation timestamp.
 *
 * A collision BLOCKS. If the canonical component already has a serial with the
 * same number, the system is holding two identities for what may or may not be
 * the same physical unit, and only a human can decide which it is. Silently
 * dropping or renumbering either serial would corrupt physical traceability.
 */
export class SerialConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'serials';
  readonly label = 'Component serial numbers';
  readonly order = 40;

  constructor(private readonly serials: SerialRepository) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources } = context;
    const migrated: Array<{
      serialId: string;
      serialNumber: string;
      locationId: string | null;
    }> = [];

    for (const source of sources) {
      const sourceSerials = await this.serials.findManyByComponent(source.id);

      for (const serial of sourceSerials) {
        const collision = await this.serials.findBySerialNumber(
          canonical.id,
          serial.serialNumber,
        );

        if (collision) {
          throw new ConsolidationAdapterBlockedError(
            this.id,
            `Serial number "${serial.serialNumber}" exists on both ${source.sku} and ${canonical.sku}. Serial numbers identify individual units, so they cannot be merged or renumbered automatically. Resolve the duplicate serial before consolidating.`,
            {
              serialNumber: serial.serialNumber,
              sourceComponentId: source.id,
              canonicalComponentId: canonical.id,
              sourceSerialId: serial.id,
              canonicalSerialId: collision.id,
            },
          );
        }

        await this.serials.update(serial.reassignTo(canonical.id));
        migrated.push({
          serialId: serial.id,
          serialNumber: serial.serialNumber,
          locationId: serial.locationId ?? null,
        });
      }
    }

    return {
      entity: 'serials',
      action: migrated.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: migrated.length,
      details: { migratedSerials: migrated },
      warnings: [],
    };
  }
}
