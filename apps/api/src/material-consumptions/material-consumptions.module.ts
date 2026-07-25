import { Module } from '@nestjs/common';
import { MaterialConsumptionsController } from './material-consumptions.controller';
import {
  MaterialConsumptionsService,
  MATERIAL_CONSUMPTION_REPOSITORY,
  TRACEABILITY_REPOSITORY_FOR_CONSUMPTION,
} from './material-consumptions.service';
import { DrizzleMaterialConsumptionRepository } from '../infrastructure/repositories/drizzle-material-consumption.repository';
import { DrizzleManufacturingTraceabilityRepository } from '../infrastructure/repositories/drizzle-manufacturing-traceability.repository';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryTransactionsModule, InventoryProjectionsModule],
  controllers: [MaterialConsumptionsController],
  providers: [
    MaterialConsumptionsService,
    {
      provide: MATERIAL_CONSUMPTION_REPOSITORY,
      useClass: DrizzleMaterialConsumptionRepository,
    },
    {
      provide: TRACEABILITY_REPOSITORY_FOR_CONSUMPTION,
      useClass: DrizzleManufacturingTraceabilityRepository,
    },
  ],
  exports: [MaterialConsumptionsService],
})
export class MaterialConsumptionsModule {}
