import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  Payment,
  PaymentRepository,
  PaymentType,
  PaymentStatus,
} from '@ananya/finance';
import { CreatePaymentDto } from './dtos';
import { ReceivableInvoicesService } from '../receivable-invoices/receivable-invoices.service';
import { PayableInvoicesService } from '../payable-invoices/payable-invoices.service';

export const PAYMENT_REPOSITORY = 'PAYMENT_REPOSITORY';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: PaymentRepository,
    private readonly receivableInvoicesService: ReceivableInvoicesService,
    private readonly payableInvoicesService: PayableInvoicesService,
  ) {}

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const paymentNumber =
      await this.paymentRepository.generateNextPaymentNumber();
    const payment = Payment.create({
      paymentNumber,
      paymentType: dto.paymentType,
      paymentMethod: dto.paymentMethod,
      amount: dto.amount,
      reference: dto.reference,
      bankAccountId: dto.bankAccountId,
    });
    await this.paymentRepository.save(payment);
    return payment;
  }

  async findAll(
    paymentType?: PaymentType,
    bankAccountId?: string,
    status?: PaymentStatus,
  ): Promise<Payment[]> {
    return this.paymentRepository.findMany({
      paymentType,
      bankAccountId,
      status,
    });
  }

  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found.`);
    }
    return payment;
  }

  async post(id: string, targetInvoiceId?: string): Promise<Payment> {
    const payment = await this.findOne(id);
    payment.post();

    // Auto-allocate payment to target invoice if specified
    if (targetInvoiceId) {
      if (payment.paymentType === 'CUSTOMER_PAYMENT') {
        await this.receivableInvoicesService.applyPayment(
          targetInvoiceId,
          payment.amount,
        );
      } else if (payment.paymentType === 'SUPPLIER_PAYMENT') {
        await this.payableInvoicesService.applyPayment(
          targetInvoiceId,
          payment.amount,
        );
      }
    }

    await this.paymentRepository.save(payment);
    return payment;
  }

  async cancel(id: string): Promise<Payment> {
    const payment = await this.findOne(id);
    payment.cancel();
    await this.paymentRepository.save(payment);
    return payment;
  }
}
