import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MaterialRequirementsService } from './material-requirements.service';
import { CreateMaterialRequirementDto } from './dtos';
import { RequirementSource } from '@ananya/mrp';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('material-requirements')
export class MaterialRequirementsController {
  constructor(
    private readonly materialRequirementsService: MaterialRequirementsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  create(@Body() dto: CreateMaterialRequirementDto) {
    return this.materialRequirementsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findAll(
    @Query('planningRunId') planningRunId?: string,
    @Query('componentId') componentId?: string,
    @Query('source') source?: RequirementSource,
    @Query('onlyShortages') onlyShortages?: string,
  ) {
    return this.materialRequirementsService.findAll(
      planningRunId,
      componentId,
      source,
      onlyShortages === 'true',
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('WorkOrders.Manage'))
  findOne(@Param('id') id: string) {
    return this.materialRequirementsService.findOne(id);
  }
}
