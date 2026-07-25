import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  ReceivableInvoice,
  ReceivableInvoiceRepository,
  InvoiceStatus,
} from '@ananya/finance';
import { CreateReceivableInvoiceDto } from './dtos';

export const RECEIVABLE_INVOICE_REPOSITORY = 'RECEIVABLE_INVOICE_REPOSITORY';

@Injectable()
export class ReceivableInvoicesService {
  constructor(
    @Inject(RECEIVABLE_INVOICE_REPOSITORY)
    private readonly receivableRepository: ReceivableInvoiceRepository,
  ) {}

  async create(dto: CreateReceivableInvoiceDto): Promise<ReceivableInvoice> {
    const invoiceNumber =
      await this.receivableRepository.generateNextInvoiceNumber();
    const invoice = ReceivableInvoice.create({
      invoiceNumber,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      dueDate: new Date(dto.dueDate),
      amount: dto.amount,
    });
    await this.receivableRepository.save(invoice);
    return invoice;
  }

  async findAll(
    customerId?: string,
    salesOrderId?: string,
    status?: InvoiceStatus,
  ): Promise<ReceivableInvoice[]> {
    return this.receivableRepository.findMany({
      customerId,
      salesOrderId,
      status,
    });
  }

  async findOne(id: string): Promise<ReceivableInvoice> {
    const invoice = await this.receivableRepository.findById(id);
    if (!invoice) {
      throw new NotFoundException(
        `Receivable invoice with ID ${id} not found.`,
      );
    }
    return invoice;
  }

  async post(id: string): Promise<ReceivableInvoice> {
    const invoice = await this.findOne(id);
    invoice.post();
    await this.receivableRepository.save(invoice);
    return invoice;
  }

  async applyPayment(
    id: string,
    paymentAmount: number,
  ): Promise<ReceivableInvoice> {
    const invoice = await this.findOne(id);
    invoice.applyPayment(paymentAmount);
    await this.receivableRepository.save(invoice);
    return invoice;
  }

  async cancel(id: string): Promise<ReceivableInvoice> {
    const invoice = await this.findOne(id);
    invoice.cancel();
    await this.receivableRepository.save(invoice);
    return invoice;
  }
}
