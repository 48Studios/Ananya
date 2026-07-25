import { Module } from '@nestjs/common';
import { PurchaseRecommendationsController } from './purchase-recommendations.controller';
import {
  PurchaseRecommendationsService,
  PURCHASE_RECOMMENDATION_REPOSITORY,
} from './purchase-recommendations.service';
import { DrizzlePurchaseRecommendationRepository } from '../infrastructure/repositories/drizzle-purchase-recommendation.repository';

@Module({
  controllers: [PurchaseRecommendationsController],
  providers: [
    PurchaseRecommendationsService,
    {
      provide: PURCHASE_RECOMMENDATION_REPOSITORY,
      useClass: DrizzlePurchaseRecommendationRepository,
    },
  ],
  exports: [PurchaseRecommendationsService],
})
export class PurchaseRecommendationsModule {}
