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
  UseGuards,
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
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('cycle-counts')
@UseFilters(CycleCountExceptionFilter)
export class CycleCountsController {
  constructor(private readonly cycleCountsService: CycleCountsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  create(@Body() dto: CreateCycleCountDto) {
    return this.cycleCountsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
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
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findOne(@Param('id') id: string) {
    return this.cycleCountsService.findOne(id);
  }

  @Get(':id/summary')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  reviewVariances(@Param('id') id: string) {
    return this.cycleCountsService.reviewVariances(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  update(@Param('id') id: string, @Body() dto: UpdateCycleCountDto) {
    return this.cycleCountsService.update(id, dto);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  assignCounter(@Param('id') id: string, @Body() dto: AssignCounterDto) {
    return this.cycleCountsService.assignCounter(id, dto);
  }

  @Post(':id/start')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  startCounting(@Param('id') id: string) {
    return this.cycleCountsService.startCounting(id);
  }

  @Post(':id/record-counts')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  recordPhysicalCounts(
    @Param('id') id: string,
    @Body() dto: RecordPhysicalCountsDto,
  ) {
    return this.cycleCountsService.recordPhysicalCounts(id, dto);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  approve(@Param('id') id: string, @Body() dto?: ApproveCycleCountDto) {
    return this.cycleCountsService.approve(id, dto);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  cancel(@Param('id') id: string) {
    return this.cycleCountsService.cancel(id);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('Inventory.Adjust'))
  delete(@Param('id') id: string) {
    return this.cycleCountsService.delete(id);
  }
}
