import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { MaintenanceSchedulesService } from './maintenance-schedules.service';
import { CreateMaintenanceScheduleDto } from './dtos';
import { MaintenanceStatus, ServiceFrequency } from '@ananya/service';

@Controller('maintenance-schedules')
export class MaintenanceSchedulesController {
  constructor(
    private readonly maintenanceSchedulesService: MaintenanceSchedulesService,
  ) {}

  @Post()
  create(@Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceSchedulesService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.maintenanceSchedulesService.findOne(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.maintenanceSchedulesService.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.maintenanceSchedulesService.resume(id);
  }

  @Post(':id/complete-visit')
  completeVisit(@Param('id') id: string) {
    return this.maintenanceSchedulesService.completeVisit(id);
  }

  @Post(':id/complete-plan')
  completePlan(@Param('id') id: string) {
    return this.maintenanceSchedulesService.completePlan(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.maintenanceSchedulesService.cancel(id);
  }
}
