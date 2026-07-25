import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService, CUSTOMER_REPOSITORY } from './customers.service';
import { DrizzleCustomerRepository } from '../infrastructure/repositories/drizzle-customer.repository';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    {
      provide: CUSTOMER_REPOSITORY,
      useClass: DrizzleCustomerRepository,
    },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
