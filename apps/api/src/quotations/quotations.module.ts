import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService, QUOTATION_REPOSITORY } from './quotations.service';
import { DrizzleQuotationRepository } from '../infrastructure/repositories/drizzle-quotation.repository';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [QuotationsController],
  providers: [
    QuotationsService,
    {
      provide: QUOTATION_REPOSITORY,
      useClass: DrizzleQuotationRepository,
    },
  ],
  exports: [QuotationsService],
})
export class QuotationsModule {}
