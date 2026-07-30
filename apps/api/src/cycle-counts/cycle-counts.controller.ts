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
} from '@nestjs/common';
import { CycleCountsService } from './cycle-counts.service';
import {
  CreateCycleCountDto,
  UpdateCycleCountDto,
  AssignCounterDto,
  RecordPhysicalCountsDto,
  ApproveCycleCountDto,
} from './dtos';
import { CycleCountExceptionFilter } from './cycle-count-exception.filter';
import type { CycleCountStatus } from '@ananya/warehouse';

@Controller('cycle-counts')
@UseFilters(CycleCountExceptionFilter)
export class CycleCountsController {
  constructor(private readonly cycleCountsService: CycleCountsService) {}

  @Post()
  create(@Body() dto: CreateCycleCountDto) {
    return this.cycleCountsService.create(dto);
  }

  @Get()
  findAll(
    @Query('locationId') locationId?: string,
    @Query('status') status?: CycleCountStatus,
    @Query('assignedCounter') assignedCounter?: string,
    @Query('search') search?: string,
  ) {
    return this.cycleCountsService.findAll(
      locationId,
      status,
      assignedCounter,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cycleCountsService.findOne(id);
  }

  @Get(':id/summary')
  reviewVariances(@Param('id') id: string) {
    return this.cycleCountsService.reviewVariances(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCycleCountDto) {
    return this.cycleCountsService.update(id, dto);
  }

  @Post(':id/assign')
  assignCounter(@Param('id') id: string, @Body() dto: AssignCounterDto) {
    return this.cycleCountsService.assignCounter(id, dto);
  }

  @Post(':id/start')
  startCounting(@Param('id') id: string) {
    return this.cycleCountsService.startCounting(id);
  }

  @Post(':id/record-counts')
  recordPhysicalCounts(
    @Param('id') id: string,
    @Body() dto: RecordPhysicalCountsDto,
  ) {
    return this.cycleCountsService.recordPhysicalCounts(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto?: ApproveCycleCountDto) {
    return this.cycleCountsService.approve(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.cycleCountsService.cancel(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.cycleCountsService.delete(id);
  }
}
