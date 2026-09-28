import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { CreateMaintenanceScheduleDto } from './dtos';
import { MaintenanceStatus, ServiceFrequency } from '@ananya/service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(
    private readonly maintenanceSchedulesService: MaintenanceSchedulesService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  create(@Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('assignedTechnician') assignedTechnician?: string,
    @Query('status') status?: MaintenanceStatus,
    @Query('frequency') frequency?: ServiceFrequency,
    @Query('search') search?: string,
  ) {
    return this.maintenanceSchedulesService.findAll(
      customerId,
      assignedTechnician,
      status,
      frequency,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findOne(@Param('id') id: string) {
    return this.maintenanceSchedulesService.findOne(id);
  }

  @Post(':id/pause')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  pause(@Param('id') id: string) {
    return this.maintenanceSchedulesService.pause(id);
  }

  @Post(':id/resume')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  resume(@Param('id') id: string) {
    return this.maintenanceSchedulesService.resume(id);
  }

  @Post(':id/complete-visit')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  completeVisit(@Param('id') id: string) {
    return this.maintenanceSchedulesService.completeVisit(id);
  }

  @Post(':id/complete-plan')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  completePlan(@Param('id') id: string) {
    return this.maintenanceSchedulesService.completePlan(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  cancel(@Param('id') id: string) {
    return this.maintenanceSchedulesService.cancel(id);
  }
}
