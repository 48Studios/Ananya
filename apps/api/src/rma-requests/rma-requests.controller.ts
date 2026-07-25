import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { RmaRequestsService } from './rma-requests.service';
import { CreateRmaRequestDto, InspectRmaDto } from './dtos';
import { RmaStatus, RmaDisposition } from '@ananya/service';

@Controller('rma-requests')
export class RmaRequestsController {
  constructor(private readonly rmaRequestsService: RmaRequestsService) {}

  @Post()
  create(@Body() dto: CreateRmaRequestDto) {
    return this.rmaRequestsService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.rmaRequestsService.findOne(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.rmaRequestsService.approve(id);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string) {
    return this.rmaRequestsService.receive(id);
  }

  @Post(':id/inspect')
  inspect(@Param('id') id: string, @Body() dto: InspectRmaDto) {
    return this.rmaRequestsService.inspect(id, dto);
  }

  @Post(':id/process')
  process(@Param('id') id: string) {
    return this.rmaRequestsService.process(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.rmaRequestsService.close(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.rmaRequestsService.reject(id);
  }
}
