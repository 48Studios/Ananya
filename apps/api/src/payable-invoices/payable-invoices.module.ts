import { Module } from '@nestjs/common';
import { PayableInvoicesController } from './payable-invoices.controller';
import {
  PayableInvoicesService,
  PAYABLE_INVOICE_REPOSITORY,
} from './payable-invoices.service';
import { DrizzlePayableInvoiceRepository } from '../infrastructure/repositories/drizzle-payable-invoice.repository';

@Module({
  controllers: [PayableInvoicesController],
  providers: [
    PayableInvoicesService,
    {
      provide: PAYABLE_INVOICE_REPOSITORY,
      useClass: DrizzlePayableInvoiceRepository,
    },
  ],
  exports: [PayableInvoicesService],
})
export class PayableInvoicesModule {}
