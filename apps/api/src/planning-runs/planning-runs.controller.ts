import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PlanningRunsService } from './planning-runs.service';
import { StartPlanningRunDto } from './dtos';
import { PlanningRunStatus } from '@ananya/mrp';

@Controller('planning-runs')
export class PlanningRunsController {
  constructor(private readonly planningRunsService: PlanningRunsService) {}

  @Post()
  createAndExecute(@Body() dto: StartPlanningRunDto) {
    return this.planningRunsService.createAndExecute(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: PlanningRunStatus,
    @Query('startedBy') startedBy?: string,
    @Query('search') search?: string,
  ) {
    return this.planningRunsService.findAll(status, startedBy, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningRunsService.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.planningRunsService.cancel(id);
  }
}
