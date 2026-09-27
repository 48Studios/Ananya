import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, AddQuotationLineDto } from './dtos';
import { QuotationStatus } from '@ananya/sales';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: QuotationStatus,
  ) {
    return this.quotationsService.findAll(customerId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddQuotationLineDto) {
    return this.quotationsService.addLine(id, dto);
  }

  @Post(':id/send')
  @UseGuards(createPermissionGuard('Sales.Update'))
  send(@Param('id') id: string) {
    return this.quotationsService.send(id);
  }

  @Post(':id/accept')
  @UseGuards(createPermissionGuard('Sales.Update'))
  accept(@Param('id') id: string) {
    return this.quotationsService.accept(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Sales.Update'))
  cancel(@Param('id') id: string) {
    return this.quotationsService.cancel(id);
  }
}
