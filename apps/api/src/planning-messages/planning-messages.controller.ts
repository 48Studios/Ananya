import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PlanningMessagesService } from './planning-messages.service';
import { CreatePlanningMessageDto } from './dtos';
import { MessageSeverity } from '@ananya/mrp';

@Controller('planning-messages')
export class PlanningMessagesController {
  constructor(
    private readonly planningMessagesService: PlanningMessagesService,
  ) {}

  @Post()
  create(@Body() dto: CreatePlanningMessageDto) {
    return this.planningMessagesService.create(dto);
  }

  @Get()
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('severity') severity?: MessageSeverity,
  ) {
    return this.planningMessagesService.findAll(planningRunId, severity);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningMessagesService.findOne(id);
  }
}
