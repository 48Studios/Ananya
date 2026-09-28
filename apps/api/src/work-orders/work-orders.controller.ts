import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import {
  CreateWorkOrderDto,
  AssignWorkOrderDto,
  LogWorkOrderHoursDto,
} from './dtos';
import { WorkOrderStatus, WorkOrderPriority } from '@ananya/service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'create work order'))
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'view work orders'))
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
  @UseGuards(
    createPermissionGuard('WorkOrders.Manage', 'view work order by id'),
  )
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'assign work order'))
  assign(@Param('id') id: string, @Body() dto: AssignWorkOrderDto) {
    return this.workOrdersService.assign(id, dto);
  }

  @Post(':id/start')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'start work order'))
  start(@Param('id') id: string) {
    return this.workOrdersService.start(id);
  }

  @Post(':id/pause')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'pause work order'))
  pause(@Param('id') id: string) {
    return this.workOrdersService.pause(id);
  }

  @Post(':id/hours')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'log work order hours'))
  logHours(@Param('id') id: string, @Body() dto: LogWorkOrderHoursDto) {
    return this.workOrdersService.logHours(id, dto);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'complete work order'))
  complete(@Param('id') id: string) {
    return this.workOrdersService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('WorkOrders.Manage', 'cancel work order'))
  cancel(@Param('id') id: string) {
    return this.workOrdersService.cancel(id);
  }
}
