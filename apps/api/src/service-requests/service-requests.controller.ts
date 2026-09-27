import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import {
  CreateServiceRequestDto,
  AssignServiceRequestDto,
  DiagnoseServiceRequestDto,
} from './dtos';
import {
  ServiceRequestStatus,
  ServicePriority,
  ServiceCategory,
} from '@ananya/service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  create(@Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findAll(
    @Query('status') status?: ServiceRequestStatus,
    @Query('priority') priority?: ServicePriority,
    @Query('category') category?: ServiceCategory,
    @Query('customerId') customerId?: string,
    @Query('assignedTechnician') assignedTechnician?: string,
    @Query('search') search?: string,
  ) {
    return this.serviceRequestsService.findAll(
      status,
      priority,
      category,
      customerId,
      assignedTechnician,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findOne(@Param('id') id: string) {
    return this.serviceRequestsService.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  assign(@Param('id') id: string, @Body() dto: AssignServiceRequestDto) {
    return this.serviceRequestsService.assign(id, dto);
  }

  @Post(':id/diagnose')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  diagnose(@Param('id') id: string, @Body() dto: DiagnoseServiceRequestDto) {
    return this.serviceRequestsService.diagnose(id, dto);
  }

  @Post(':id/waiting-parts')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  setWaitingParts(@Param('id') id: string) {
    return this.serviceRequestsService.setWaitingParts(id);
  }

  @Post(':id/start-repair')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  startRepair(@Param('id') id: string) {
    return this.serviceRequestsService.startRepair(id);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  complete(@Param('id') id: string) {
    return this.serviceRequestsService.complete(id);
  }

  @Post(':id/close')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  close(@Param('id') id: string) {
    return this.serviceRequestsService.close(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  cancel(@Param('id') id: string) {
    return this.serviceRequestsService.cancel(id);
  }
}
