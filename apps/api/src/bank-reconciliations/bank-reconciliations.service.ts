import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  BankReconciliation,
  BankReconciliationRepository,
  ReconciliationStatus,
} from '@ananya/finance';
import {
  CreateBankReconciliationDto,
  AddBankTransactionDto,
  MatchTransactionDto,
} from './dtos';
import { PaymentsService } from '../payments/payments.service';

export const BANK_RECONCILIATION_REPOSITORY = 'BANK_RECONCILIATION_REPOSITORY';

@Injectable()
export class BankReconciliationsService {
  constructor(
    @Inject(BANK_RECONCILIATION_REPOSITORY)
    private readonly reconRepository: BankReconciliationRepository,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(dto: CreateBankReconciliationDto): Promise<BankReconciliation> {
    const reconciliation = BankReconciliation.create({
      bankAccountId: dto.bankAccountId,
      statementDate: new Date(dto.statementDate),
      openingBalance: dto.openingBalance,
      closingBalance: dto.closingBalance,
    });
    await this.reconRepository.save(reconciliation);
    return reconciliation;
  }

  async findAll(
    bankAccountId?: string,
    status?: ReconciliationStatus,
  ): Promise<BankReconciliation[]> {
    return this.reconRepository.findMany({ bankAccountId, status });
  }

  async findOne(id: string): Promise<BankReconciliation> {
    const reconciliation = await this.reconRepository.findById(id);
    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation session with ID ${id} not found.`,
      );
    }
    return reconciliation;
  }

  async addTransaction(
    id: string,
    dto: AddBankTransactionDto,
  ): Promise<BankReconciliation> {
    const reconciliation = await this.findOne(id);
    reconciliation.addTransaction({
      transactionDate: new Date(dto.transactionDate),
      description: dto.description,
      amount: dto.amount,
    });
    await this.reconRepository.save(reconciliation);
    return reconciliation;
  }

  async matchTransaction(
    id: string,
    dto: MatchTransactionDto,
  ): Promise<BankReconciliation> {
    const reconciliation = await this.findOne(id);
    reconciliation.matchTransaction(dto.transactionId, dto.paymentId);

    // Update payment reconciliation status
    await this.paymentsService.findOne(dto.paymentId);
    await this.reconRepository.save(reconciliation);
    return reconciliation;
  }

  async complete(id: string): Promise<BankReconciliation> {
    const reconciliation = await this.findOne(id);
    reconciliation.complete();

    // Mark matched payments as RECONCILED
    for (const tx of reconciliation.transactions) {
      if (tx.matchedPaymentId) {
        const p = await this.paymentsService.findOne(tx.matchedPaymentId);
        if (p.status === 'POSTED') {
          p.markReconciled();
        }
      }
    }

    await this.reconRepository.save(reconciliation);
    return reconciliation;
  }
}
