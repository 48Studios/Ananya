import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import {
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
  RecordPartialOutputDto,
  RecordScrapDto,
  CompleteProductionOrderDto,
} from './dtos';
import { ProductionOrderExceptionFilter } from './production-order-exception.filter';
import type {
  ProductionOrderStatus,
  ProductionOrderPriority,
} from '@ananya/manufacturing';

@Controller(['work-orders', 'production-orders'])
@UseFilters(ProductionOrderExceptionFilter)
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
    @Query('locationId') locationId?: string,
    @Query('status') status?: ProductionOrderStatus,
    @Query('priority') priority?: ProductionOrderPriority,
    @Query('search') search?: string,
  ) {
    return this.productionOrdersService.findAll(
      componentId,
      bomId,
      locationId,
      status,
      priority,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productionOrdersService.findOne(id);
  }

  @Get(':id/materials')
  getMaterialRequirements(@Param('id') id: string) {
    return this.productionOrdersService.getMaterialRequirements(id);
  }

  @Get(':id/timeline')
  getActivityTimeline(@Param('id') id: string) {
    return this.productionOrdersService.getActivityTimeline(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.productionOrdersService.update(id, dto);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.productionOrdersService.release(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.productionOrdersService.start(id);
  }

  @Post(':id/record-output')
  recordPartialOutput(
    @Param('id') id: string,
    @Body() dto: RecordPartialOutputDto,
  ) {
    return this.productionOrdersService.recordPartialOutput(id, dto);
  }

  @Post(':id/record-scrap')
  recordScrap(@Param('id') id: string, @Body() dto: RecordScrapDto) {
    return this.productionOrdersService.recordScrap(id, dto);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.productionOrdersService.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.productionOrdersService.resume(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto?: CompleteProductionOrderDto) {
    return this.productionOrdersService.complete(id, dto);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.productionOrdersService.close(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.productionOrdersService.cancel(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.productionOrdersService.delete(id);
  }
}
