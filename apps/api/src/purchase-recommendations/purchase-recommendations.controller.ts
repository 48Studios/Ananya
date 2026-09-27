import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PurchaseRecommendationsService } from './purchase-recommendations.service';
import { CreatePurchaseRecommendationDto } from './dtos';
import { PurchaseRecommendationStatus } from '@ananya/mrp';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('purchase-recommendations')
export class PurchaseRecommendationsController {
  constructor(
    private readonly purchaseRecommendationsService: PurchaseRecommendationsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('PurchaseOrders.Create'))
  create(@Body() dto: CreatePurchaseRecommendationDto) {
    return this.purchaseRecommendationsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('componentId') componentId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: PurchaseRecommendationStatus,
  ) {
    return this.purchaseRecommendationsService.findAll(
      planningRunId,
      componentId,
      supplierId,
      status,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findOne(@Param('id') id: string) {
    return this.purchaseRecommendationsService.findOne(id);
  }

  @Post(':id/accept')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  accept(@Param('id') id: string) {
    return this.purchaseRecommendationsService.accept(id);
  }

  @Post(':id/reject')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  reject(@Param('id') id: string) {
    return this.purchaseRecommendationsService.reject(id);
  }

  @Post(':id/implement')
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  markImplemented(@Param('id') id: string) {
    return this.purchaseRecommendationsService.markImplemented(id);
  }
}
