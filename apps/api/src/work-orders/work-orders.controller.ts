import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import {
  CreateWorkOrderDto,
  AssignWorkOrderDto,
  LogWorkOrderHoursDto,
} from './dtos';
import { WorkOrderStatus, WorkOrderPriority } from '@ananya/service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(dto);
  }

  @Get()
  findAll(
    @Query('serviceRequestId') serviceRequestId?: string,
    @Query('assignedTechnician') assignedTechnician?: string,
    @Query('status') status?: WorkOrderStatus,
    @Query('priority') priority?: WorkOrderPriority,
    @Query('search') search?: string,
  ) {
    return this.workOrdersService.findAll(
      serviceRequestId,
      assignedTechnician,
      status,
      priority,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignWorkOrderDto) {
    return this.workOrdersService.assign(id, dto);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.workOrdersService.start(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.workOrdersService.pause(id);
  }

  @Post(':id/hours')
  logHours(@Param('id') id: string, @Body() dto: LogWorkOrderHoursDto) {
    return this.workOrdersService.logHours(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.workOrdersService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.workOrdersService.cancel(id);
  }
}
