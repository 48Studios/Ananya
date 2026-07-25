import { Module } from '@nestjs/common';
import { FinishedGoodsController } from './finished-goods.controller';
import {
  FinishedGoodsService,
  FGR_REPOSITORY,
  TRACEABILITY_REPOSITORY_FOR_FGR,
} from './finished-goods.service';
import { DrizzleFinishedGoodsReceiptRepository } from '../infrastructure/repositories/drizzle-finished-goods-receipt.repository';
import { DrizzleManufacturingTraceabilityRepository } from '../infrastructure/repositories/drizzle-manufacturing-traceability.repository';
import { DrizzleProductionOrderRepository } from '../infrastructure/repositories/drizzle-production-order.repository';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';
import { PRODUCTION_ORDER_REPOSITORY } from '../production-orders/production-orders.service';

@Module({
  imports: [InventoryTransactionsModule, InventoryProjectionsModule],
  controllers: [FinishedGoodsController],
  providers: [
    FinishedGoodsService,
    {
      provide: FGR_REPOSITORY,
      useClass: DrizzleFinishedGoodsReceiptRepository,
    },
    {
      provide: TRACEABILITY_REPOSITORY_FOR_FGR,
      useClass: DrizzleManufacturingTraceabilityRepository,
    },
    {
      provide: PRODUCTION_ORDER_REPOSITORY,
      useClass: DrizzleProductionOrderRepository,
    },
  ],
  exports: [FinishedGoodsService],
})
export class FinishedGoodsModule {}
