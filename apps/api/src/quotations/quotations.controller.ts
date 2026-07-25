import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, AddQuotationLineDto } from './dtos';
import { QuotationStatus } from '@ananya/sales';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Post()
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationsService.create(dto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: QuotationStatus,
  ) {
    return this.quotationsService.findAll(customerId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddQuotationLineDto) {
    return this.quotationsService.addLine(id, dto);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.quotationsService.send(id);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.quotationsService.accept(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.quotationsService.cancel(id);
  }
}
