import { Module } from '@nestjs/common';
import { ProductionRecommendationsController } from './production-recommendations.controller';
import {
  ProductionRecommendationsService,
  PRODUCTION_RECOMMENDATION_REPOSITORY,
} from './production-recommendations.service';
import { DrizzleProductionRecommendationRepository } from '../infrastructure/repositories/drizzle-production-recommendation.repository';

@Module({
  controllers: [ProductionRecommendationsController],
  providers: [
    ProductionRecommendationsService,
    {
      provide: PRODUCTION_RECOMMENDATION_REPOSITORY,
      useClass: DrizzleProductionRecommendationRepository,
    },
  ],
  exports: [ProductionRecommendationsService],
})
export class ProductionRecommendationsModule {}
