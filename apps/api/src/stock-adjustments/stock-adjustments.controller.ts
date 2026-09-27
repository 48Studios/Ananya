import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { CreateStockAdjustmentDto, ApproveStockAdjustmentDto } from './dtos';
import { AdjustmentExceptionFilter } from './adjustment-exception.filter';
import type { StockAdjustmentStatus } from '@ananya/inventory';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('stock-adjustments')
@UseFilters(AdjustmentExceptionFilter)
export class StockAdjustmentsController {
  constructor(private readonly service: StockAdjustmentsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  create(@Body() dto: CreateStockAdjustmentDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findAll(
    @Query('locationId') locationId?: string,
    @Query('componentId') componentId?: string,
    @Query('status') status?: StockAdjustmentStatus,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(locationId, componentId, status, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  approve(@Param('id') id: string, @Body() dto?: ApproveStockAdjustmentDto) {
    return this.service.approve(id, dto);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
