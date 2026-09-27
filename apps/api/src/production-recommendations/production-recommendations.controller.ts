import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductionRecommendationsService } from './production-recommendations.service';
import { CreateProductionRecommendationDto } from './dtos';
import { ProductionRecommendationStatus } from '@ananya/mrp';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('production-recommendations')
export class ProductionRecommendationsController {
  constructor(
    private readonly productionRecommendationsService: ProductionRecommendationsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  create(@Body() dto: CreateProductionRecommendationDto) {
    return this.productionRecommendationsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('productId') productId?: string,
    @Query('status') status?: ProductionRecommendationStatus,
  ) {
    return this.productionRecommendationsService.findAll(
      planningRunId,
      productId,
      status,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.productionRecommendationsService.findOne(id);
  }

  @Post(':id/accept')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  accept(@Param('id') id: string) {
    return this.productionRecommendationsService.accept(id);
  }

  @Post(':id/reject')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  reject(@Param('id') id: string) {
    return this.productionRecommendationsService.reject(id);
  }

  @Post(':id/implement')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  markImplemented(@Param('id') id: string) {
    return this.productionRecommendationsService.markImplemented(id);
  }
}
