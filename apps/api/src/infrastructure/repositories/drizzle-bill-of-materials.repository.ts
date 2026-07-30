import { db } from '@ananya/database';
import { billOfMaterials, billOfMaterialLines } from '@ananya/database/schema';
import { eq, desc, and } from '@ananya/database/query';
import type {
  BillOfMaterialsRecord,
  BillOfMaterialLineRecord,
} from '@ananya/database/schema';
import {
  BillOfMaterials,
  type BillOfMaterialsRepository,
  type BomStatus,
  type FindManyBomsOptions,
} from '@ananya/manufacturing';

function toDomain(
  row: BillOfMaterialsRecord,
  lines: BillOfMaterialLineRecord[] = [],
): BillOfMaterials {
  return BillOfMaterials.rehydrate({
    id: row.id,
    componentId: row.componentId,
    revision: row.revision,
    status: row.status as BomStatus,
    notes: row.notes,
    releasedAt: row.releasedAt,
    lines: lines.map((l) => ({
      id: l.id,
      bomId: l.bomId,
      componentId: l.componentId,
      quantityPerUnit: parseFloat(l.quantityPerUnit),
      unitOfMeasure: l.unitOfMeasure,
      scrapFactorPercent: parseFloat(l.scrapFactorPercent),
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleBillOfMaterialsRepository implements BillOfMaterialsRepository {
  async findById(id: string): Promise<BillOfMaterials | null> {
    const [row] = await db
      .select()
      .from(billOfMaterials)
      .where(eq(billOfMaterials.id, id))
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(billOfMaterialLines)
      .where(eq(billOfMaterialLines.bomId, id));

    return toDomain(row, lines);
  }

  async findActiveByComponentId(
    componentId: string,
  ): Promise<BillOfMaterials | null> {
    const [row] = await db
      .select()
      .from(billOfMaterials)
      .where(
        and(
          eq(billOfMaterials.componentId, componentId),
          eq(billOfMaterials.status, 'RELEASED'),
        ),
      )
      .limit(1);

    if (!row) return null;

    const lines = await db
      .select()
      .from(billOfMaterialLines)
      .where(eq(billOfMaterialLines.bomId, row.id));

    return toDomain(row, lines);
  }

  async findRevisionsByComponentId(
    componentId: string,
  ): Promise<BillOfMaterials[]> {
    const rows = await db
      .select()
      .from(billOfMaterials)
      .where(eq(billOfMaterials.componentId, componentId))
      .orderBy(desc(billOfMaterials.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(billOfMaterialLines)
          .where(eq(billOfMaterialLines.bomId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async findMany(options?: FindManyBomsOptions): Promise<BillOfMaterials[]> {
    const query = db.select().from(billOfMaterials);

    if (options?.componentId) {
      query.where(eq(billOfMaterials.componentId, options.componentId));
    }
    if (options?.status) {
      query.where(eq(billOfMaterials.status, options.status));
    }

    const rows = await query.orderBy(desc(billOfMaterials.createdAt));

    return Promise.all(
      rows.map(async (row) => {
        const lines = await db
          .select()
          .from(billOfMaterialLines)
          .where(eq(billOfMaterialLines.bomId, row.id));
        return toDomain(row, lines);
      }),
    );
  }

  async save(bom: BillOfMaterials): Promise<void> {
    await db
      .insert(billOfMaterials)
      .values({
        id: bom.id,
        componentId: bom.componentId,
        revision: bom.revision,
        status: bom.status,
        notes: bom.notes ?? null,
        releasedAt: bom.releasedAt ?? null,
      })
      .onConflictDoUpdate({
        target: billOfMaterials.id,
        set: {
          status: bom.status,
          notes: bom.notes ?? null,
          releasedAt: bom.releasedAt ?? null,
          updatedAt: new Date(),
        },
      });

    // Synchronize lines: delete existing and re-insert
    await db
      .delete(billOfMaterialLines)
      .where(eq(billOfMaterialLines.bomId, bom.id));

    for (const line of bom.lines) {
      await db.insert(billOfMaterialLines).values({
        id: line.id,
        bomId: bom.id,
        componentId: line.componentId,
        quantityPerUnit: line.quantityPerUnit.toString(),
        unitOfMeasure: line.unitOfMeasure,
        scrapFactorPercent: line.scrapFactorPercent.toString(),
        notes: line.notes ?? null,
      });
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(billOfMaterials).where(eq(billOfMaterials.id, id));
  }
}
