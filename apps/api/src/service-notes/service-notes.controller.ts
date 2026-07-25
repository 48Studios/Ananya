import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ServiceNotesService } from './service-notes.service';
import { CreateServiceNoteDto } from './dtos';

@Controller('service-notes')
export class ServiceNotesController {
  constructor(private readonly serviceNotesService: ServiceNotesService) {}

  @Post()
  create(@Body() dto: CreateServiceNoteDto) {
    return this.serviceNotesService.create(dto);
  }

  @Get()
  findAll(
    @Query('serviceRequestId') serviceRequestId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('warrantyClaimId') warrantyClaimId?: string,
  ) {
    return this.serviceNotesService.findAll(
      serviceRequestId,
      workOrderId,
      warrantyClaimId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceNotesService.findOne(id);
  }
}
