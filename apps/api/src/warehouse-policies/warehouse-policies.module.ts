import { Module } from '@nestjs/common';
import { WarehousePoliciesController } from './warehouse-policies.controller';
import {
  WarehousePoliciesService,
  WAREHOUSE_POLICY_REPOSITORY,
} from './warehouse-policies.service';
import { DrizzleWarehousePolicyRepository } from '../infrastructure/repositories/drizzle-warehouse-policy.repository';

@Module({
  controllers: [WarehousePoliciesController],
  providers: [
    WarehousePoliciesService,
    {
      provide: WAREHOUSE_POLICY_REPOSITORY,
      useClass: DrizzleWarehousePolicyRepository,
    },
  ],
  exports: [WarehousePoliciesService],
})
export class WarehousePoliciesModule {}
