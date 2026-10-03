import { Module } from '@nestjs/common';
import { SpatialController } from './spatial.controller';
import { SpatialService } from './spatial.service';
import { SpatialLayoutController } from './spatial-layout.controller';
import { SpatialLayoutService } from './spatial-layout.service';
import {
  SPATIAL_MODEL_REPOSITORY,
  SPATIAL_ANCHOR_REPOSITORY,
  SPATIAL_NODE_REPOSITORY,
  SPATIAL_LAYOUT_REPOSITORY,
} from './spatial.tokens';
import {
  DrizzleSpatialModelRepository,
  DrizzleSpatialAnchorRepository,
  DrizzleSpatialNodeRepository,
} from '../infrastructure/repositories/drizzle-spatial.repository';
import { DrizzleSpatialLayoutRepository } from '../infrastructure/repositories/drizzle-spatial-layout.repository';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';
import { DrizzleLocationRepository } from '../infrastructure/repositories/drizzle-location.repository';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [InventoryProjectionsModule],
  controllers: [SpatialController, SpatialLayoutController],
  providers: [
    SpatialService,
    SpatialLayoutService,
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
      provide: SPATIAL_LAYOUT_REPOSITORY,
      useClass: DrizzleSpatialLayoutRepository,
    },
    {
      provide: LOCATION_REPOSITORY,
      useClass: DrizzleLocationRepository,
    },
  ],
  exports: [
    SpatialService,
    SpatialLayoutService,
    SPATIAL_MODEL_REPOSITORY,
    SPATIAL_ANCHOR_REPOSITORY,
    SPATIAL_NODE_REPOSITORY,
    SPATIAL_LAYOUT_REPOSITORY,
  ],
})
export class SpatialModule {}
