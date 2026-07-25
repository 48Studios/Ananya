import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto, ApproveTimeEntryDto } from './dtos';
import { TimeEntryStatus } from '@ananya/projects';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Post()
  create(@Body() dto: CreateTimeEntryDto) {
    return this.timeEntriesService.create(dto);
  }

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('taskId') taskId?: string,
    @Query('status') status?: TimeEntryStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.timeEntriesService.findAll(
      userId,
      taskId,
      status,
      startDate,
      endDate,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeEntriesService.findOne(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveTimeEntryDto) {
    return this.timeEntriesService.approve(id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.timeEntriesService.reject(id);
  }
}
