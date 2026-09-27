import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import {
  CreatePurchaseInvoiceDto,
  AddPurchaseInvoiceLineDto,
  UpdatePurchaseInvoiceStatusDto,
} from './dtos';
import type { PurchaseInvoiceStatus } from '@ananya/procurement';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly invoicesService: PurchaseInvoicesService) {}

  @Post()
  @UseGuards(createPermissionGuard('PurchaseOrders.Create'))
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ) {
    return this.invoicesService.findAll(supplierId, purchaseOrderId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddPurchaseInvoiceLineDto) {
    return this.invoicesService.addLine(id, dto);
  }

  @Post(':id/match')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  match(@Param('id') id: string) {
    return this.invoicesService.match(id);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  approve(@Param('id') id: string) {
    return this.invoicesService.approve(id);
  }

  @Post(':id/pay')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  pay(@Param('id') id: string) {
    return this.invoicesService.pay(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  cancel(@Param('id') id: string) {
    return this.invoicesService.cancel(id);
  }

  @Patch(':id/status')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
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
