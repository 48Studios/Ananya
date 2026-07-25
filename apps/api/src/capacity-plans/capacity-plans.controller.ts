import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CapacityPlansService } from './capacity-plans.service';
import { CreateCapacityPlanDto } from './dtos';

@Controller('capacity-plans')
export class CapacityPlansController {
  constructor(private readonly capacityPlansService: CapacityPlansService) {}

  @Post()
  create(@Body() dto: CreateCapacityPlanDto) {
    return this.capacityPlansService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.capacityPlansService.findOne(id);
  }
}
