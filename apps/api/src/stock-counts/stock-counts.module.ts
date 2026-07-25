import { Module } from '@nestjs/common';
import { StockCountsController } from './stock-counts.controller';
import {
  StockCountsService,
  STOCK_COUNT_REPOSITORY,
} from './stock-counts.service';
import { DrizzleStockCountRepository } from '../infrastructure/repositories/drizzle-stock-count.repository';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryTransactionsModule, InventoryProjectionsModule],
  controllers: [StockCountsController],
  providers: [
    StockCountsService,
    {
      provide: STOCK_COUNT_REPOSITORY,
      useClass: DrizzleStockCountRepository,
    },
  ],
  exports: [StockCountsService],
})
export class StockCountsModule {}
