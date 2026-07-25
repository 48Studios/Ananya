import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto, AssignLeadDto, DisqualifyLeadDto } from './dtos';
import { LeadStatus, LeadSource } from '@ananya/crm';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: LeadStatus,
    @Query('source') source?: LeadSource,
    @Query('owner') owner?: string,
    @Query('search') search?: string,
  ) {
    return this.leadsService.findAll(status, source, owner, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.leadsService.assign(id, dto);
  }

  @Post(':id/qualify')
  qualify(@Param('id') id: string) {
    return this.leadsService.qualify(id);
  }

  @Post(':id/disqualify')
  disqualify(@Param('id') id: string, @Body() dto: DisqualifyLeadDto) {
    return this.leadsService.disqualify(id, dto);
  }

  @Post(':id/convert')
  convert(@Param('id') id: string) {
    return this.leadsService.convert(id);
  }
}
