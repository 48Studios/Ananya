import { db } from '@ananya/database';
import { purchaseRecommendations } from '@ananya/database/schema';
import { and, eq, desc } from '@ananya/database/query';
import type { PurchaseRecommendationRecord } from '@ananya/database/schema';
import {
  PurchaseRecommendation,
  type PurchaseRecommendationRepository,
  type PurchaseRecommendationStatus,
  type FindManyPurchaseRecommendationsOptions,
} from '@ananya/mrp';

function toDomain(row: PurchaseRecommendationRecord): PurchaseRecommendation {
  return PurchaseRecommendation.rehydrate({
    id: row.id,
    planningRunId: row.planningRunId,
    componentId: row.componentId,
    supplierId: row.supplierId ?? undefined,
    suggestedQuantity: parseFloat(row.suggestedQuantity),
    requiredDate: row.requiredDate,
    recommendationReason: row.recommendationReason,
    status: row.status as PurchaseRecommendationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePurchaseRecommendationRepository implements PurchaseRecommendationRepository {
  async findById(id: string): Promise<PurchaseRecommendation | null> {
    const [row] = await db
      .select()
      .from(purchaseRecommendations)
      .where(eq(purchaseRecommendations.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(
    options?: FindManyPurchaseRecommendationsOptions,
  ): Promise<PurchaseRecommendation[]> {
    const conditions = [];
    if (options?.planningRunId) {
      conditions.push(
        eq(purchaseRecommendations.planningRunId, options.planningRunId),
      );
    }
    if (options?.componentId) {
      conditions.push(
        eq(purchaseRecommendations.componentId, options.componentId),
      );
    }
    if (options?.supplierId) {
      conditions.push(
        eq(purchaseRecommendations.supplierId, options.supplierId),
      );
    }
    if (options?.status) {
      conditions.push(eq(purchaseRecommendations.status, options.status));
    }

    const rows = await db
      .select()
      .from(purchaseRecommendations)
      .where(and(...conditions))
      .orderBy(desc(purchaseRecommendations.createdAt));
    return rows.map(toDomain);
  }

  async save(recommendation: PurchaseRecommendation): Promise<void> {
    await db
      .insert(purchaseRecommendations)
      .values({
        id: recommendation.id,
        planningRunId: recommendation.planningRunId,
        componentId: recommendation.componentId,
        supplierId: recommendation.supplierId ?? null,
        suggestedQuantity: recommendation.suggestedQuantity.toString(),
        requiredDate: recommendation.requiredDate,
        recommendationReason: recommendation.recommendationReason,
        status: recommendation.status,
      })
      .onConflictDoUpdate({
        target: purchaseRecommendations.id,
        set: {
          status: recommendation.status,
          updatedAt: new Date(),
        },
      });
  }

  async saveMany(recommendations: PurchaseRecommendation[]): Promise<void> {
    if (recommendations.length === 0) return;
    await db
      .insert(purchaseRecommendations)
      .values(
        recommendations.map((rec) => ({
          id: rec.id,
          planningRunId: rec.planningRunId,
          componentId: rec.componentId,
          supplierId: rec.supplierId ?? null,
          suggestedQuantity: rec.suggestedQuantity.toString(),
          requiredDate: rec.requiredDate,
          recommendationReason: rec.recommendationReason,
          status: rec.status,
        })),
      )
      .onConflictDoNothing();
  }
}
