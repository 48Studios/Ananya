import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  CreateNotificationDto,
  UpdateNotificationPreferencesDto,
  CreateWorkflowDto,
  EvaluateWorkflowDto,
} from './dtos';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly workflowService: WorkflowEngineService,
  ) {}

  @Get('notifications')
  getUserNotifications(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUserNotifications(req.user!.id);
  }

  @Get('notifications/unread-count')
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user!.id);
  }

  @Post('notifications')
  @UseGuards(createPermissionGuard('Administration.Users'))
  createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }

  @Patch('notifications/:id/read')
  markAsRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAsRead(id, req.user!.id);
  }

  @Post('notifications/read-all')
  markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user!.id);
  }

  @Get('notifications/preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getPreferences(req.user!.id);
  }

  @Put('notifications/preferences')
  updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(req.user!.id, dto);
  }

  // Workflow Automation Endpoints
  @Get('workflows')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  getWorkflows() {
    return this.workflowService.getWorkflows();
  }

  @Post('workflows')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  createWorkflow(@Body() dto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(dto);
  }

  @Post('workflows/evaluate')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  evaluateTriggers(@Body() dto: EvaluateWorkflowDto) {
    return this.workflowService.evaluateTriggers(dto);
  }
}
