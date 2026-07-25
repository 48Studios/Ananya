import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { FulfillmentRequestsService } from './fulfillment-requests.service';
import {
  CreateFulfillmentRequestDto,
  AddFulfillmentLineDto,
  ShipFulfillmentRequestDto,
} from './dtos';
import { FulfillmentStatus } from '@ananya/sales';

@Controller('fulfillment')
export class FulfillmentRequestsController {
  constructor(
    private readonly fulfillmentService: FulfillmentRequestsService,
  ) {}

  @Post()
  create(@Body() dto: CreateFulfillmentRequestDto) {
    return this.fulfillmentService.create(dto);
  }

  @Get()
  findAll(
    @Query('salesOrderId') salesOrderId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: FulfillmentStatus,
  ) {
    return this.fulfillmentService.findAll(salesOrderId, warehouseId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fulfillmentService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddFulfillmentLineDto) {
    return this.fulfillmentService.addLine(id, dto);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.fulfillmentService.accept(id);
  }

  @Post(':id/pick')
  startPicking(@Param('id') id: string) {
    return this.fulfillmentService.startPicking(id);
  }

  @Post(':id/pack')
  pack(@Param('id') id: string) {
    return this.fulfillmentService.pack(id);
  }

  @Post(':id/ship')
  ship(@Param('id') id: string, @Body() dto: ShipFulfillmentRequestDto) {
    return this.fulfillmentService.ship(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.fulfillmentService.complete(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.fulfillmentService.cancel(id);
  }
}
