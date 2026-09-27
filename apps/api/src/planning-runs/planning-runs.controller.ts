import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PlanningRunsService } from './planning-runs.service';
import { StartPlanningRunDto } from './dtos';
import { PlanningRunStatus } from '@ananya/mrp';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('planning-runs')
export class PlanningRunsController {
  constructor(private readonly planningRunsService: PlanningRunsService) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  createAndExecute(@Body() dto: StartPlanningRunDto) {
    return this.planningRunsService.createAndExecute(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findAll(
    @Query('status') status?: PlanningRunStatus,
    @Query('startedBy') startedBy?: string,
    @Query('search') search?: string,
  ) {
    return this.planningRunsService.findAll(status, startedBy, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.planningRunsService.findOne(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  cancel(@Param('id') id: string) {
    return this.planningRunsService.cancel(id);
  }
}
