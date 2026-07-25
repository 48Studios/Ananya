import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import {
  CreateSalesOrderDto,
  ConvertQuotationDto,
  AddSalesOrderLineDto,
} from './dtos';
import { SalesOrderStatus } from '@ananya/sales';

@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Post()
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesOrdersService.create(dto);
  }

  @Post('convert-quotation')
  convertFromQuotation(@Body() dto: ConvertQuotationDto) {
    return this.salesOrdersService.convertFromQuotation(dto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: SalesOrderStatus,
  ) {
    return this.salesOrdersService.findAll(customerId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddSalesOrderLineDto) {
    return this.salesOrdersService.addLine(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.salesOrdersService.approve(id);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.salesOrdersService.release(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesOrdersService.cancel(id);
  }
}
