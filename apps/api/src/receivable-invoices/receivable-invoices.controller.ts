import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ReceivableInvoicesService } from './receivable-invoices.service';
import { CreateReceivableInvoiceDto } from './dtos';
import { InvoiceStatus } from '@ananya/finance';

@Controller('receivable-invoices')
export class ReceivableInvoicesController {
  constructor(private readonly receivablesService: ReceivableInvoicesService) {}

  @Post()
  create(@Body() dto: CreateReceivableInvoiceDto) {
    return this.receivablesService.create(dto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.receivablesService.findAll(customerId, salesOrderId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receivablesService.findOne(id);
  }

  @Post(':id/post')
  post(@Param('id') id: string) {
    return this.receivablesService.post(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.receivablesService.cancel(id);
  }
}
