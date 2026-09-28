import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityEventDto, QueryActivityEventsDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post()
  @UseGuards(createPermissionGuard('Projects.Manage'))
  async createEvent(@Body() dto: CreateActivityEventDto) {
    return this.activityService.createEvent(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Reports.Read'))
  async findAll(@Query() query: QueryActivityEventsDto) {
    return this.activityService.findAll(query);
  }

  @Get('audit')
  @UseGuards(createPermissionGuard('Administration.Security'))
  async getAuditTrail(@Query() query: QueryActivityEventsDto) {
    return this.activityService.getAuditTrail(query);
  }

  @Get('entity/:type/:id')
  @UseGuards(createPermissionGuard('Reports.Read'))
  async findEntityEvents(
    @Param('type') entityType: string,
    @Param('id') entityId: string,
  ) {
    return this.activityService.findEntityEvents(entityType, entityId);
  }

  @Get('user/:id')
  @UseGuards(createPermissionGuard('Reports.Read'))
  async findUserEvents(@Param('id') userId: string) {
    return this.activityService.findUserEvents(userId);
  }
}
