import { db } from '@ananya/database';
import {
  materialConsumptions,
  materialConsumptionLines,
} from '@ananya/database/schema';
import { eq, desc, count } from '@ananya/database/query';
import type {
  MaterialConsumptionRecord,
  MaterialConsumptionLineRecord,
} from '@ananya/database/schema';
import {
  MaterialConsumption,
  type MaterialConsumptionRepository,
  type ConsumptionStatus,
  type FindManyConsumptionsOptions,
} from '@ananya/manufacturing';

function toDomain(
  row: MaterialConsumptionRecord,
  lines: MaterialConsumptionLineRecord[] = [],
): MaterialConsumption {
  return MaterialConsumption.rehydrate({
    id: row.id,
    consumptionNumber: row.consumptionNumber,
    productionOrderId: row.productionOrderId,
    status: row.status as ConsumptionStatus,
    postedAt: row.postedAt,
    lines: lines.map((l) => ({
      id: l.id,
      consumptionId: l.consumptionId,
      componentId: l.componentId,
      locationId: l.locationId,
      quantityPlanned: parseFloat(l.quantityPlanned),
      quantityConsumed: parseFloat(l.quantityConsumed),
      batchNumber: l.batchNumber,
      serialNumbers: l.serialNumbers,
      consumedAt: l.consumedAt,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleMaterialConsumptionRepository implements MaterialConsumptionRepository {
  async findById(id: string): Promise<MaterialConsumption | null> {
    const [row] = await db
      .select()
      .from(materialConsumptions)
      .where(eq(materialConsumptions.id, id))
      .limit(1);
    if (!row) return null;
    const lines = await db
      .select()
      .from(materialConsumptionLines)
      .where(eq(materialConsumptionLines.consumptionId, id));
    return toDomain(row, lines);
  }

  async findByProductionOrderId(
    productionOrderId: string,
  ): Promise<MaterialConsumption[]> {
    const rows = await db
      .select()
      .from(materialConsumptions)
      .where(eq(materialConsumptions.productionOrderId, productionOrderId))
      .orderBy(desc(materialConsumptions.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(materialConsumptionLines)
          .where(eq(materialConsumptionLines.consumptionId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async findMany(
    options?: FindManyConsumptionsOptions,
  ): Promise<MaterialConsumption[]> {
    const query = db.select().from(materialConsumptions);
    if (options?.productionOrderId) {
      query.where(
        eq(materialConsumptions.productionOrderId, options.productionOrderId),
      );
    }
    const rows = await query.orderBy(desc(materialConsumptions.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(materialConsumptionLines)
          .where(eq(materialConsumptionLines.consumptionId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(consumption: MaterialConsumption): Promise<void> {
    await db
      .insert(materialConsumptions)
      .values({
        id: consumption.id,
        consumptionNumber: consumption.consumptionNumber,
        productionOrderId: consumption.productionOrderId,
        status: consumption.status,
        postedAt: consumption.postedAt ?? null,
      })
      .onConflictDoUpdate({
        target: materialConsumptions.id,
        set: {
          status: consumption.status,
          postedAt: consumption.postedAt ?? null,
          updatedAt: new Date(),
        },
      });

    for (const line of consumption.lines) {
      await db
        .insert(materialConsumptionLines)
        .values({
          id: line.id,
          consumptionId: consumption.id,
          componentId: line.componentId,
          locationId: line.locationId,
          quantityPlanned: line.quantityPlanned.toString(),
          quantityConsumed: line.quantityConsumed.toString(),
          batchNumber: line.batchNumber ?? null,
          serialNumbers: line.serialNumbers ?? null,
          consumedAt: line.consumedAt,
        })
        .onConflictDoUpdate({
          target: materialConsumptionLines.id,
          set: {
            quantityPlanned: line.quantityPlanned.toString(),
            quantityConsumed: line.quantityConsumed.toString(),
            batchNumber: line.batchNumber ?? null,
            serialNumbers: line.serialNumbers ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async generateNextConsumptionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: count() })
      .from(materialConsumptions);
    const num = (Number(result?.count ?? 0) + 1).toString().padStart(4, '0');
    return `MC-${year}-${num}`;
  }
}
