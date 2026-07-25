import { Module } from '@nestjs/common';
import { SalesOrdersController } from './sales-orders.controller';
import {
  SalesOrdersService,
  SALES_ORDER_REPOSITORY,
} from './sales-orders.service';
import { DrizzleSalesOrderRepository } from '../infrastructure/repositories/drizzle-sales-order.repository';
import { CustomersModule } from '../customers/customers.module';
import { QuotationsModule } from '../quotations/quotations.module';

@Module({
  imports: [CustomersModule, QuotationsModule],
  controllers: [SalesOrdersController],
  providers: [
    SalesOrdersService,
    {
      provide: SALES_ORDER_REPOSITORY,
      useClass: DrizzleSalesOrderRepository,
    },
  ],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
