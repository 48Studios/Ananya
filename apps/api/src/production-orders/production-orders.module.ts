import { Module } from '@nestjs/common';
import { ProductionOrdersController } from './production-orders.controller';
import {
  ProductionOrdersService,
  PRODUCTION_ORDER_REPOSITORY,
} from './production-orders.service';
import { DrizzleProductionOrderRepository } from '../infrastructure/repositories/drizzle-production-order.repository';

@Module({
  controllers: [ProductionOrdersController],
  providers: [
    ProductionOrdersService,
    {
      provide: PRODUCTION_ORDER_REPOSITORY,
      useClass: DrizzleProductionOrderRepository,
    },
  ],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
