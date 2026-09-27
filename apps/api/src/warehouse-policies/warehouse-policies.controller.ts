import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { WarehousePoliciesService } from './warehouse-policies.service';
import { SaveWarehousePolicyDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('warehouse-policies')
export class WarehousePoliciesController {
  constructor(private readonly policiesService: WarehousePoliciesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Update'))
  savePolicy(@Body() dto: SaveWarehousePolicyDto) {
    return this.policiesService.savePolicy(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findAll() {
    return this.policiesService.findAll();
  }

  @Get('warehouse/:warehouseId')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findByWarehouseId(@Param('warehouseId') warehouseId: string) {
    return this.policiesService.findByWarehouseId(warehouseId);
  }
}
