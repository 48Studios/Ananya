import {
  PurchaseRecommendation,
  PurchaseRecommendationStatus,
} from './purchase-recommendation';

export interface FindManyPurchaseRecommendationsOptions {
  planningRunId?: string;
  componentId?: string;
  supplierId?: string;
  status?: PurchaseRecommendationStatus;
}

export interface PurchaseRecommendationRepository {
  findById(id: string): Promise<PurchaseRecommendation | null>;
  findMany(
    options?: FindManyPurchaseRecommendationsOptions,
  ): Promise<PurchaseRecommendation[]>;
  save(recommendation: PurchaseRecommendation): Promise<void>;
  saveMany(recommendations: PurchaseRecommendation[]): Promise<void>;
}
