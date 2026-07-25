import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PayableInvoicesService } from './payable-invoices.service';
import { CreatePayableInvoiceDto } from './dtos';
import { PayableStatus } from '@ananya/finance';

@Controller('payable-invoices')
export class PayableInvoicesController {
  constructor(private readonly payablesService: PayableInvoicesService) {}

  @Post()
  create(@Body() dto: CreatePayableInvoiceDto) {
    return this.payablesService.create(dto);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('purchaseInvoiceId') purchaseInvoiceId?: string,
    @Query('status') status?: PayableStatus,
  ) {
    return this.payablesService.findAll(supplierId, purchaseInvoiceId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payablesService.findOne(id);
  }

  @Post(':id/post')
  post(@Param('id') id: string) {
    return this.payablesService.post(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.payablesService.cancel(id);
  }
}
