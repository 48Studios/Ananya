import { db } from '@ananya/database';
import { materialRequirements } from '@ananya/database/schema';
import { eq, desc, gt } from '@ananya/database/query';
import type { MaterialRequirementRecord } from '@ananya/database/schema';
import {
  MaterialRequirement,
  type MaterialRequirementRepository,
  type RequirementSource,
  type FindManyMaterialRequirementsOptions,
} from '@ananya/mrp';

function toDomain(row: MaterialRequirementRecord): MaterialRequirement {
  return MaterialRequirement.rehydrate({
    id: row.id,
    planningRunId: row.planningRunId,
    componentId: row.componentId,
    requiredQuantity: parseFloat(row.requiredQuantity),
    availableQuantity: parseFloat(row.availableQuantity),
    reservedQuantity: parseFloat(row.reservedQuantity),
    shortageQuantity: parseFloat(row.shortageQuantity),
    requiredDate: row.requiredDate,
    source: row.source as RequirementSource,
    sourceReferenceId: row.sourceReferenceId ?? undefined,
    createdAt: row.createdAt,
  });
}

export class DrizzleMaterialRequirementRepository implements MaterialRequirementRepository {
  async findById(id: string): Promise<MaterialRequirement | null> {
    const [row] = await db
      .select()
      .from(materialRequirements)
      .where(eq(materialRequirements.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyMaterialRequirementsOptions,
  ): Promise<MaterialRequirement[]> {
    const query = db.select().from(materialRequirements);
    if (options?.planningRunId) {
      query.where(
        eq(materialRequirements.planningRunId, options.planningRunId),
      );
    }
    if (options?.componentId) {
      query.where(eq(materialRequirements.componentId, options.componentId));
    }
    if (options?.source) {
      query.where(eq(materialRequirements.source, options.source));
    }
    if (options?.onlyShortages) {
      query.where(gt(materialRequirements.shortageQuantity, '0'));
    }

    const rows = await query.orderBy(desc(materialRequirements.createdAt));
    return rows.map(toDomain);
  }

  async save(requirement: MaterialRequirement): Promise<void> {
    await db
      .insert(materialRequirements)
      .values({
        id: requirement.id,
        planningRunId: requirement.planningRunId,
        componentId: requirement.componentId,
        requiredQuantity: requirement.requiredQuantity.toString(),
        availableQuantity: requirement.availableQuantity.toString(),
        reservedQuantity: requirement.reservedQuantity.toString(),
        shortageQuantity: requirement.shortageQuantity.toString(),
        requiredDate: requirement.requiredDate,
        source: requirement.source,
        sourceReferenceId: requirement.sourceReferenceId ?? null,
      })
      .onConflictDoNothing();
  }

  async saveMany(requirements: MaterialRequirement[]): Promise<void> {
    if (requirements.length === 0) return;
    await db
      .insert(materialRequirements)
      .values(
        requirements.map((req) => ({
          id: req.id,
          planningRunId: req.planningRunId,
          componentId: req.componentId,
          requiredQuantity: req.requiredQuantity.toString(),
          availableQuantity: req.availableQuantity.toString(),
          reservedQuantity: req.reservedQuantity.toString(),
          shortageQuantity: req.shortageQuantity.toString(),
          requiredDate: req.requiredDate,
          source: req.source,
          sourceReferenceId: req.sourceReferenceId ?? null,
        })),
      )
      .onConflictDoNothing();
  }
}
