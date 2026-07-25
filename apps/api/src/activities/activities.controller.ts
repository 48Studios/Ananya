import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dtos';
import { ActivityType, ActivityStatus } from '@ananya/crm';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(@Body() dto: CreateActivityDto) {
    return this.activitiesService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.activitiesService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.activitiesService.cancel(id);
  }
}
