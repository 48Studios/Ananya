import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import { CreateProductionOrderDto } from './dtos';
import { ProductionOrderStatus } from '@ananya/manufacturing';

@Controller('production-orders')
export class ProductionOrdersController {
  constructor(
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  @Post()
  create(@Body() dto: CreateProductionOrderDto) {
    return this.productionOrdersService.create(dto);
  }

  @Get()
  findAll(
    @Query('componentId') componentId?: string,
    @Query('bomId') bomId?: string,
    @Query('status') status?: ProductionOrderStatus,
  ) {
    return this.productionOrdersService.findAll(componentId, bomId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productionOrdersService.findOne(id);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.productionOrdersService.release(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.productionOrdersService.start(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.productionOrdersService.complete(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.productionOrdersService.close(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.productionOrdersService.cancel(id);
  }
}
