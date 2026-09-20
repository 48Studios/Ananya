import {
  ReservationStatus,
  type InventoryProjectionRepository,
  type ReservationRepository,
} from '@ananya/inventory';
import { ConsolidationAdapterBlockedError } from '../component-consolidation.errors';
import type {
  ConsolidationAdapter,
  ConsolidationAdapterOutcome,
  ConsolidationContext,
} from '../component-consolidation.types';

/** Reservation statuses whose lines are still live commitments. */
const OPEN_RESERVATION_STATUSES: readonly string[] = [
  ReservationStatus.Draft,
  ReservationStatus.Active,
];

/**
 * Reservation consolidation adapter.
 *
 * Open reservations (DRAFT / ACTIVE) are live commitments: the stock is already
 * promised to a work order or document, so they must follow the component the
 * stock now belongs to. Fulfilled, released, cancelled and expired reservations
 * are historical and are left exactly as they were.
 *
 * The invariant this adapter exists to protect is:
 *
 *   reserved(canonical, location) <= onHand(canonical, location)
 *
 * Because the inventory adapter runs first (order 10), the canonical component
 * already holds the source's stock by the time this adapter runs, so the check is
 * made against post-move balances. If repointing would over-reserve the
 * canonical component the adapter BLOCKS rather than creating a reservation that
 * cannot be fulfilled.
 *
 * Lines are repointed one by one, preserving ids and quantities. If a
 * reservation ends up with two lines for the same (component, location) they are
 * deliberately left as two lines rather than summed: consolidation must not
 * invent a quantity merge in a commitment document.
 */
export class ReservationConsolidationAdapter implements ConsolidationAdapter {
  readonly id = 'reservations';
  readonly label = 'Inventory reservations';
  readonly order = 50;

  constructor(
    private readonly reservations: ReservationRepository,
    private readonly projections: InventoryProjectionRepository,
  ) {}

  async apply(
    context: ConsolidationContext,
  ): Promise<ConsolidationAdapterOutcome> {
    const { canonical, sources } = context;
    const repointed: Array<{
      reservationId: string;
      reservationNumber: string;
      lineId: string;
      locationId: string;
      reservedQuantity: number;
    }> = [];
    const warnings: string[] = [];

    for (const source of sources) {
      const candidates = await this.reservations.findMany({
        componentId: source.id,
      });

      for (const reservation of candidates) {
        if (!OPEN_RESERVATION_STATUSES.includes(reservation.status)) continue;

        const sourceLines = reservation.lines.filter(
          (line) => line.componentId === source.id,
        );
        if (sourceLines.length === 0) continue;

        for (const line of sourceLines) {
          await this.assertAvailableAfterRepoint({
            canonicalComponentId: canonical.id,
            locationId: line.locationId,
            additionalReserved: line.reservedQuantity,
            sourceSku: source.sku,
            canonicalSku: canonical.sku,
          });

          reservation.repointLine(line.id, canonical.id);
          repointed.push({
            reservationId: reservation.id,
            reservationNumber: reservation.reservationNumber,
            lineId: line.id,
            locationId: line.locationId,
            reservedQuantity: line.reservedQuantity,
          });
        }

        await this.reservations.save(reservation);

        const duplicateLocations = this.findDuplicateComponentLocations(
          reservation.lines,
        );
        if (duplicateLocations.length > 0) {
          warnings.push(
            `Reservation ${reservation.reservationNumber} now has more than one line for the consolidated component at location(s) ${duplicateLocations.join(', ')}. Quantities were preserved exactly and deliberately not summed.`,
          );
        }
      }
    }

    return {
      entity: 'inventory_reservation_lines',
      action: repointed.length > 0 ? 'REPOINT' : 'NONE',
      migratedCount: repointed.length,
      details: { repointedReservationLines: repointed },
      warnings,
    };
  }

  /**
   * Refuses a repoint that would leave the canonical component committing more
   * stock at a location than it holds.
   */
  private async assertAvailableAfterRepoint(input: {
    canonicalComponentId: string;
    locationId: string;
    additionalReserved: number;
    sourceSku: string;
    canonicalSku: string;
  }): Promise<void> {
    const projection = await this.projections.findByComponentAndLocation(
      input.canonicalComponentId,
      input.locationId,
    );
    const onHand = projection?.quantity ?? 0;

    const alreadyReserved = await this.totalReserved(
      input.canonicalComponentId,
      input.locationId,
    );
    const afterRepoint = alreadyReserved + input.additionalReserved;

    if (afterRepoint > onHand) {
      throw new ConsolidationAdapterBlockedError(
        this.id,
        `Repointing reservations from ${input.sourceSku} to ${input.canonicalSku} would reserve ${afterRepoint} at location ${input.locationId}, but only ${onHand} is on hand. Consolidation was rolled back rather than leaving an unfulfillable reservation.`,
        {
          canonicalComponentId: input.canonicalComponentId,
          locationId: input.locationId,
          onHand,
          alreadyReserved,
          additionalReserved: input.additionalReserved,
          reservedAfter: afterRepoint,
        },
      );
    }
  }

  private async totalReserved(
    componentId: string,
    locationId: string,
  ): Promise<number> {
    const reservations = await this.reservations.findMany({
      componentId,
      locationId,
    });

    let total = 0;
    for (const reservation of reservations) {
      if (!OPEN_RESERVATION_STATUSES.includes(reservation.status)) continue;
      for (const line of reservation.lines) {
        if (line.componentId !== componentId) continue;
        if (line.locationId !== locationId) continue;
        total += line.reservedQuantity - line.fulfilledQuantity;
      }
    }

    return total;
  }

  private findDuplicateComponentLocations(
    lines: Array<{ componentId: string; locationId: string }>,
  ): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const line of lines) {
      const key = `${line.componentId}::${line.locationId}`;
      if (seen.has(key)) duplicates.add(line.locationId);
      seen.add(key);
    }
    return [...duplicates].sort();
  }
}
