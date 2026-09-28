import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomerReturnsService } from './customer-returns.service';
import {
  CreateCustomerReturnDto,
  AddReturnLineDto,
  InspectReturnDto,
} from './dtos';
import { ReturnStatus } from '@ananya/sales';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('customer-returns')
export class CustomerReturnsController {
  constructor(private readonly returnsService: CustomerReturnsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateCustomerReturnDto) {
    return this.returnsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: ReturnStatus,
  ) {
    return this.returnsService.findAll(customerId, salesOrderId, status);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addLine(@Param('id') id: string, @Body() dto: AddReturnLineDto) {
    return this.returnsService.addLine(id, dto);
  }

  @Post(':id/approve')
  @UseGuards(createPermissionGuard('Sales.Update'))
  approve(@Param('id') id: string) {
    return this.returnsService.approve(id);
  }

  @Post(':id/receive')
  @UseGuards(createPermissionGuard('Sales.Update'))
  receive(@Param('id') id: string) {
    return this.returnsService.receive(id);
  }

  @Post(':id/inspect')
  @UseGuards(createPermissionGuard('Sales.Update'))
  inspect(@Param('id') id: string, @Body() dto: InspectReturnDto) {
    return this.returnsService.inspect(id, dto);
  }

  @Post(':id/restock')
  @UseGuards(createPermissionGuard('Sales.Update'))
  restock(@Param('id') id: string) {
    return this.returnsService.restock(id);
  }

  @Post(':id/reject')
  @UseGuards(createPermissionGuard('Sales.Update'))
  reject(@Param('id') id: string) {
    return this.returnsService.reject(id);
  }

  @Post(':id/close')
  @UseGuards(createPermissionGuard('Sales.Update'))
  close(@Param('id') id: string) {
    return this.returnsService.close(id);
  }
}
