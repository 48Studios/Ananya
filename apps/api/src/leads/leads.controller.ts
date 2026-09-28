import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto, AssignLeadDto, DisqualifyLeadDto } from './dtos';
import { LeadStatus, LeadSource } from '@ananya/crm';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('status') status?: LeadStatus,
    @Query('source') source?: LeadSource,
    @Query('owner') owner?: string,
    @Query('search') search?: string,
  ) {
    return this.leadsService.findAll(status, source, owner, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(createPermissionGuard('Sales.Update'))
  assign(@Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.leadsService.assign(id, dto);
  }

  @Post(':id/qualify')
  @UseGuards(createPermissionGuard('Sales.Update'))
  qualify(@Param('id') id: string) {
    return this.leadsService.qualify(id);
  }

  @Post(':id/disqualify')
  @UseGuards(createPermissionGuard('Sales.Update'))
  disqualify(@Param('id') id: string, @Body() dto: DisqualifyLeadDto) {
    return this.leadsService.disqualify(id, dto);
  }

  @Post(':id/convert')
  @UseGuards(createPermissionGuard('Sales.Update'))
  convert(@Param('id') id: string) {
    return this.leadsService.convert(id);
  }
}
