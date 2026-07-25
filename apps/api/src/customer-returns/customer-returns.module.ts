import { Module } from '@nestjs/common';
import { CustomerReturnsController } from './customer-returns.controller';
import {
  CustomerReturnsService,
  CUSTOMER_RETURN_REPOSITORY,
} from './customer-returns.service';
import { DrizzleCustomerReturnRepository } from '../infrastructure/repositories/drizzle-customer-return.repository';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [
    SalesOrdersModule,
    InventoryTransactionsModule,
    InventoryProjectionsModule,
  ],
  controllers: [CustomerReturnsController],
  providers: [
    CustomerReturnsService,
    {
      provide: CUSTOMER_RETURN_REPOSITORY,
      useClass: DrizzleCustomerReturnRepository,
    },
  ],
  exports: [CustomerReturnsService],
})
export class CustomerReturnsModule {}
