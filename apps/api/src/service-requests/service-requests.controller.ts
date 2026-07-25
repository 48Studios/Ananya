import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
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

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
  ) {}

  @Post()
  create(@Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.serviceRequestsService.findOne(id);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignServiceRequestDto) {
    return this.serviceRequestsService.assign(id, dto);
  }

  @Post(':id/diagnose')
  diagnose(@Param('id') id: string, @Body() dto: DiagnoseServiceRequestDto) {
    return this.serviceRequestsService.diagnose(id, dto);
  }

  @Post(':id/waiting-parts')
  setWaitingParts(@Param('id') id: string) {
    return this.serviceRequestsService.setWaitingParts(id);
  }

  @Post(':id/start-repair')
  startRepair(@Param('id') id: string) {
    return this.serviceRequestsService.startRepair(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.serviceRequestsService.complete(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.serviceRequestsService.close(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.serviceRequestsService.cancel(id);
  }
}
