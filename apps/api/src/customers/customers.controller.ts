import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  AddCustomerContactDto,
  AddCustomerAddressDto,
} from './dtos';
import { CustomerStatus } from '@ananya/sales';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: CustomerStatus,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(status, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.customersService.activate(id);
  }

  @Post(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.customersService.suspend(id);
  }

  @Post(':id/contacts')
  addContact(@Param('id') id: string, @Body() dto: AddCustomerContactDto) {
    return this.customersService.addContact(id, dto);
  }

  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: AddCustomerAddressDto) {
    return this.customersService.addAddress(id, dto);
  }
}
