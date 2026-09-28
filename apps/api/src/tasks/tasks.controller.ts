import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, AssignTaskDto } from './dtos';
import { TaskStatus, TaskPriority } from '@ananya/projects';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(createPermissionGuard('Projects.Manage'))
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Projects.Read'))
  findAll(
    @Query('projectId') projectId?: string,
    @Query('assignedUser') assignedUser?: string,
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: TaskPriority,
    @Query('search') search?: string,
  ) {
    return this.tasksService.findAll(
      projectId,
      assignedUser,
      status,
      priority,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Projects.Read'))
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('Projects.Manage'))
  assign(@Param('id') id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, dto);
  }

  @Post(':id/start')
  @UseGuards(createPermissionGuard('Projects.Manage'))
  start(@Param('id') id: string) {
    return this.tasksService.start(id);
  }

  @Post(':id/block')
  @UseGuards(createPermissionGuard('Projects.Manage'))
  block(@Param('id') id: string) {
    return this.tasksService.block(id);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Projects.Manage'))
  complete(@Param('id') id: string) {
    return this.tasksService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Projects.Manage'))
  cancel(@Param('id') id: string) {
    return this.tasksService.cancel(id);
  }
}
