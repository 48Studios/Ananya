import { Module } from '@nestjs/common';
import {
  StockAdjustmentsService,
  STOCK_ADJUSTMENT_REPOSITORY,
} from './stock-adjustments.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { DrizzleStockAdjustmentRepository } from '../infrastructure/repositories/drizzle-stock-adjustment.repository';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryTransactionsModule, InventoryProjectionsModule],
  controllers: [StockAdjustmentsController],
  providers: [
    StockAdjustmentsService,
    {
      provide: STOCK_ADJUSTMENT_REPOSITORY,
      useClass: DrizzleStockAdjustmentRepository,
    },
  ],
  exports: [StockAdjustmentsService],
})
export class StockAdjustmentsModule {}
