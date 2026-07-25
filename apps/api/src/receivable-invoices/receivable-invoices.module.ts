import { Module } from '@nestjs/common';
import { ReceivableInvoicesController } from './receivable-invoices.controller';
import {
  ReceivableInvoicesService,
  RECEIVABLE_INVOICE_REPOSITORY,
} from './receivable-invoices.service';
import { DrizzleReceivableInvoiceRepository } from '../infrastructure/repositories/drizzle-receivable-invoice.repository';

@Module({
  controllers: [ReceivableInvoicesController],
  providers: [
    ReceivableInvoicesService,
    {
      provide: RECEIVABLE_INVOICE_REPOSITORY,
      useClass: DrizzleReceivableInvoiceRepository,
    },
  ],
  exports: [ReceivableInvoicesService],
})
export class ReceivableInvoicesModule {}
