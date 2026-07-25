import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dtos';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  create(@Body() dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.notesService.findOne(id);
  }
}
