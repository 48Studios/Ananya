import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import {
  CreatePurchaseInvoiceDto,
  AddPurchaseInvoiceLineDto,
  UpdatePurchaseInvoiceStatusDto,
} from './dtos';
import type { PurchaseInvoiceStatus } from '@ananya/procurement';

@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly invoicesService: PurchaseInvoicesService) {}

  @Post()
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ) {
    return this.invoicesService.findAll(supplierId, purchaseOrderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddPurchaseInvoiceLineDto) {
    return this.invoicesService.addLine(id, dto);
  }

  @Post(':id/match')
  match(@Param('id') id: string) {
    return this.invoicesService.match(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.invoicesService.approve(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return this.invoicesService.pay(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.invoicesService.cancel(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseInvoiceStatusDto,
  ) {
    return this.invoicesService.updateStatus(
      id,
      dto.status as PurchaseInvoiceStatus,
    );
  }
}
