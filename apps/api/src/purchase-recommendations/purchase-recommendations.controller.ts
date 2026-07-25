import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PurchaseRecommendationsService } from './purchase-recommendations.service';
import { CreatePurchaseRecommendationDto } from './dtos';
import { PurchaseRecommendationStatus } from '@ananya/mrp';

@Controller('purchase-recommendations')
export class PurchaseRecommendationsController {
  constructor(
    private readonly purchaseRecommendationsService: PurchaseRecommendationsService,
  ) {}

  @Post()
  create(@Body() dto: CreatePurchaseRecommendationDto) {
    return this.purchaseRecommendationsService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.purchaseRecommendationsService.findOne(id);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.purchaseRecommendationsService.accept(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.purchaseRecommendationsService.reject(id);
  }

  @Post(':id/implement')
  markImplemented(@Param('id') id: string) {
    return this.purchaseRecommendationsService.markImplemented(id);
  }
}
