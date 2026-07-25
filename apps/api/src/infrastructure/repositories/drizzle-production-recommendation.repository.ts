import { db } from '@ananya/database';
import { productionRecommendations } from '@ananya/database/schema';
import { eq, desc } from '@ananya/database/query';
import type { ProductionRecommendationRecord } from '@ananya/database/schema';
import {
  ProductionRecommendation,
  type ProductionRecommendationRepository,
  type ProductionRecommendationStatus,
  type FindManyProductionRecommendationsOptions,
} from '@ananya/mrp';

function toDomain(
  row: ProductionRecommendationRecord,
): ProductionRecommendation {
  return ProductionRecommendation.rehydrate({
    id: row.id,
    planningRunId: row.planningRunId,
    productId: row.productId,
    suggestedQuantity: parseFloat(row.suggestedQuantity),
    suggestedStart: row.suggestedStart,
    suggestedCompletion: row.suggestedCompletion,
    manufacturingRoute: row.manufacturingRoute ?? undefined,
    status: row.status as ProductionRecommendationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProductionRecommendationRepository implements ProductionRecommendationRepository {
  async findById(id: string): Promise<ProductionRecommendation | null> {
    const [row] = await db
      .select()
      .from(productionRecommendations)
      .where(eq(productionRecommendations.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyProductionRecommendationsOptions,
  ): Promise<ProductionRecommendation[]> {
    const query = db.select().from(productionRecommendations);
    if (options?.planningRunId) {
      query.where(
        eq(productionRecommendations.planningRunId, options.planningRunId),
      );
    }
    if (options?.productId) {
      query.where(eq(productionRecommendations.productId, options.productId));
    }
    if (options?.status) {
      query.where(eq(productionRecommendations.status, options.status));
    }

    const rows = await query.orderBy(desc(productionRecommendations.createdAt));
    return rows.map(toDomain);
  }

  async save(recommendation: ProductionRecommendation): Promise<void> {
    await db
      .insert(productionRecommendations)
      .values({
        id: recommendation.id,
        planningRunId: recommendation.planningRunId,
        productId: recommendation.productId,
        suggestedQuantity: recommendation.suggestedQuantity.toString(),
        suggestedStart: recommendation.suggestedStart,
        suggestedCompletion: recommendation.suggestedCompletion,
        manufacturingRoute: recommendation.manufacturingRoute ?? null,
        status: recommendation.status,
      })
      .onConflictDoUpdate({
        target: productionRecommendations.id,
        set: {
          status: recommendation.status,
          updatedAt: new Date(),
        },
      });
  }

  async saveMany(recommendations: ProductionRecommendation[]): Promise<void> {
    if (recommendations.length === 0) return;
    await db
      .insert(productionRecommendations)
      .values(
        recommendations.map((rec) => ({
          id: rec.id,
          planningRunId: rec.planningRunId,
          productId: rec.productId,
          suggestedQuantity: rec.suggestedQuantity.toString(),
          suggestedStart: rec.suggestedStart,
          suggestedCompletion: rec.suggestedCompletion,
          manufacturingRoute: rec.manufacturingRoute ?? null,
          status: rec.status,
        })),
      )
      .onConflictDoNothing();
  }
}
