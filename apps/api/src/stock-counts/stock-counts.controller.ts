import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { CreateStockCountDto, AddCountLineDto, AssignCounterDto } from './dtos';
import { StockCountStatus } from '@ananya/warehouse';

@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Post()
  create(@Body() dto: CreateStockCountDto) {
    return this.stockCountsService.create(dto);
  }

  @Get()
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: StockCountStatus,
  ) {
    return this.stockCountsService.findAll(warehouseId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockCountsService.findOne(id);
  }

  @Post(':id/assign')
  assignUser(@Param('id') id: string, @Body() dto: AssignCounterDto) {
    return this.stockCountsService.assignUser(id, dto);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddCountLineDto) {
    return this.stockCountsService.addLine(id, dto);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string) {
    return this.stockCountsService.submit(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.stockCountsService.approve(id);
  }

  @Post(':id/post')
  postCount(@Param('id') id: string) {
    return this.stockCountsService.postCount(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.stockCountsService.cancel(id);
  }
}
