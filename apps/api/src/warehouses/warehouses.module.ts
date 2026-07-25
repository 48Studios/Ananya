import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService, WAREHOUSE_REPOSITORY } from './warehouses.service';
import { DrizzleWarehouseRepository } from '../infrastructure/repositories/drizzle-warehouse.repository';

@Module({
  controllers: [WarehousesController],
  providers: [
    WarehousesService,
    {
      provide: WAREHOUSE_REPOSITORY,
      useClass: DrizzleWarehouseRepository,
    },
  ],
  exports: [WarehousesService],
})
export class WarehousesModule {}
