import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ProcurementPoliciesService } from './procurement-policies.service';
import { CreateProcurementPolicyDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('procurement-policies')
export class ProcurementPoliciesController {
  constructor(private readonly policiesService: ProcurementPoliciesService) {}

  @Post()
  @UseGuards(createPermissionGuard('PurchaseOrders.Update'))
  create(@Body() dto: CreateProcurementPolicyDto) {
    return this.policiesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findAll() {
    return this.policiesService.findAll();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('PurchaseOrders.Read'))
  findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }
}
