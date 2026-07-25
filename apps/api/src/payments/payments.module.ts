import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService, PAYMENT_REPOSITORY } from './payments.service';
import { DrizzlePaymentRepository } from '../infrastructure/repositories/drizzle-payment.repository';
import { ReceivableInvoicesModule } from '../receivable-invoices/receivable-invoices.module';
import { PayableInvoicesModule } from '../payable-invoices/payable-invoices.module';

@Module({
  imports: [ReceivableInvoicesModule, PayableInvoicesModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_REPOSITORY,
      useClass: DrizzlePaymentRepository,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
