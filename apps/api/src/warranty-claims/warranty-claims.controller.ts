import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { WarrantyClaimsService } from './warranty-claims.service';
import { CreateWarrantyClaimDto, DecisionNotesDto } from './dtos';
import { WarrantyDecision } from '@ananya/service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('warranty-claims')
export class WarrantyClaimsController {
  constructor(private readonly warrantyClaimsService: WarrantyClaimsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  create(@Body() dto: CreateWarrantyClaimDto) {
    return this.warrantyClaimsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('productId') productId?: string,
    @Query('decision') decision?: WarrantyDecision,
    @Query('search') search?: string,
  ) {
    return this.warrantyClaimsService.findAll(
      customerId,
      productId,
      decision,
      search,
    );
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Maintenance.Read'))
  findOne(@Param('id') id: string) {
    return this.warrantyClaimsService.findOne(id);
  }

  @Post(':id/review')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  review(@Param('id') id: string) {
    return this.warrantyClaimsService.review(id);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  approve(@Param('id') id: string, @Body() dto: DecisionNotesDto) {
    return this.warrantyClaimsService.approve(id, dto);
  }

  @Post(':id/reject')
  @UseGuards(createPermissionGuard('Maintenance.Manage'))
  reject(@Param('id') id: string, @Body() dto: DecisionNotesDto) {
    return this.warrantyClaimsService.reject(id, dto);
  }
}
