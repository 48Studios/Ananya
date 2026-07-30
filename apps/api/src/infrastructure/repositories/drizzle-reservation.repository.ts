import { db } from '@ananya/database';
import {
  inventoryReservations,
  inventoryReservationLines,
} from '@ananya/database/schema';
import type {
  InventoryReservationRecord,
  InventoryReservationLineRecord,
} from '@ananya/database/schema';
import {
  Reservation as ReservationAggregate,
  ReservationStatus,
  type Reservation,
  type ReservationRepository,
  type ReservationType,
  type FindManyReservationsOptions,
} from '@ananya/inventory';
import { and, eq, count, desc, ilike, or } from '@ananya/database/query';

function toDomain(
  row: InventoryReservationRecord,
  lines: InventoryReservationLineRecord[] = [],
): Reservation {
  return ReservationAggregate.rehydrate({
    id: row.id,
    reservationNumber: row.reservationNumber,
    reservationType: row.reservationType as ReservationType,
    referenceDocument: row.referenceDocument,
    reservedBy: row.reservedBy,
    status: row.status as ReservationStatus,
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      reservationId: l.reservationId,
      componentId: l.componentId,
      locationId: l.locationId,
      reservedQuantity: parseFloat(l.reservedQuantity),
      fulfilledQuantity: parseFloat(l.fulfilledQuantity),
      unitOfMeasure: l.unitOfMeasure,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  });
}

export class DrizzleReservationRepository implements ReservationRepository {
  async findById(id: string): Promise<Reservation | null> {
    const [row] = await db
      .select()
      .from(inventoryReservations)
      .where(eq(inventoryReservations.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(inventoryReservationLines)
      .where(eq(inventoryReservationLines.reservationId, id));

    return toDomain(row, lines);
  }

  async findByReservationNumber(
    reservationNumber: string,
  ): Promise<Reservation | null> {
    const [row] = await db
      .select()
      .from(inventoryReservations)
      .where(
        eq(
          inventoryReservations.reservationNumber,
          reservationNumber.toUpperCase(),
        ),
      )
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(inventoryReservationLines)
      .where(eq(inventoryReservationLines.reservationId, row.id));

    return toDomain(row, lines);
  }

  async findMany(
    options?: FindManyReservationsOptions,
  ): Promise<Reservation[]> {
    const query = db.select().from(inventoryReservations);

    if (options?.reservationType) {
      query.where(
        eq(inventoryReservations.reservationType, options.reservationType),
      );
    }
    if (options?.status) {
      query.where(eq(inventoryReservations.status, options.status));
    }
    if (options?.referenceDocument) {
      query.where(
        ilike(
          inventoryReservations.referenceDocument,
          `%${options.referenceDocument}%`,
        ),
      );
    }
    if (options?.search) {
      const pattern = `%${options.search}%`;
      query.where(
        or(
          ilike(inventoryReservations.reservationNumber, pattern),
          ilike(inventoryReservations.referenceDocument, pattern),
          ilike(inventoryReservations.reservedBy, pattern),
          ilike(inventoryReservations.notes, pattern),
        ),
      );
    }

    const rows = await query.orderBy(desc(inventoryReservations.createdAt));

    let result = await Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(inventoryReservationLines)
          .where(eq(inventoryReservationLines.reservationId, row.id));
        return toDomain(row, lines);
      }),
    );

    if (options?.componentId) {
      result = result.filter((r) =>
        r.lines.some((l) => l.componentId === options.componentId),
      );
    }
    if (options?.locationId) {
      result = result.filter((r) =>
        r.lines.some((l) => l.locationId === options.locationId),
      );
    }

    return result;
  }

  async findActiveByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<Reservation[]> {
    const lines = await db
      .select()
      .from(inventoryReservationLines)
      .where(
        and(
          eq(inventoryReservationLines.componentId, componentId),
          eq(inventoryReservationLines.locationId, locationId),
        ),
      );

    if (lines.length === 0) return [];

    const reservationIds = Array.from(
      new Set(lines.map((l) => l.reservationId)),
    );
    const activeReservations: Reservation[] = [];

    for (const resId of reservationIds) {
      const res = await this.findById(resId);
      if (res && res.status === ReservationStatus.Active) {
        activeReservations.push(res);
      }
    }

    return activeReservations;
  }

  async save(reservation: Reservation): Promise<Reservation> {
    await db
      .insert(inventoryReservations)
      .values({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        reservationType: reservation.reservationType,
        referenceDocument: reservation.referenceDocument ?? null,
        reservedBy: reservation.reservedBy,
        status: reservation.status,
        notes: reservation.notes ?? null,
        expiresAt: reservation.expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: inventoryReservations.id,
        set: {
          reservationType: reservation.reservationType,
          referenceDocument: reservation.referenceDocument ?? null,
          reservedBy: reservation.reservedBy,
          status: reservation.status,
          notes: reservation.notes ?? null,
          expiresAt: reservation.expiresAt ?? null,
          updatedAt: new Date(),
        },
      });

    // Replace line items
    await db
      .delete(inventoryReservationLines)
      .where(eq(inventoryReservationLines.reservationId, reservation.id));

    for (const line of reservation.lines) {
      await db.insert(inventoryReservationLines).values({
        id: line.id,
        reservationId: reservation.id,
        componentId: line.componentId,
        locationId: line.locationId,
        reservedQuantity: line.reservedQuantity.toString(),
        fulfilledQuantity: line.fulfilledQuantity.toString(),
        unitOfMeasure: line.unitOfMeasure || 'pcs',
        notes: line.notes ?? null,
      });
    }

    const saved = await this.findById(reservation.id);
    if (!saved) throw new Error('Failed to save reservation');
    return saved;
  }

  async delete(id: string): Promise<void> {
    await db
      .delete(inventoryReservations)
      .where(eq(inventoryReservations.id, id));
  }

  async generateNextReservationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(inventoryReservations);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `RES-${year}-${num}`;
  }
}
