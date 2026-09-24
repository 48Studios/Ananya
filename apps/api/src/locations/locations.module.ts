import { Module } from '@nestjs/common';
import { DrizzleLocationRepository } from '../infrastructure/repositories/drizzle-location.repository';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LOCATION_REPOSITORY } from './location.tokens';

@Module({
  controllers: [LocationsController],
  providers: [
    LocationsService,
    {
      provide: LOCATION_REPOSITORY,
      useClass: DrizzleLocationRepository,
    },
  ],
  exports: [LocationsService],
})
export class LocationsModule {}
