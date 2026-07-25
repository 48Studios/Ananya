import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import {
  CreateOpportunityDto,
  AdvanceOpportunityStageDto,
  CloseOpportunityLostDto,
} from './dtos';
import { OpportunityStage } from '@ananya/crm';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll(
    @Query('crmAccountId') crmAccountId?: string,
    @Query('stage') stage?: OpportunityStage,
    @Query('search') search?: string,
  ) {
    return this.opportunitiesService.findAll(crmAccountId, stage, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Post(':id/advance')
  advanceStage(
    @Param('id') id: string,
    @Body() dto: AdvanceOpportunityStageDto,
  ) {
    return this.opportunitiesService.advanceStage(id, dto);
  }

  @Post(':id/win')
  win(@Param('id') id: string) {
    return this.opportunitiesService.win(id);
  }

  @Post(':id/lose')
  lose(@Param('id') id: string, @Body() dto: CloseOpportunityLostDto) {
    return this.opportunitiesService.lose(id, dto);
  }
}
