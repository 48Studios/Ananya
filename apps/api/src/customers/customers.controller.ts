import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  AddCustomerContactDto,
  AddCustomerAddressDto,
} from './dtos';
import { CustomerStatus } from '@ananya/sales';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @UseGuards(createPermissionGuard('Sales.Create'))
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Sales.Read'))
  findAll(
    @Query('status') status?: CustomerStatus,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(status, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Sales.Read'))
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post(':id/activate')
  @UseGuards(createPermissionGuard('Sales.Update'))
  activate(@Param('id') id: string) {
    return this.customersService.activate(id);
  }

  @Post(':id/suspend')
  @UseGuards(createPermissionGuard('Sales.Update'))
  suspend(@Param('id') id: string) {
    return this.customersService.suspend(id);
  }

  @Post(':id/contacts')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addContact(@Param('id') id: string, @Body() dto: AddCustomerContactDto) {
    return this.customersService.addContact(id, dto);
  }

  @Post(':id/addresses')
  @UseGuards(createPermissionGuard('Sales.Update'))
  addAddress(@Param('id') id: string, @Body() dto: AddCustomerAddressDto) {
    return this.customersService.addAddress(id, dto);
  }
}
