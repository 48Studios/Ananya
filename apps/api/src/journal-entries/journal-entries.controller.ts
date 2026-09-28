import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JournalEntriesService } from './journal-entries.service';
import { CreateJournalEntryDto, AddJournalLineDto } from './dtos';
import { JournalStatus } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('journal-entries')
export class JournalEntriesController {
  constructor(private readonly journalService: JournalEntriesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreateJournalEntryDto) {
    return this.journalService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('status') status?: JournalStatus,
    @Query('search') search?: string,
  ) {
    return this.journalService.findAll(status, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.journalService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Accounting.Create'))
  addLine(@Param('id') id: string, @Body() dto: AddJournalLineDto) {
    return this.journalService.addLine(id, dto);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  post(@Param('id') id: string) {
    return this.journalService.post(id);
  }

  @Post(':id/reverse')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  reverse(@Param('id') id: string) {
    return this.journalService.reverse(id);
  }

  @Post(':id/void')
  @UseGuards(createPermissionGuard('Accounting.Post'))
  void(@Param('id') id: string) {
    return this.journalService.void(id);
  }
}
