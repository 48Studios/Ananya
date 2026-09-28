import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceNotesService } from './service-notes.service';
import { CreateServiceNoteDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('service-notes')
export class ServiceNotesController {
  constructor(private readonly serviceNotesService: ServiceNotesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  create(@Body() dto: CreateServiceNoteDto) {
    return this.serviceNotesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Maintenance.Read'))
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
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findOne(@Param('id') id: string) {
    return this.serviceNotesService.findOne(id);
  }
}
