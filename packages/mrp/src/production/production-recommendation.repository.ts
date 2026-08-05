import {
  ProductionRecommendation,
  ProductionRecommendationStatus,
} from "./production-recommendation";

export interface FindManyProductionRecommendationsOptions {
  planningRunId?: string;
  productId?: string;
  status?: ProductionRecommendationStatus;
}

export interface ProductionRecommendationRepository {
  findById(id: string): Promise<ProductionRecommendation | null>;
  findMany(
    options?: FindManyProductionRecommendationsOptions,
  ): Promise<ProductionRecommendation[]>;
  save(recommendation: ProductionRecommendation): Promise<void>;
  saveMany(recommendations: ProductionRecommendation[]): Promise<void>;
}
