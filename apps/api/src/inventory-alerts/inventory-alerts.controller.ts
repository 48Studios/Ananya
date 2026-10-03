import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InventoryAlertsService } from './inventory-alerts.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('inventory-alerts')
export class InventoryAlertsController {
  constructor(
    private readonly inventoryAlertsService: InventoryAlertsService,
  ) {}

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  listAlerts(
    @Query('status') status?: 'ACTIVE' | 'RESOLVED',
    @Query('alertType') alertType?: string,
    @Query('componentId') componentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryAlertsService.listAlerts({
      status,
      alertType,
      componentId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('summary')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  getSummary() {
    return this.inventoryAlertsService.getSummary();
  }

  @Post('evaluate')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  evaluate() {
    return this.inventoryAlertsService.evaluate();
  }
}
