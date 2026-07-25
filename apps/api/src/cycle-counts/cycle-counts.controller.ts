import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CycleCountsService } from './cycle-counts.service';
import { CreateCycleCountDto } from './dtos';
import { CycleCountStatus } from '@ananya/warehouse';

@Controller('cycle-counts')
export class CycleCountsController {
  constructor(private readonly cycleCountsService: CycleCountsService) {}

  @Post()
  create(@Body() dto: CreateCycleCountDto) {
    return this.cycleCountsService.create(dto);
  }

  @Get()
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: CycleCountStatus,
  ) {
    return this.cycleCountsService.findAll(warehouseId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cycleCountsService.findOne(id);
  }

  @Post(':id/execute')
  executeSchedule(@Param('id') id: string) {
    return this.cycleCountsService.executeSchedule(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.cycleCountsService.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.cycleCountsService.resume(id);
  }
}
