import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PayableInvoice,
  PayableInvoiceRepository,
  PayableStatus,
} from '@ananya/finance';
import { CreatePayableInvoiceDto } from './dtos';

export const PAYABLE_INVOICE_REPOSITORY = 'PAYABLE_INVOICE_REPOSITORY';

@Injectable()
export class PayableInvoicesService {
  constructor(
    @Inject(PAYABLE_INVOICE_REPOSITORY)
    private readonly payableRepository: PayableInvoiceRepository,
  ) {}

  async create(dto: CreatePayableInvoiceDto): Promise<PayableInvoice> {
    const invoiceNumber =
      await this.payableRepository.generateNextInvoiceNumber();
    const invoice = PayableInvoice.create({
      invoiceNumber,
      supplierId: dto.supplierId,
      purchaseInvoiceId: dto.purchaseInvoiceId,
      dueDate: new Date(dto.dueDate),
      amount: dto.amount,
    });
    await this.payableRepository.save(invoice);
    return invoice;
  }

  async findAll(
    supplierId?: string,
    purchaseInvoiceId?: string,
    status?: PayableStatus,
  ): Promise<PayableInvoice[]> {
    return this.payableRepository.findMany({
      supplierId,
      purchaseInvoiceId,
      status,
    });
  }

  async findOne(id: string): Promise<PayableInvoice> {
    const invoice = await this.payableRepository.findById(id);
    if (!invoice) {
      throw new NotFoundException(`Payable invoice with ID ${id} not found.`);
    }
    return invoice;
  }

  async post(id: string): Promise<PayableInvoice> {
    const invoice = await this.findOne(id);
    invoice.post();
    await this.payableRepository.save(invoice);
    return invoice;
  }

  async applyPayment(
    id: string,
    paymentAmount: number,
  ): Promise<PayableInvoice> {
    const invoice = await this.findOne(id);
    invoice.applyPayment(paymentAmount);
    await this.payableRepository.save(invoice);
    return invoice;
  }

  async cancel(id: string): Promise<PayableInvoice> {
    const invoice = await this.findOne(id);
    invoice.cancel();
    await this.payableRepository.save(invoice);
    return invoice;
  }
}
