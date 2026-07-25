import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import {
  WorkOrdersService,
  WORK_ORDER_REPOSITORY,
} from './work-orders.service';
import { DrizzleWorkOrderRepository } from '../infrastructure/repositories/drizzle-work-order.repository';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';

@Module({
  imports: [ServiceRequestsModule],
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    {
      provide: WORK_ORDER_REPOSITORY,
      useClass: DrizzleWorkOrderRepository,
    },
  ],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
