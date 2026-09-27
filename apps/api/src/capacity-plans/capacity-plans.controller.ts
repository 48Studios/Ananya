import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CapacityPlansService } from './capacity-plans.service';
import { CreateCapacityPlanDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('capacity-plans')
export class CapacityPlansController {
  constructor(private readonly capacityPlansService: CapacityPlansService) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  create(@Body() dto: CreateCapacityPlanDto) {
    return this.capacityPlansService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('workCenterId') workCenterId?: string,
    @Query('onlyOverloaded') onlyOverloaded?: string,
  ) {
    return this.capacityPlansService.findAll(
      planningRunId,
      workCenterId,
      onlyOverloaded === 'true',
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.capacityPlansService.findOne(id);
  }
}
