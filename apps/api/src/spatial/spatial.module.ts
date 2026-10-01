import { Module } from '@nestjs/common';
import { SpatialController } from './spatial.controller';
import { SpatialService } from './spatial.service';
import {
  SPATIAL_MODEL_REPOSITORY,
  SPATIAL_ANCHOR_REPOSITORY,
  SPATIAL_NODE_REPOSITORY,
} from './spatial.tokens';
import {
  DrizzleSpatialModelRepository,
  DrizzleSpatialAnchorRepository,
  DrizzleSpatialNodeRepository,
} from '../infrastructure/repositories/drizzle-spatial.repository';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';
import { DrizzleLocationRepository } from '../infrastructure/repositories/drizzle-location.repository';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryProjectionsModule],
  controllers: [SpatialController],
  providers: [
    SpatialService,
    {
      provide: SPATIAL_MODEL_REPOSITORY,
      useClass: DrizzleSpatialModelRepository,
    },
    {
      provide: SPATIAL_ANCHOR_REPOSITORY,
      useClass: DrizzleSpatialAnchorRepository,
    },
    {
      provide: SPATIAL_NODE_REPOSITORY,
      useClass: DrizzleSpatialNodeRepository,
    },
    {
      provide: LOCATION_REPOSITORY,
      useClass: DrizzleLocationRepository,
    },
  ],
  exports: [
    SpatialService,
    SPATIAL_MODEL_REPOSITORY,
    SPATIAL_ANCHOR_REPOSITORY,
    SPATIAL_NODE_REPOSITORY,
  ],
})
export class SpatialModule {}
