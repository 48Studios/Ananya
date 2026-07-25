import { Module } from '@nestjs/common';
import { RmaRequestsController } from './rma-requests.controller';
import {
  RmaRequestsService,
  RMA_REQUEST_REPOSITORY,
} from './rma-requests.service';
import { DrizzleRmaRequestRepository } from '../infrastructure/repositories/drizzle-rma-request.repository';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [RmaRequestsController],
  providers: [
    RmaRequestsService,
    {
      provide: RMA_REQUEST_REPOSITORY,
      useClass: DrizzleRmaRequestRepository,
    },
  ],
  exports: [RmaRequestsService],
})
export class RmaRequestsModule {}
