import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlanningMessagesService } from './planning-messages.service';
import { CreatePlanningMessageDto } from './dtos';
import { MessageSeverity } from '@ananya/mrp';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('planning-messages')
export class PlanningMessagesController {
  constructor(
    private readonly planningMessagesService: PlanningMessagesService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  create(@Body() dto: CreatePlanningMessageDto) {
    return this.planningMessagesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('severity') severity?: MessageSeverity,
  ) {
    return this.planningMessagesService.findAll(planningRunId, severity);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.planningMessagesService.findOne(id);
  }
}
