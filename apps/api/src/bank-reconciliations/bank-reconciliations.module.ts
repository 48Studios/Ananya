import { Module } from '@nestjs/common';
import { BankReconciliationsController } from './bank-reconciliations.controller';
import {
  BankReconciliationsService,
  BANK_RECONCILIATION_REPOSITORY,
} from './bank-reconciliations.service';
import { DrizzleBankReconciliationRepository } from '../infrastructure/repositories/drizzle-bank-reconciliation.repository';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [BankReconciliationsController],
  providers: [
    BankReconciliationsService,
    {
      provide: BANK_RECONCILIATION_REPOSITORY,
      useClass: DrizzleBankReconciliationRepository,
    },
  ],
  exports: [BankReconciliationsService],
})
export class BankReconciliationsModule {}
