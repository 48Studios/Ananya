import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RmaRequestsService } from './rma-requests.service';
import { CreateRmaRequestDto, InspectRmaDto } from './dtos';
import { RmaStatus, RmaDisposition } from '@ananya/service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('rma-requests')
export class RmaRequestsController {
  constructor(private readonly rmaRequestsService: RmaRequestsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  create(@Body() dto: CreateRmaRequestDto) {
    return this.rmaRequestsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: RmaStatus,
    @Query('disposition') disposition?: RmaDisposition,
    @Query('search') search?: string,
  ) {
    return this.rmaRequestsService.findAll(
      customerId,
      salesOrderId,
      status,
      disposition,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findOne(@Param('id') id: string) {
    return this.rmaRequestsService.findOne(id);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  approve(@Param('id') id: string) {
    return this.rmaRequestsService.approve(id);
  }

  @Post(':id/receive')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  receive(@Param('id') id: string) {
    return this.rmaRequestsService.receive(id);
  }

  @Post(':id/inspect')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  inspect(@Param('id') id: string, @Body() dto: InspectRmaDto) {
    return this.rmaRequestsService.inspect(id, dto);
  }

  @Post(':id/process')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  process(@Param('id') id: string) {
    return this.rmaRequestsService.process(id);
  }

  @Post(':id/close')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  close(@Param('id') id: string) {
    return this.rmaRequestsService.close(id);
  }

  @Post(':id/reject')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  reject(@Param('id') id: string) {
    return this.rmaRequestsService.reject(id);
  }
}
