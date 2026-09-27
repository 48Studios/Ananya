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
  UseGuards,
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
import { createPermissionGuard } from '../auth/permission.guard';

@Controller(['work-orders', 'production-orders'])
@UseFilters(ProductionOrderExceptionFilter)
export class ProductionOrdersController {
  constructor(
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  create(@Body() dto: CreateProductionOrderDto) {
    return this.productionOrdersService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
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
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.productionOrdersService.findOne(id);
  }

  @Get(':id/materials')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  getMaterialRequirements(@Param('id') id: string) {
    return this.productionOrdersService.getMaterialRequirements(id);
  }

  @Get(':id/timeline')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  getActivityTimeline(@Param('id') id: string) {
    return this.productionOrdersService.getActivityTimeline(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  update(@Param('id') id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.productionOrdersService.update(id, dto);
  }

  @Post(':id/release')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  release(@Param('id') id: string) {
    return this.productionOrdersService.release(id);
  }

  @Post(':id/start')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  start(@Param('id') id: string) {
    return this.productionOrdersService.start(id);
  }

  @Post(':id/record-output')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  recordPartialOutput(
    @Param('id') id: string,
    @Body() dto: RecordPartialOutputDto,
  ) {
    return this.productionOrdersService.recordPartialOutput(id, dto);
  }

  @Post(':id/record-scrap')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  recordScrap(@Param('id') id: string, @Body() dto: RecordScrapDto) {
    return this.productionOrdersService.recordScrap(id, dto);
  }

  @Post(':id/pause')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  pause(@Param('id') id: string) {
    return this.productionOrdersService.pause(id);
  }

  @Post(':id/resume')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  resume(@Param('id') id: string) {
    return this.productionOrdersService.resume(id);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  complete(@Param('id') id: string, @Body() dto?: CompleteProductionOrderDto) {
    return this.productionOrdersService.complete(id, dto);
  }

  @Post(':id/close')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  close(@Param('id') id: string) {
    return this.productionOrdersService.close(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  cancel(@Param('id') id: string) {
    return this.productionOrdersService.cancel(id);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  delete(@Param('id') id: string) {
    return this.productionOrdersService.delete(id);
  }
}
