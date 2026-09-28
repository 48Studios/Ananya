import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import {
  CreateOpportunityDto,
  AdvanceOpportunityStageDto,
  CloseOpportunityLostDto,
} from './dtos';
import { OpportunityStage } from '@ananya/crm';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('crmAccountId') crmAccountId?: string,
    @Query('stage') stage?: OpportunityStage,
    @Query('search') search?: string,
  ) {
    return this.opportunitiesService.findAll(crmAccountId, stage, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Post(':id/advance')
  @UseGuards(createPermissionGuard('Sales.Update'))
  advanceStage(
    @Param('id') id: string,
    @Body() dto: AdvanceOpportunityStageDto,
  ) {
    return this.opportunitiesService.advanceStage(id, dto);
  }

  @Post(':id/win')
  @UseGuards(createPermissionGuard('Sales.Update'))
  win(@Param('id') id: string) {
    return this.opportunitiesService.win(id);
  }

  @Post(':id/lose')
  @UseGuards(createPermissionGuard('Sales.Update'))
  lose(@Param('id') id: string, @Body() dto: CloseOpportunityLostDto) {
    return this.opportunitiesService.lose(id, dto);
  }
}
