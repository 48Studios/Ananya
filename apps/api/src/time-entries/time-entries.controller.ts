import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto, ApproveTimeEntryDto } from './dtos';
import { TimeEntryStatus } from '@ananya/projects';
import type { AuthenticatedRequest } from '../auth/permission.guard';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Post()
  create(@Body() dto: CreateTimeEntryDto, @Req() req: AuthenticatedRequest) {
    const actorId = req.user!.id;
    const permissions = req.user?.permissions ?? [];
    const isManager =
      permissions.includes('*') ||
      permissions.includes('Projects.Manage') ||
      permissions.includes('Administration.Users') ||
      req.user?.roleName === 'Administrator' ||
      req.user?.roleName === 'Project Manager';

    let targetUserId = actorId;
    if (dto.userId && dto.userId !== actorId) {
      if (!isManager) {
        throw new ForbiddenException(
          'You do not have permission to record time entries on behalf of other employees.',
        );
      }
      targetUserId = dto.userId;
    }

    return this.timeEntriesService.create({
      ...dto,
      userId: targetUserId,
    });
  }

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('userId') userId?: string,
    @Query('taskId') taskId?: string,
    @Query('status') status?: TimeEntryStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const actorId = req.user!.id;
    const permissions = req.user?.permissions ?? [];
    const isManager =
      permissions.includes('*') ||
      permissions.includes('Projects.Manage') ||
      permissions.includes('Administration.Users') ||
      req.user?.roleName === 'Administrator' ||
      req.user?.roleName === 'Project Manager';

    // If regular user without management permissions, restrict query strictly to own entries
    const effectiveUserId = isManager ? userId : actorId;

    return this.timeEntriesService.findAll(
      effectiveUserId,
      taskId,
      status,
      startDate,
      endDate,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const entry = await this.timeEntriesService.findOne(id);
    const actorId = req.user!.id;
    const permissions = req.user?.permissions ?? [];
    const isManager =
      permissions.includes('*') ||
      permissions.includes('Projects.Manage') ||
      permissions.includes('Administration.Users') ||
      req.user?.roleName === 'Administrator' ||
      req.user?.roleName === 'Project Manager';

    if (!isManager && entry.userId !== actorId) {
      throw new ForbiddenException(
        'You do not have permission to view this time entry.',
      );
    }
    return entry;
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveTimeEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorId = req.user!.id;
    const permissions = req.user?.permissions ?? [];
    const isManager =
      permissions.includes('*') ||
      permissions.includes('Projects.Manage') ||
      permissions.includes('Administration.Users') ||
      req.user?.roleName === 'Administrator' ||
      req.user?.roleName === 'Project Manager';

    if (!isManager) {
      throw new ForbiddenException(
        'You do not have permission to approve time entries.',
      );
    }

    const entry = await this.timeEntriesService.findOne(id);
    if (entry.userId === actorId && req.user?.roleName !== 'Administrator') {
      throw new ForbiddenException(
        'Self-approval of time entries is not permitted.',
      );
    }

    return this.timeEntriesService.approve(id, {
      approverId: actorId, // Authoritatively bound to session identity
    });
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const permissions = req.user?.permissions ?? [];
    const isManager =
      permissions.includes('*') ||
      permissions.includes('Projects.Manage') ||
      permissions.includes('Administration.Users') ||
      req.user?.roleName === 'Administrator' ||
      req.user?.roleName === 'Project Manager';

    if (!isManager) {
      throw new ForbiddenException(
        'You do not have permission to reject time entries.',
      );
    }

    return this.timeEntriesService.reject(id);
  }
}
