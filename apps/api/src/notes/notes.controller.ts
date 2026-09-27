import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('leadId') leadId?: string,
    @Query('crmAccountId') crmAccountId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('activityId') activityId?: string,
  ) {
    return this.notesService.findAll(
      leadId,
      crmAccountId,
      opportunityId,
      activityId,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.notesService.findOne(id);
  }
}
