import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { WarrantyClaimsService } from './warranty-claims.service';
import { CreateWarrantyClaimDto, DecisionNotesDto } from './dtos';
import { WarrantyDecision } from '@ananya/service';

@Controller('warranty-claims')
export class WarrantyClaimsController {
  constructor(private readonly warrantyClaimsService: WarrantyClaimsService) {}

  @Post()
  create(@Body() dto: CreateWarrantyClaimDto) {
    return this.warrantyClaimsService.create(dto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.warrantyClaimsService.findOne(id);
  }

  @Post(':id/review')
  review(@Param('id') id: string) {
    return this.warrantyClaimsService.review(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: DecisionNotesDto) {
    return this.warrantyClaimsService.approve(id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: DecisionNotesDto) {
    return this.warrantyClaimsService.reject(id, dto);
  }
}
