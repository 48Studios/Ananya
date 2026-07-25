import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ProductionRecommendationsService } from './production-recommendations.service';
import { CreateProductionRecommendationDto } from './dtos';
import { ProductionRecommendationStatus } from '@ananya/mrp';

@Controller('production-recommendations')
export class ProductionRecommendationsController {
  constructor(
    private readonly productionRecommendationsService: ProductionRecommendationsService,
  ) {}

  @Post()
  create(@Body() dto: CreateProductionRecommendationDto) {
    return this.productionRecommendationsService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.productionRecommendationsService.findOne(id);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.productionRecommendationsService.accept(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.productionRecommendationsService.reject(id);
  }

  @Post(':id/implement')
  markImplemented(@Param('id') id: string) {
    return this.productionRecommendationsService.markImplemented(id);
  }
}
