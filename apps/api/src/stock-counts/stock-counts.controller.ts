import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { CreateStockCountDto, AddCountLineDto, AssignCounterDto } from './dtos';
import { StockCountStatus } from '@ananya/warehouse';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  create(@Body() dto: CreateStockCountDto) {
    return this.stockCountsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: StockCountStatus,
  ) {
    return this.stockCountsService.findAll(warehouseId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findOne(@Param('id') id: string) {
    return this.stockCountsService.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  assignUser(@Param('id') id: string, @Body() dto: AssignCounterDto) {
    return this.stockCountsService.assignUser(id, dto);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  addLine(@Param('id') id: string, @Body() dto: AddCountLineDto) {
    return this.stockCountsService.addLine(id, dto);
  }

  @Post(':id/submit')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  submit(@Param('id') id: string) {
    return this.stockCountsService.submit(id);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  approve(@Param('id') id: string) {
    return this.stockCountsService.approve(id);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  postCount(@Param('id') id: string) {
    return this.stockCountsService.postCount(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  cancel(@Param('id') id: string) {
    return this.stockCountsService.cancel(id);
  }
}
