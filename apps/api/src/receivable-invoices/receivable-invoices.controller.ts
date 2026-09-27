import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReceivableInvoicesService } from './receivable-invoices.service';
import { CreateReceivableInvoiceDto } from './dtos';
import { InvoiceStatus } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('receivable-invoices')
export class ReceivableInvoicesController {
  constructor(private readonly receivablesService: ReceivableInvoicesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreateReceivableInvoiceDto) {
    return this.receivablesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.receivablesService.findAll(customerId, salesOrderId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.receivablesService.findOne(id);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  post(@Param('id') id: string) {
    return this.receivablesService.post(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  cancel(@Param('id') id: string) {
    return this.receivablesService.cancel(id);
  }
}
