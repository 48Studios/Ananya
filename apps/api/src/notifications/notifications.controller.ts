import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  CreateNotificationDto,
  UpdateNotificationPreferencesDto,
  CreateWorkflowDto,
  EvaluateWorkflowDto,
} from './dtos';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workflowService: WorkflowEngineService,
  ) {}

  @Get('notifications')
  getUserNotifications(@Query('userId') userId?: string) {
    return this.notificationsService.getUserNotifications(userId);
  }

  @Get('notifications/unread-count')
  getUnreadCount(@Query('userId') userId?: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Post('notifications')
  createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }

  @Patch('notifications/:id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Post('notifications/read-all')
  markAllAsRead(@Query('userId') userId?: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Get('notifications/preferences')
  getPreferences(@Query('userId') userId?: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Put('notifications/preferences')
  updatePreferences(
    @Query('userId') userId: string | undefined,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(userId, dto);
  }

  // Workflow Automation Endpoints
  @Get('workflows')
  getWorkflows() {
    return this.workflowService.getWorkflows();
  }

  @Post('workflows')
  createWorkflow(@Body() dto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(dto);
  }

  @Post('workflows/evaluate')
  evaluateTriggers(@Body() dto: EvaluateWorkflowDto) {
    return this.workflowService.evaluateTriggers(dto);
  }
}
