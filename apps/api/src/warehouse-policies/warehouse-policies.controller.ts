import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { WarehousePoliciesService } from './warehouse-policies.service';
import { SaveWarehousePolicyDto } from './dtos';

@Controller('warehouse-policies')
export class WarehousePoliciesController {
  constructor(private readonly policiesService: WarehousePoliciesService) {}

  @Post()
  savePolicy(@Body() dto: SaveWarehousePolicyDto) {
    return this.policiesService.savePolicy(dto);
  }

  @Get()
  findAll() {
    return this.policiesService.findAll();
  }

  @Get('warehouse/:warehouseId')
  findByWarehouseId(@Param('warehouseId') warehouseId: string) {
    return this.policiesService.findByWarehouseId(warehouseId);
  }
}
