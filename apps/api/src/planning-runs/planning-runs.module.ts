import { Module } from '@nestjs/common';
import { PlanningRunsController } from './planning-runs.controller';
import {
  PlanningRunsService,
  PLANNING_RUN_REPOSITORY,
  MATERIAL_REQUIREMENT_REPOSITORY,
  PURCHASE_RECOMMENDATION_REPOSITORY,
  PRODUCTION_RECOMMENDATION_REPOSITORY,
  CAPACITY_PLAN_REPOSITORY,
  PLANNING_MESSAGE_REPOSITORY,
} from './planning-runs.service';
import { DrizzlePlanningRunRepository } from '../infrastructure/repositories/drizzle-planning-run.repository';
import { DrizzleMaterialRequirementRepository } from '../infrastructure/repositories/drizzle-material-requirement.repository';
import { DrizzlePurchaseRecommendationRepository } from '../infrastructure/repositories/drizzle-purchase-recommendation.repository';
import { DrizzleProductionRecommendationRepository } from '../infrastructure/repositories/drizzle-production-recommendation.repository';
import { DrizzleCapacityPlanRepository } from '../infrastructure/repositories/drizzle-capacity-plan.repository';
import { DrizzlePlanningMessageRepository } from '../infrastructure/repositories/drizzle-planning-message.repository';
import { ComponentsModule } from '../components/components.module';
import { BomsModule } from '../boms/boms.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';

@Module({
  imports: [ComponentsModule, BomsModule, SalesOrdersModule],
  controllers: [PlanningRunsController],
  providers: [
    PlanningRunsService,
    {
      provide: PLANNING_RUN_REPOSITORY,
      useClass: DrizzlePlanningRunRepository,
    },
    {
      provide: MATERIAL_REQUIREMENT_REPOSITORY,
      useClass: DrizzleMaterialRequirementRepository,
    },
    {
      provide: PURCHASE_RECOMMENDATION_REPOSITORY,
      useClass: DrizzlePurchaseRecommendationRepository,
    },
    {
      provide: PRODUCTION_RECOMMENDATION_REPOSITORY,
      useClass: DrizzleProductionRecommendationRepository,
    },
    {
      provide: CAPACITY_PLAN_REPOSITORY,
      useClass: DrizzleCapacityPlanRepository,
    },
    {
      provide: PLANNING_MESSAGE_REPOSITORY,
      useClass: DrizzlePlanningMessageRepository,
    },
  ],
  exports: [PlanningRunsService],
})
export class PlanningRunsModule {}
