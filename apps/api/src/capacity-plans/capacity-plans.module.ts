import { Module } from '@nestjs/common';
import { CapacityPlansController } from './capacity-plans.controller';
import {
  CapacityPlansService,
  CAPACITY_PLAN_REPOSITORY,
} from './capacity-plans.service';
import { DrizzleCapacityPlanRepository } from '../infrastructure/repositories/drizzle-capacity-plan.repository';

@Module({
  controllers: [CapacityPlansController],
  providers: [
    CapacityPlansService,
    {
      provide: CAPACITY_PLAN_REPOSITORY,
      useClass: DrizzleCapacityPlanRepository,
    },
  ],
  exports: [CapacityPlansService],
})
export class CapacityPlansModule {}
