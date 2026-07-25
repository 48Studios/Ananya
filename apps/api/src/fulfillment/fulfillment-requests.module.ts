import { Module } from '@nestjs/common';
import { FulfillmentRequestsController } from './fulfillment-requests.controller';
import {
  FulfillmentRequestsService,
  FULFILLMENT_REQUEST_REPOSITORY,
} from './fulfillment-requests.service';
import { DrizzleFulfillmentRequestRepository } from '../infrastructure/repositories/drizzle-fulfillment-request.repository';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [
    SalesOrdersModule,
    InventoryTransactionsModule,
    InventoryProjectionsModule,
  ],
  controllers: [FulfillmentRequestsController],
  providers: [
    FulfillmentRequestsService,
    {
      provide: FULFILLMENT_REQUEST_REPOSITORY,
      useClass: DrizzleFulfillmentRequestRepository,
    },
  ],
  exports: [FulfillmentRequestsService],
})
export class FulfillmentRequestsModule {}
