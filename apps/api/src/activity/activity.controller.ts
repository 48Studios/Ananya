import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityEventDto, QueryActivityEventsDto } from './dtos';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post()
  async createEvent(@Body() dto: CreateActivityEventDto) {
    return this.activityService.createEvent(dto);
  }

  @Get()
  async findAll(@Query() query: QueryActivityEventsDto) {
    return this.activityService.findAll(query);
  }

  @Get('audit')
  async getAuditTrail(@Query() query: QueryActivityEventsDto) {
    return this.activityService.getAuditTrail(query);
  }

  @Get('entity/:type/:id')
  async findEntityEvents(
    @Param('type') entityType: string,
    @Param('id') entityId: string,
  ) {
    return this.activityService.findEntityEvents(entityType, entityId);
  }

  @Get('user/:id')
  async findUserEvents(@Param('id') userId: string) {
    return this.activityService.findUserEvents(userId);
  }
}
