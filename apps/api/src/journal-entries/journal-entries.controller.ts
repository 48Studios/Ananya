import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { JournalEntriesService } from './journal-entries.service';
import { CreateJournalEntryDto, AddJournalLineDto } from './dtos';
import { JournalStatus } from '@ananya/finance';

@Controller('journal-entries')
export class JournalEntriesController {
  constructor(private readonly journalService: JournalEntriesService) {}

  @Post()
  create(@Body() dto: CreateJournalEntryDto) {
    return this.journalService.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: JournalStatus,
    @Query('search') search?: string,
  ) {
    return this.journalService.findAll(status, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.journalService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddJournalLineDto) {
    return this.journalService.addLine(id, dto);
  }

  @Post(':id/post')
  post(@Param('id') id: string) {
    return this.journalService.post(id);
  }

  @Post(':id/reverse')
  reverse(@Param('id') id: string) {
    return this.journalService.reverse(id);
  }

  @Post(':id/void')
  void(@Param('id') id: string) {
    return this.journalService.void(id);
  }
}
