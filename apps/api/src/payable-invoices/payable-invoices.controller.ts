import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PayableInvoicesService } from './payable-invoices.service';
import { CreatePayableInvoiceDto } from './dtos';
import { PayableStatus } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('payable-invoices')
export class PayableInvoicesController {
  constructor(private readonly payablesService: PayableInvoicesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreatePayableInvoiceDto) {
    return this.payablesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('purchaseInvoiceId') purchaseInvoiceId?: string,
    @Query('status') status?: PayableStatus,
  ) {
    return this.payablesService.findAll(supplierId, purchaseInvoiceId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.payablesService.findOne(id);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  post(@Param('id') id: string) {
    return this.payablesService.post(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  cancel(@Param('id') id: string) {
    return this.payablesService.cancel(id);
  }
}
