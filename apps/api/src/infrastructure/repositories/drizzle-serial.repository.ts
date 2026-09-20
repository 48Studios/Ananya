import { db, type DbExecutor } from '@ananya/database';
import { serials } from '@ananya/database/schema';
import type { Serial, SerialRepository } from '@ananya/inventory';
import { and, eq } from '@ananya/database/query';
import type { SerialRow } from '@ananya/database/schema';
import { Serial as SerialAggregate } from '@ananya/inventory';

function toDomain(row: SerialRow): Serial {
  return SerialAggregate.rehydrate({
    id: row.id,
    componentId: row.componentId,
    serialNumber: row.serialNumber,
    locationId: row.locationId ?? null,
    createdAt: row.createdAt,
  });
}

function toRow(serial: Serial): Omit<SerialRow, 'id' | 'createdAt'> {
  return {
    componentId: serial.componentId,
    serialNumber: serial.serialNumber,
    locationId: serial.locationId ?? null,
  };
}

export class DrizzleSerialRepository implements SerialRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<Serial | null> {
    const [row] = await this.client
      .select()
      .from(serials)
      .where(eq(serials.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findBySerialNumber(
    componentId: string,
    serialNumber: string,
  ): Promise<Serial | null> {
    const [row] = await this.client
      .select()
      .from(serials)
      .where(
        and(
          eq(serials.componentId, componentId),
          eq(serials.serialNumber, serialNumber),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findManyByComponent(componentId: string): Promise<Serial[]> {
    const rows = await this.client
      .select()
      .from(serials)
      .where(eq(serials.componentId, componentId));

    return rows.map(toDomain);
  }

  async save(serial: Serial): Promise<Serial> {
    const [row] = await this.client
      .insert(serials)
      .values(toRow(serial))
      .returning();

    if (!row) {
      throw new Error('Failed to create serial');
    }

    return toDomain(row);
  }

  async update(serial: Serial): Promise<Serial> {
    const [row] = await this.client
      .update(serials)
      .set({ componentId: serial.componentId })
      .where(eq(serials.id, serial.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update serial: ${serial.id}`);
    }

    return toDomain(row);
  }
}
