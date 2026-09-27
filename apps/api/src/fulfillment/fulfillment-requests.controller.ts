import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { FulfillmentRequestsService } from './fulfillment-requests.service';
import {
  CreateFulfillmentRequestDto,
  AddFulfillmentLineDto,
  ShipFulfillmentRequestDto,
} from './dtos';
import { FulfillmentStatus } from '@ananya/sales';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('fulfillment')
export class FulfillmentRequestsController {
  constructor(
    private readonly fulfillmentService: FulfillmentRequestsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateFulfillmentRequestDto) {
    return this.fulfillmentService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('salesOrderId') salesOrderId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: FulfillmentStatus,
  ) {
    return this.fulfillmentService.findAll(salesOrderId, warehouseId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.fulfillmentService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddFulfillmentLineDto) {
    return this.fulfillmentService.addLine(id, dto);
  }

  @Post(':id/accept')
  @UseGuards(createPermissionGuard('Sales.Update'))
  accept(@Param('id') id: string) {
    return this.fulfillmentService.accept(id);
  }

  @Post(':id/pick')
  @UseGuards(createPermissionGuard('Sales.Update'))
  startPicking(@Param('id') id: string) {
    return this.fulfillmentService.startPicking(id);
  }

  @Post(':id/pack')
  @UseGuards(createPermissionGuard('Sales.Update'))
  pack(@Param('id') id: string) {
    return this.fulfillmentService.pack(id);
  }

  @Post(':id/ship')
  @UseGuards(createPermissionGuard('Sales.Update'))
  ship(@Param('id') id: string, @Body() dto: ShipFulfillmentRequestDto) {
    return this.fulfillmentService.ship(id, dto);
  }

  @Post(':id/complete')
  @UseGuards(createPermissionGuard('Sales.Update'))
  complete(@Param('id') id: string) {
    return this.fulfillmentService.complete(id);
  }

  @Post(':id/cancel')
  @UseGuards(createPermissionGuard('Sales.Update'))
  cancel(@Param('id') id: string) {
    return this.fulfillmentService.cancel(id);
  }
}
