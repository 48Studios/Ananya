import { Module } from '@nestjs/common';
import { WarehouseTransfersController } from './warehouse-transfers.controller';
import {
  WarehouseTransfersService,
  WAREHOUSE_TRANSFER_REPOSITORY,
} from './warehouse-transfers.service';
import { DrizzleWarehouseTransferRepository } from '../infrastructure/repositories/drizzle-warehouse-transfer.repository';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryTransactionsModule, InventoryProjectionsModule],
  controllers: [WarehouseTransfersController],
  providers: [
    WarehouseTransfersService,
    {
      provide: WAREHOUSE_TRANSFER_REPOSITORY,
      useClass: DrizzleWarehouseTransferRepository,
    },
  ],
  exports: [WarehouseTransfersService],
})
export class WarehouseTransfersModule {}
