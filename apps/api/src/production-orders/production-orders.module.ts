import { Module } from '@nestjs/common';
import { ProductionOrdersController } from './production-orders.controller';
import {
  ProductionOrdersService,
  PRODUCTION_ORDER_REPOSITORY,
} from './production-orders.service';
import { DrizzleProductionOrderRepository } from '../infrastructure/repositories/drizzle-production-order.repository';
import { BomsModule } from '../boms/boms.module';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [
    BomsModule,
    InventoryTransactionsModule,
    InventoryProjectionsModule,
  ],
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
