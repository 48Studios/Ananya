import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddMilestoneDto,
  AllocateMaterialDto,
  IssueMaterialDto,
  ReturnMaterialDto,
} from './dtos';
import { ProjectExceptionFilter } from './project-exception.filter';
import { ProjectStatus, ProjectPriority } from '@ananya/projects';

@Controller('projects')
@UseFilters(ProjectExceptionFilter)
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

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
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

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.projectsService.archive(id);
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

  @Post(':id/materials/allocate')
  allocateMaterial(@Param('id') id: string, @Body() dto: AllocateMaterialDto) {
    return this.projectsService.allocateMaterial(id, dto);
  }

  @Post(':id/materials/issue')
  issueMaterial(@Param('id') id: string, @Body() dto: IssueMaterialDto) {
    return this.projectsService.issueMaterial(id, dto);
  }

  @Post(':id/materials/return')
  returnMaterial(@Param('id') id: string, @Body() dto: ReturnMaterialDto) {
    return this.projectsService.returnMaterial(id, dto);
  }
}
