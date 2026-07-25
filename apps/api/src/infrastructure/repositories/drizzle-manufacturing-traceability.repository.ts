import { db } from '@ananya/database';
import { manufacturingTraceability } from '@ananya/database/schema';
import { eq, desc, sql } from '@ananya/database/query';
import type { ManufacturingTraceabilityRecord } from '@ananya/database/schema';
import {
  ManufacturingTraceability,
  type ManufacturingTraceabilityRepository,
  type TraceabilityEventType,
} from '@ananya/manufacturing';

function toDomain(
  row: ManufacturingTraceabilityRecord,
): ManufacturingTraceability {
  return ManufacturingTraceability.rehydrate({
    id: row.id,
    eventType: row.eventType as TraceabilityEventType,
    productionOrderId: row.productionOrderId,
    consumptionId: row.consumptionId,
    fgrId: row.fgrId,
    componentId: row.componentId,
    locationId: row.locationId,
    quantity: parseFloat(row.quantity),
    batchNumber: row.batchNumber,
    serialNumbers: row.serialNumbers,
    createdAt: row.createdAt,
  });
}

export class DrizzleManufacturingTraceabilityRepository implements ManufacturingTraceabilityRepository {
  async findByProductionOrderId(
    productionOrderId: string,
  ): Promise<ManufacturingTraceability[]> {
    const rows = await db
      .select()
      .from(manufacturingTraceability)
      .where(eq(manufacturingTraceability.productionOrderId, productionOrderId))
      .orderBy(desc(manufacturingTraceability.createdAt));
    return rows.map(toDomain);
  }

  async findByFinishedGoodsComponentId(
    componentId: string,
  ): Promise<ManufacturingTraceability[]> {
    const rows = await db
      .select()
      .from(manufacturingTraceability)
      .where(eq(manufacturingTraceability.componentId, componentId))
      .orderBy(desc(manufacturingTraceability.createdAt));
    return rows.map(toDomain);
  }

  async findByConsumedComponentId(
    componentId: string,
  ): Promise<ManufacturingTraceability[]> {
    const rows = await db
      .select()
      .from(manufacturingTraceability)
      .where(eq(manufacturingTraceability.componentId, componentId))
      .orderBy(desc(manufacturingTraceability.createdAt));
    return rows.map(toDomain);
  }

  async findByBatchNumber(
    batchNumber: string,
  ): Promise<ManufacturingTraceability[]> {
    const rows = await db
      .select()
      .from(manufacturingTraceability)
      .where(eq(manufacturingTraceability.batchNumber, batchNumber))
      .orderBy(desc(manufacturingTraceability.createdAt));
    return rows.map(toDomain);
  }

  async findBySerialNumber(
    serialNumber: string,
  ): Promise<ManufacturingTraceability[]> {
    const rows = await db
      .select()
      .from(manufacturingTraceability)
      .where(
        sql`${serialNumber} = ANY(${manufacturingTraceability.serialNumbers})`,
      )
      .orderBy(desc(manufacturingTraceability.createdAt));
    return rows.map(toDomain);
  }

  async save(record: ManufacturingTraceability): Promise<void> {
    await db.insert(manufacturingTraceability).values({
      id: record.id,
      eventType: record.eventType,
      productionOrderId: record.productionOrderId,
      consumptionId: record.consumptionId ?? null,
      fgrId: record.fgrId ?? null,
      componentId: record.componentId,
      locationId: record.locationId ?? null,
      quantity: record.quantity.toString(),
      batchNumber: record.batchNumber ?? null,
      serialNumbers: record.serialNumbers ?? null,
    });
  }

  async saveMany(records: ManufacturingTraceability[]): Promise<void> {
    if (records.length === 0) return;
    await db.insert(manufacturingTraceability).values(
      records.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        productionOrderId: r.productionOrderId,
        consumptionId: r.consumptionId ?? null,
        fgrId: r.fgrId ?? null,
        componentId: r.componentId,
        locationId: r.locationId ?? null,
        quantity: r.quantity.toString(),
        batchNumber: r.batchNumber ?? null,
        serialNumbers: r.serialNumbers ?? null,
      })),
    );
  }
}
