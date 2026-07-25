import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, AddMilestoneDto } from './dtos';
import { ProjectStatus, ProjectPriority } from '@ananya/projects';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: ProjectStatus,
    @Query('priority') priority?: ProjectPriority,
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('projectManager') projectManager?: string,
    @Query('search') search?: string,
  ) {
    return this.projectsService.findAll(
      status,
      priority,
      customerId,
      salesOrderId,
      projectManager,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.projectsService.start(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.projectsService.pause(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.projectsService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.projectsService.cancel(id);
  }

  @Post(':id/milestones')
  addMilestone(@Param('id') id: string, @Body() dto: AddMilestoneDto) {
    return this.projectsService.addMilestone(id, dto);
  }

  @Post(':id/milestones/:milestoneId/complete')
  completeMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.projectsService.completeMilestone(id, milestoneId);
  }
}
