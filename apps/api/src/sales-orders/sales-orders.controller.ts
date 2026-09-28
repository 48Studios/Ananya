import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import {
  CreateSalesOrderDto,
  ConvertQuotationDto,
  AddSalesOrderLineDto,
} from './dtos';
import { SalesOrderStatus } from '@ananya/sales';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesOrdersService.create(dto);
  }

  @Post('convert-quotation')
  @UseGuards(createPermissionGuard('Sales.Create'))
  convertFromQuotation(@Body() dto: ConvertQuotationDto) {
    return this.salesOrdersService.convertFromQuotation(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: SalesOrderStatus,
  ) {
    return this.salesOrdersService.findAll(customerId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddSalesOrderLineDto) {
    return this.salesOrdersService.addLine(id, dto);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Sales.Update'))
  approve(@Param('id') id: string) {
    return this.salesOrdersService.approve(id);
  }

  @Post(':id/release')
  @UseGuards(createPermissionGuard('Sales.Update'))
  release(@Param('id') id: string) {
    return this.salesOrdersService.release(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Sales.Update'))
  cancel(@Param('id') id: string) {
    return this.salesOrdersService.cancel(id);
  }
}
