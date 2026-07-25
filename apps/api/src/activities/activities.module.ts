import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService, ACTIVITY_REPOSITORY } from './activities.service';
import { DrizzleActivityRepository } from '../infrastructure/repositories/drizzle-activity.repository';

@Module({
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    {
      provide: ACTIVITY_REPOSITORY,
      useClass: DrizzleActivityRepository,
    },
  ],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
