import { Module } from '@nestjs/common';
import { ServiceRequestsController } from './service-requests.controller';
import {
  ServiceRequestsService,
  SERVICE_REQUEST_REPOSITORY,
} from './service-requests.service';
import { DrizzleServiceRequestRepository } from '../infrastructure/repositories/drizzle-service-request.repository';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [ServiceRequestsController],
  providers: [
    ServiceRequestsService,
    {
      provide: SERVICE_REQUEST_REPOSITORY,
      useClass: DrizzleServiceRequestRepository,
    },
  ],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
