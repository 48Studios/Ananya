import { Module } from '@nestjs/common';
import { MaintenanceSchedulesController } from './maintenance-schedules.controller';
import {
  MaintenanceSchedulesService,
  MAINTENANCE_SCHEDULE_REPOSITORY,
} from './maintenance-schedules.service';
import { DrizzleMaintenanceScheduleRepository } from '../infrastructure/repositories/drizzle-maintenance-schedule.repository';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [MaintenanceSchedulesController],
  providers: [
    MaintenanceSchedulesService,
    {
      provide: MAINTENANCE_SCHEDULE_REPOSITORY,
      useClass: DrizzleMaintenanceScheduleRepository,
    },
  ],
  exports: [MaintenanceSchedulesService],
})
export class MaintenanceSchedulesModule {}
