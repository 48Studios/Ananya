import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dtos';
import { ActivityType, ActivityStatus } from '@ananya/crm';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateActivityDto) {
    return this.activitiesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('type') type?: ActivityType,
    @Query('status') status?: ActivityStatus,
    @Query('owner') owner?: string,
    @Query('relatedLeadId') relatedLeadId?: string,
    @Query('relatedAccountId') relatedAccountId?: string,
    @Query('relatedOpportunityId') relatedOpportunityId?: string,
  ) {
    return this.activitiesService.findAll(
      type,
      status,
      owner,
      relatedLeadId,
      relatedAccountId,
      relatedOpportunityId,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Sales.Update'))
  complete(@Param('id') id: string) {
    return this.activitiesService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Sales.Update'))
  cancel(@Param('id') id: string) {
    return this.activitiesService.cancel(id);
  }
}
