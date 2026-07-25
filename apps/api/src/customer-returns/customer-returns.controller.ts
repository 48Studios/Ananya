import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CustomerReturnsService } from './customer-returns.service';
import {
  CreateCustomerReturnDto,
  AddReturnLineDto,
  InspectReturnDto,
} from './dtos';
import { ReturnStatus } from '@ananya/sales';

@Controller('customer-returns')
export class CustomerReturnsController {
  constructor(private readonly returnsService: CustomerReturnsService) {}

  @Post()
  create(@Body() dto: CreateCustomerReturnDto) {
    return this.returnsService.create(dto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: ReturnStatus,
  ) {
    return this.returnsService.findAll(customerId, salesOrderId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddReturnLineDto) {
    return this.returnsService.addLine(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.returnsService.approve(id);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string) {
    return this.returnsService.receive(id);
  }

  @Post(':id/inspect')
  inspect(@Param('id') id: string, @Body() dto: InspectReturnDto) {
    return this.returnsService.inspect(id, dto);
  }

  @Post(':id/restock')
  restock(@Param('id') id: string) {
    return this.returnsService.restock(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.returnsService.reject(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.returnsService.close(id);
  }
}
