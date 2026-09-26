import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PurchaseInvoice,
  PurchaseInvoiceRepository,
  PurchaseInvoiceStatus,
  ThreeWayMatcher,
} from '@ananya/procurement';
import { CreatePurchaseInvoiceDto, AddPurchaseInvoiceLineDto } from './dtos';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { GoodsReceiptsService } from '../goods-receipts/goods-receipts.service';

export const PURCHASE_INVOICE_REPOSITORY = 'PURCHASE_INVOICE_REPOSITORY';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY)
    private readonly invoiceRepository: PurchaseInvoiceRepository,
    private readonly poService: PurchaseOrdersService,
    private readonly grService: GoodsReceiptsService,
  ) {}

  async create(dto: CreatePurchaseInvoiceDto): Promise<PurchaseInvoice> {
    const invoiceNumber =
      await this.invoiceRepository.generateNextInvoiceNumber();
    const invoice = PurchaseInvoice.create({
      invoiceNumber,
      vendorInvoiceNumber: dto.vendorInvoiceNumber,
      supplierId: dto.supplierId,
      purchaseOrderId: dto.purchaseOrderId,
      goodsReceiptId: dto.goodsReceiptId,
      dueDate: new Date(dto.dueDate),
    });

    if (dto.lines && dto.lines.length > 0) {
      for (const line of dto.lines) {
        invoice.addLine(line);
      }
    }

    await this.invoiceRepository.save(invoice);
    return invoice;
  }

  async findAll(
    supplierId?: string,
    purchaseOrderId?: string,
  ): Promise<PurchaseInvoice[]> {
    return this.invoiceRepository.findMany({ supplierId, purchaseOrderId });
  }

  async findOne(id: string): Promise<PurchaseInvoice> {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      throw new NotFoundException(`Purchase Invoice with ID ${id} not found.`);
    }
    return invoice;
  }

  async addLine(
    id: string,
    dto: AddPurchaseInvoiceLineDto,
  ): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    invoice.addLine(dto);
    await this.invoiceRepository.save(invoice);
    return invoice;
  }

  async match(id: string) {
    const invoice = await this.findOne(id);
    const po = await this.poService.findOne(invoice.purchaseOrderId);
    const grs = await this.grService.findAll(invoice.purchaseOrderId);

    const matchResult = ThreeWayMatcher.evaluate(invoice, po, grs);
    invoice.setMatchResult(matchResult.isMatch, matchResult.varianceReason);
    await this.invoiceRepository.save(invoice);

    return {
      invoice,
      matchResult,
    };
  }

  async approve(id: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    invoice.approveForPayment();
    await this.invoiceRepository.save(invoice);
    return invoice;
  }

  async pay(id: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    invoice.markAsPaid();
    await this.invoiceRepository.save(invoice);
    return invoice;
  }

  async cancel(id: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    invoice.cancel();
    await this.invoiceRepository.save(invoice);
    return invoice;
  }

  async updateStatus(
    id: string,
    status: PurchaseInvoiceStatus,
  ): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    invoice.updateStatus(status);
    await this.invoiceRepository.save(invoice);
    return invoice;
  }
}
