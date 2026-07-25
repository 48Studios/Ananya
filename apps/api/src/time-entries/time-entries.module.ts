import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import {
  TimeEntriesService,
  TIME_ENTRY_REPOSITORY,
} from './time-entries.service';
import { DrizzleTimeEntryRepository } from '../infrastructure/repositories/drizzle-time-entry.repository';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [TimeEntriesController],
  providers: [
    TimeEntriesService,
    {
      provide: TIME_ENTRY_REPOSITORY,
      useClass: DrizzleTimeEntryRepository,
    },
  ],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
