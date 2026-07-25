import { Module } from '@nestjs/common';
import { ManufacturingTraceabilityController } from './manufacturing-traceability.controller';
import {
  ManufacturingTraceabilityService,
  MFG_TRACEABILITY_REPOSITORY,
} from './manufacturing-traceability.service';
import { DrizzleManufacturingTraceabilityRepository } from '../infrastructure/repositories/drizzle-manufacturing-traceability.repository';

@Module({
  controllers: [ManufacturingTraceabilityController],
  providers: [
    ManufacturingTraceabilityService,
    {
      provide: MFG_TRACEABILITY_REPOSITORY,
      useClass: DrizzleManufacturingTraceabilityRepository,
    },
  ],
  exports: [ManufacturingTraceabilityService],
})
export class ManufacturingTraceabilityModule {}
