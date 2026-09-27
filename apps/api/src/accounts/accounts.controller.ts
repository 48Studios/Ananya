import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dtos';
import { AccountType } from '@ananya/finance';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Accounting.Create'))
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findAll(
    @Query('accountType') accountType?: AccountType,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
  ) {
    return this.accountsService.findAll(accountType, isActive, search);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Accounting.Read'))
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Post(':id/activate')
  @UseGuards(createPermissionGuard('Accounting.Update'))
  activate(@Param('id') id: string) {
    return this.accountsService.activate(id);
  }

  @Post(':id/deactivate')
  @UseGuards(createPermissionGuard('Accounting.Update'))
  deactivate(@Param('id') id: string) {
    return this.accountsService.deactivate(id);
  }
}
